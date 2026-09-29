import { diffLines, diffWordsWithSpace } from 'diff';
import { COMPARISON_TOLERANCE } from '../config/scoring.js';
import { prisma } from '../lib/prisma.js';
import { maskSensitiveText } from '../scanners/patterns/leakage.patterns.js';
import { CATEGORIES, CATEGORY_LABELS, type Category, type Severity } from '../types/analysis.js';
import { AppError } from '../utils/AppError.js';
import { getTextStats } from '../utils/tokens.js';

export interface DiffSegment {
  type: 'same' | 'added' | 'removed';
  text: string;
}

export interface DiffRow {
  type: 'unchanged' | 'added' | 'removed' | 'modified';
  oldNumber?: number;
  newNumber?: number;
  text?: string;
  oldText?: string;
  newText?: string;
  segments?: DiffSegment[];
}

const toLines = (value: string) => {
  const lines = value.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
};

/** Line diff with word-level detail for changed lines. */
export function buildDiff(before: string, after: string) {
  const parts = diffLines(before, after);
  const rows: DiffRow[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    const next = parts[i + 1];
    if (part.removed && next?.added) {
      const removed = toLines(part.value);
      const added = toLines(next.value);
      const paired = Math.min(removed.length, added.length);
      for (let k = 0; k < paired; k += 1) {
        const oldText = removed[k] ?? '';
        const newText = added[k] ?? '';
        rows.push({
          type: 'modified',
          oldNumber: oldLine++,
          newNumber: newLine++,
          oldText,
          newText,
          segments: diffWordsWithSpace(oldText, newText).map((s) => ({
            type: s.added ? 'added' : s.removed ? 'removed' : 'same',
            text: s.value,
          })),
        });
      }
      for (const text of removed.slice(paired)) rows.push({ type: 'removed', oldNumber: oldLine++, text });
      for (const text of added.slice(paired)) rows.push({ type: 'added', newNumber: newLine++, text });
      i += 1;
      continue;
    }
    for (const text of toLines(part.value)) {
      if (part.added) rows.push({ type: 'added', newNumber: newLine++, text });
      else if (part.removed) rows.push({ type: 'removed', oldNumber: oldLine++, text });
      else rows.push({ type: 'unchanged', oldNumber: oldLine++, newNumber: newLine++, text });
    }
  }

  const count = (type: DiffRow['type']) => rows.filter((r) => r.type === type).length;
  return {
    rows,
    stats: { added: count('added'), removed: count('removed'), modified: count('modified'), unchanged: count('unchanged') },
  };
}

interface ComparableFinding {
  ruleId: string;
  title: string;
  severity: string;
  evidence: string;
  startOffset: number | null;
  endOffset: number | null;
}

/** Identity of a vulnerability across versions: rule + the (masked) text it matched. */
function fingerprint(finding: ComparableFinding, maskedContent: string): string {
  if (finding.startOffset !== null && finding.endOffset !== null) {
    const matched = maskedContent.slice(finding.startOffset, finding.endOffset).toLowerCase().replace(/\s+/g, ' ').trim();
    if (matched) return `${finding.ruleId}|${matched}`;
  }
  return `${finding.ruleId}|${finding.title}`;
}

