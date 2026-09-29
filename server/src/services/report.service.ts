import { CATEGORY_LABELS, type Severity } from '../types/analysis.js';
import { AppError } from '../utils/AppError.js';
import { getAnalysisDetail } from './analysis.service.js';
import { bandForScore, categoryScoreFromFindings, computeOverallScore } from './scoring.service.js';

const PATTERN_CATEGORIES = new Set(['prompt_injection', 'jailbreak', 'information_leakage']);

export const REPORT_DISCLAIMER =
  'Prompt Shield performs rule-based and heuristic analysis. Scores and risk levels are project-defined classifications, not a guarantee of real-world security. Review findings manually before deployment.';

/** Vulnerability report: the analysis plus an executive summary, flattened vulnerabilities and projections. */
export async function buildReport(userId: string, analysisId: string) {
  const analysis = await getAnalysisDetail(userId, analysisId);
  if (analysis.status !== 'COMPLETED' || analysis.overallScore === null) {
    throw AppError.conflict('ANALYSIS_NOT_COMPLETE', 'The report is available once the analysis has completed.');
  }

  const vulnerabilities = analysis.categories.flatMap((category) => category.findings);
  const actionable = vulnerabilities.filter((v) => v.severity !== 'INFO');
  const counts = analysis.severityCounts;

  // What would the score be if every critical and high finding were fixed?
  const projected = computeOverallScore(
    analysis.categories.map((category) => {
      const remaining = category.findings.filter((f) => f.severity !== 'CRITICAL' && f.severity !== 'HIGH');
      return {
        category: category.category,
        score: PATTERN_CATEGORIES.has(category.category) ? categoryScoreFromFindings(remaining) : category.score,
        findings: remaining,
      };
    }),
  );

  const weakest = [...analysis.categories].sort((a, b) => a.score - b.score)[0];
  const severityText = (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Severity[])
    .filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${s.toLowerCase()}`)
    .join(', ');
  const band = bandForScore(analysis.overallScore);

  const executiveSummary = [
    `"${analysis.prompt.title}" (version ${analysis.version.versionNumber}) received a security score of ${analysis.overallScore}/100, rated ${band.rating} (${band.riskLevel} risk).`,
    actionable.length
      ? `The scan identified ${actionable.length} issue${actionable.length > 1 ? 's' : ''} (${severityText}).`
      : 'The scan did not identify any actionable issues.',
    weakest && weakest.score < 90 ? `The weakest area is ${weakest.label} with a score of ${weakest.score}.` : '',
    projected.score > analysis.overallScore
      ? `Resolving all critical and high-severity findings would raise the estimated score to ${projected.score}/100.`
      : '',
    analysis.mode === 'LOCAL'
      ? 'The analysis ran in Local Analysis Mode using deterministic rule-based scanners.'
      : 'The analysis ran in AI Enhanced mode: local scanners plus an external AI review.',
  ]
    .filter(Boolean)
    .join(' ');

  const tokenCategory = analysis.categories.find((c) => c.category === 'token_cost');
  const consistencyCategory = analysis.categories.find((c) => c.category === 'consistency');

  return {
    generatedAt: new Date().toISOString(),
    analysis: {
      id: analysis.id,
      createdAt: analysis.createdAt,
      completedAt: analysis.completedAt,
      durationMs: analysis.durationMs,
      mode: analysis.mode,
      provider: analysis.provider,
      notice: analysis.notice,
    },
    prompt: { ...analysis.prompt, versionNumber: analysis.version.versionNumber, versionId: analysis.version.id },
    promptExcerpt: analysis.version.maskedContent,
    promptStats: analysis.version.stats,
    executiveSummary,
    score: {
      overall: analysis.overallScore,
      rating: band.rating,
      riskLevel: band.riskLevel,
      projectedIfCriticalAndHighFixed: projected.score,
      breakdown: analysis.scoreBreakdown,
    },
    severityCounts: counts,
    categories: analysis.categories.map(({ findings, details: _details, ...category }) => ({
      ...category,
      label: CATEGORY_LABELS[category.category],
      findingCount: findings.filter((f) => f.severity !== 'INFO').length,
    })),
    vulnerabilities,
    recommendations: analysis.recommendations,
    tokenAnalysis: tokenCategory ? { score: tokenCategory.score, explanation: tokenCategory.explanation, ...tokenCategory.details } : null,
    consistencyAnalysis: consistencyCategory
      ? { score: consistencyCategory.score, explanation: consistencyCategory.explanation, ...consistencyCategory.details }
      : null,
    disclaimer: REPORT_DISCLAIMER,
  };
}

export type VulnerabilityReport = Awaited<ReturnType<typeof buildReport>>;
