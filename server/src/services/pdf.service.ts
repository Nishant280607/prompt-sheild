import PDFDocument from 'pdfkit';
import type { VulnerabilityReport } from './report.service.js';

type Doc = InstanceType<typeof PDFDocument>;

const COLORS = {
  ink: '#0f172a',
  muted: '#64748b',
  line: '#e2e8f0',
  panel: '#f8fafc',
  brand: '#0891b2',
  header: '#0b1120',
  CRITICAL: '#dc2626',
  HIGH: '#ea580c',
  MEDIUM: '#d97706',
  LOW: '#2563eb',
  INFO: '#64748b',
  MINIMAL: '#059669',
} as const;

const scoreColor = (score: number) =>
  score >= 90 ? '#059669' : score >= 75 ? '#0891b2' : score >= 50 ? '#d97706' : score >= 25 ? '#ea580c' : '#dc2626';

/** Standard PDF fonts only support Latin-1, so replace other characters with readable equivalents. */
export function pdfSafe(value: unknown): string {
  return String(value ?? '')
    .replace(/[…]/g, '...')
    .replace(/[–—]/g, '-')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/→/g, '->')
    .replace(/[•·]/g, '-')
    .replace(/≈/g, '~')
    .replace(/[^\n\t\x20-\x7E\xA0-\xFF]/g, '?');
}

function ensureSpace(doc: Doc, height: number) {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom - 20) doc.addPage();
}

function sectionTitle(doc: Doc, title: string) {
  ensureSpace(doc, 50);
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.ink).text(title, doc.page.margins.left);
  const y = doc.y + 3;
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).lineWidth(0.7).strokeColor(COLORS.line).stroke();
  doc.moveDown(0.6);
}

function drawShield(doc: Doc, x: number, y: number, size: number) {
  const s = size / 24;
  doc.save().translate(x, y).scale(s);
  doc.path('M12 2 L20 5 V11 C20 16.5 16.6 20.4 12 22 C7.4 20.4 4 16.5 4 11 V5 Z').fillColor(COLORS.brand).fill();
  doc.path('M8.5 10.5 L11 13 L15.5 8.5').lineWidth(2).strokeColor('#ffffff').stroke();
  doc.restore();
}

function drawScoreRing(doc: Doc, cx: number, cy: number, radius: number, score: number) {
  doc.circle(cx, cy, radius).lineWidth(9).strokeColor(COLORS.line).stroke();
  if (score > 0) {
    const angle = (Math.min(score, 99.9) / 100) * Math.PI * 2;
    const start = { x: cx, y: cy - radius };
    const end = { x: cx + radius * Math.sin(angle), y: cy - radius * Math.cos(angle) };
    const largeArc = angle > Math.PI ? 1 : 0;
    doc
      .path(`M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`)
      .lineWidth(9)
      .lineCap('round')
      .strokeColor(scoreColor(score))
      .stroke();
  }
  doc.font('Helvetica-Bold').fontSize(26).fillColor(COLORS.ink).text(String(score), cx - radius, cy - 16, { width: radius * 2, align: 'center' });
  doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text('/ 100', cx - radius, cy + 12, { width: radius * 2, align: 'center' });
}