export async function compareVersions(userId: string, promptId: string, fromNumber?: number, toNumber?: number) {
  const prompt = await prisma.prompt.findFirst({
    where: { id: promptId, userId },
    include: {
      versions: {
        orderBy: { versionNumber: 'asc' },
        include: {
          analyses: {
            where: { status: 'COMPLETED' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { categoryResults: { include: { findings: true } } },
          },
        },
      },
    },
  });
  if (!prompt) throw AppError.notFound('PROMPT_NOT_FOUND', 'Prompt not found.');
  if (prompt.versions.length < 2) {
    throw AppError.unprocessable('NOT_ENOUGH_VERSIONS', 'Save at least two versions of this prompt to compare them.');
  }

  const last = prompt.versions.at(-1)!;
  const to = toNumber ?? last.versionNumber;
  const from = fromNumber ?? prompt.versions.filter((v) => v.versionNumber < to).at(-1)?.versionNumber ?? prompt.versions[0]!.versionNumber;
  if (from === to) throw AppError.badRequest('INVALID_COMPARISON', 'Choose two different versions to compare.');

  const versionA = prompt.versions.find((v) => v.versionNumber === from);
  const versionB = prompt.versions.find((v) => v.versionNumber === to);
  if (!versionA || !versionB) throw AppError.notFound('VERSION_NOT_FOUND', 'One of the selected versions does not exist.');

  const maskedA = maskSensitiveText(versionA.content);
  const maskedB = maskSensitiveText(versionB.content);
  const analysisA = versionA.analyses[0] ?? null;
  const analysisB = versionB.analyses[0] ?? null;

  const scoreOf = (analysis: typeof analysisA, category: Category) =>
    analysis?.categoryResults.find((c) => c.category === category)?.score ?? null;
  const delta = (a: number | null, b: number | null) => (a === null || b === null ? null : b - a);

  const metrics = [
    { key: 'overall', label: 'Security Score', from: analysisA?.overallScore ?? null, to: analysisB?.overallScore ?? null },
    ...CATEGORIES.map((category) => ({
      key: category,
      label: category === 'token_cost' ? 'Token Efficiency' : CATEGORY_LABELS[category],
      from: scoreOf(analysisA, category),
      to: scoreOf(analysisB, category),
    })),
  ].map((metric) => ({ ...metric, delta: delta(metric.from, metric.to) }));

  const tokensA = getTextStats(versionA.content).estimatedTokens;
  const tokensB = getTextStats(versionB.content).estimatedTokens;

  const collect = (analysis: typeof analysisA, masked: string) => {
    const map = new Map<string, { ruleId: string; title: string; severity: Severity; category: Category; categoryLabel: string; evidence: string }>();
    for (const result of analysis?.categoryResults ?? []) {
      for (const finding of result.findings) {
        if (finding.severity === 'INFO') continue;
        const category = result.category as Category;
        map.set(fingerprint(finding, masked), {
          ruleId: finding.ruleId,
          title: finding.title,
          severity: finding.severity as Severity,
          category,
          categoryLabel: CATEGORY_LABELS[category],
          evidence: finding.evidence,
        });
      }
    }
    return map;
  };

  const findingsA = collect(analysisA, maskedA);
  const findingsB = collect(analysisB, maskedB);
  const bothAnalyzed = !!analysisA && !!analysisB;
  const vulnerabilities = {
    introduced: bothAnalyzed ? [...findingsB].filter(([key]) => !findingsA.has(key)).map(([, v]) => v) : [],
    removed: bothAnalyzed ? [...findingsA].filter(([key]) => !findingsB.has(key)).map(([, v]) => v) : [],
    persisting: bothAnalyzed ? [...findingsB].filter(([key]) => findingsA.has(key)).map(([, v]) => v) : [],
  };

  const scoreDelta = delta(analysisA?.overallScore ?? null, analysisB?.overallScore ?? null);
  const verdict =
    scoreDelta === null
      ? 'NOT_ANALYZED'
      : scoreDelta > COMPARISON_TOLERANCE
        ? 'IMPROVED'
        : scoreDelta < -COMPARISON_TOLERANCE
          ? 'WORSENED'
          : 'UNCHANGED';

  const summary =
    verdict === 'NOT_ANALYZED'
      ? `Version ${!analysisA ? from : to} has not been analysed yet. Run an analysis to compare security scores.`
      : verdict === 'IMPROVED'
        ? `Version ${to} improved the security score by ${scoreDelta} points and removed ${vulnerabilities.removed.length} issue(s).`
        : verdict === 'WORSENED'
          ? `Version ${to} lowered the security score by ${Math.abs(scoreDelta ?? 0)} points and introduced ${vulnerabilities.introduced.length} issue(s).`
          : `The security score is effectively unchanged between version ${from} and version ${to}.`;

  const describe = (version: typeof versionA, analysis: typeof analysisA) => ({
    id: version.id,
    versionNumber: version.versionNumber,
    changeNote: version.changeNote,
    createdAt: version.createdAt.toISOString(),
    analysisId: analysis?.id ?? null,
    score: analysis?.overallScore ?? null,
    riskLevel: analysis?.riskLevel ?? null,
  });

  return {
    prompt: { id: prompt.id, title: prompt.title },
    versions: prompt.versions.map((v) => describe(v, v.analyses[0] ?? null)),
    from: describe(versionA, analysisA),
    to: describe(versionB, analysisB),
    verdict,
    scoreDelta,
    summary,
    metrics,
    tokens: { from: tokensA, to: tokensB, delta: tokensB - tokensA },
    diff: buildDiff(maskedA, maskedB),
    vulnerabilities,
  };
}