function keyValueRows(doc: Doc, rows: Array<[string, string]>, x: number, width: number) {
  for (const [key, value] of rows) {
    const y = doc.y;
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(key, x, y, { width: 95 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ink).text(pdfSafe(value), x + 100, y, { width: width - 100 });
    doc.moveDown(0.35);
  }
}

function chip(doc: Doc, label: string, x: number, y: number, color: string) {
  const width = doc.font('Helvetica-Bold').fontSize(7).widthOfString(label) + 10;
  doc.roundedRect(x, y, width, 13, 3).fillColor(color).fill();
  doc.fillColor('#ffffff').text(label, x + 5, y + 3.5, { lineBreak: false });
  return width;
}

/** Render the vulnerability report as a PDF and resolve with the complete file. */
export function generateReportPdf(report: VulnerabilityReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 55, left: 50, right: 50 },
      bufferPages: true,
      info: {
        Title: pdfSafe(`Prompt Shield report - ${report.prompt.title}`),
        Author: 'Prompt Shield',
        Subject: 'LLM prompt security analysis',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const contentWidth = doc.page.width - left - doc.page.margins.right;

    // Header band
    doc.rect(0, 0, doc.page.width, 92).fill(COLORS.header);
    drawShield(doc, left, 26, 38);
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#ffffff').text('PROMPT SHIELD', left + 50, 30);
    doc.font('Helvetica').fontSize(10).fillColor('#94a3b8').text('LLM Prompt Security Analysis Report', left + 50, 53);
    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(`Generated ${new Date(report.generatedAt).toUTCString()}`, left, 38, {
      width: contentWidth,
      align: 'right',
    });
    doc.y = 115;

    // Summary block: metadata + score ring
    const metaTop = doc.y;
    keyValueRows(
      doc,
      [
        ['Prompt', report.prompt.title],
        ['Version', `v${report.prompt.versionNumber}`],
        ['Category', report.prompt.category.replace(/_/g, ' ')],
        ['Analysis ID', report.analysis.id],
        ['Analysed at', new Date(report.analysis.completedAt ?? report.analysis.createdAt).toUTCString()],
        ['Analysis mode', report.analysis.mode === 'LOCAL' ? 'Local Analysis Mode' : `AI Enhanced (${report.analysis.provider})`],
        ['Overall risk', `${report.score.rating} - ${report.score.riskLevel} risk`],
      ],
      left,
      contentWidth - 150,
    );
    drawScoreRing(doc, left + contentWidth - 60, metaTop + 55, 48, report.score.overall);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(scoreColor(report.score.overall)).text(report.score.rating.toUpperCase(), left + contentWidth - 120, metaTop + 112, {
      width: 120,
      align: 'center',
    });
    doc.y = Math.max(doc.y, metaTop + 130);

    sectionTitle(doc, 'Executive summary');
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.ink).text(pdfSafe(report.executiveSummary), { lineGap: 2 });

    sectionTitle(doc, 'Category scores');
    for (const category of report.categories) {
      ensureSpace(doc, 24);
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.ink).text(category.label, left, y, { width: 130 });
      doc.roundedRect(left + 135, y + 1, 250, 8, 4).fillColor(COLORS.line).fill();
      doc.roundedRect(left + 135, y + 1, Math.max(4, (250 * category.score) / 100), 8, 4).fillColor(scoreColor(category.score)).fill();
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.ink).text(`${category.score}`, left + 395, y, { width: 30, align: 'right' });
      doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted).text(`${category.riskLevel} | ${category.findingCount} issue(s) | weight ${Math.round(category.weight * 100)}%`, left + 432, y + 0.5, {
        width: contentWidth - 432,
      });
      doc.y = y + 18;
    }
    if (report.score.breakdown?.cap !== null && report.score.breakdown?.cap !== undefined) {
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(COLORS.muted).text(
        pdfSafe(`Weighted average ${report.score.breakdown.weightedAverage}; score capped at ${report.score.breakdown.cap} because ${report.score.breakdown.capReason}.`),
        left,
      );
    }

    sectionTitle(doc, `Findings (${report.vulnerabilities.length})`);
    if (report.vulnerabilities.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted).text('No findings were detected.');
    }
    for (const finding of report.vulnerabilities.slice(0, 60)) {
      ensureSpace(doc, 70);
      const y = doc.y;
      const width = chip(doc, finding.severity, left, y, COLORS[finding.severity]);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.ink).text(pdfSafe(finding.title), left + width + 6, y + 1.5, { width: contentWidth - width - 110 });
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(
        `${finding.ruleId} | ${finding.categoryLabel}${finding.line ? ` | line ${finding.line}` : ''}`,
        left,
        y + 2,
        { width: contentWidth, align: 'right' },
      );
      doc.y = Math.max(doc.y, y + 17);
      if (finding.evidence) {
        doc.font('Courier').fontSize(8).fillColor('#334155').text(pdfSafe(finding.evidence), left + 8, doc.y, { width: contentWidth - 16 });
      }
      doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted).text(pdfSafe(finding.explanation), left + 8, doc.y + 2, { width: contentWidth - 16, lineGap: 1 });
      doc.moveDown(0.7);
    }

    sectionTitle(doc, 'Recommendations');
    for (const [index, rec] of report.recommendations.entries()) {
      ensureSpace(doc, 60);
      const y = doc.y;
      const width = chip(doc, rec.priority, left, y, COLORS[rec.priority]);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.ink).text(pdfSafe(`${index + 1}. ${rec.title}`), left + width + 6, y + 1);
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(pdfSafe(rec.description), left + 8, doc.y + 2, { width: contentWidth - 16 });
      for (const action of rec.actions) {
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.ink).text(pdfSafe(`- ${action}`), left + 16, doc.y + 1, { width: contentWidth - 24 });
      }
      doc.moveDown(0.6);
    }

    if (report.tokenAnalysis) {
      const t = report.tokenAnalysis as Record<string, unknown>;
      sectionTitle(doc, 'Token analysis (estimates)');
      keyValueRows(
        doc,
        [
          ['Characters', String(t.characters ?? '-')],
          ['Words', String(t.words ?? '-')],
          ['Estimated tokens', String(t.estimatedTokens ?? '-')],
          ['Size class', String(t.sizeClass ?? '-')],
          ['Relative cost', `${String(t.relativeCost ?? '-')}x a ${String(t.baselineTokens ?? 500)}-token baseline`],
          ['Illustrative cost', `$${String(t.costPer1kCallsUsd ?? '-')} per 1,000 calls at $${String(t.pricePerMillionUsd ?? '-')} / 1M tokens`],
        ],
        left,
        contentWidth,
      );
      doc.font('Helvetica-Oblique').fontSize(8).fillColor(COLORS.muted).text(pdfSafe(t.estimateNote ?? ''), left);
    }

    if (report.consistencyAnalysis) {
      const c = report.consistencyAnalysis as Record<string, unknown> & {
        probes?: Array<{ label: string; status: string; agreement: number; outcomes: string[] }>;
      };
      sectionTitle(doc, 'Consistency analysis');
      doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.ink).text(pdfSafe(c.explanation ?? ''), left, doc.y, { width: contentWidth });
      doc.moveDown(0.5);
      for (const probe of c.probes ?? []) {
        ensureSpace(doc, 18);
        const y = doc.y;
        doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ink).text(pdfSafe(probe.label), left, y, { width: 120 });
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(probe.status, left + 125, y, { width: 80 });
        doc.text(`${Math.round(probe.agreement * 100)}% agreement`, left + 210, y, { width: 90 });
        doc.font('Courier').fontSize(7.5).text(pdfSafe(probe.outcomes.join(' | ')), left + 305, y + 1, { width: contentWidth - 305 });
        doc.y = Math.max(doc.y, y + 14);
      }
    }

    sectionTitle(doc, 'Prompt (sensitive values masked)');
    const excerpt = report.promptExcerpt.length > 2500 ? `${report.promptExcerpt.slice(0, 2500)}\n... (truncated)` : report.promptExcerpt;
    doc.font('Courier').fontSize(8).fillColor('#334155').text(pdfSafe(excerpt), left, doc.y, { width: contentWidth, lineGap: 1 });

    // Footer on every page
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = doc.page.height - 38;
      doc.moveTo(left, y - 6).lineTo(left + contentWidth, y - 6).lineWidth(0.5).strokeColor(COLORS.line).stroke();
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted).text(pdfSafe(report.disclaimer), left, y, { width: contentWidth - 80 });
      doc.text(`Page ${i + 1} of ${range.count}`, left, y, { width: contentWidth, align: 'right' });
      doc.page.margins.bottom = bottom;
    }

    doc.end();
  });
}
