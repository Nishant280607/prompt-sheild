import type { Prisma } from '../lib/prisma.js';
import { maskSensitiveText } from '../scanners/patterns/leakage.patterns.js';
import { bandForScore, computeOverallScore } from '../services/scoring.service.js';
import type { Category, Severity, StageEvent } from '../types/analysis.js';
import { CATEGORIES, CATEGORY_LABELS, SEVERITIES } from '../types/analysis.js';
import { parseJson } from '../utils/json.js';
import { getTextStats } from '../utils/tokens.js';

/** Data-transfer mappers: convert database rows into the JSON shapes returned by the API. */

export const analysisSummaryInclude = {
  promptVersion: {
    select: { id: true, versionNumber: true, prompt: { select: { id: true, title: true, category: true } } },
  },
  categoryResults: { select: { category: true, score: true, riskLevel: true, details: true, findings: { select: { severity: true } } } },
  _count: { select: { recommendations: true } },
} satisfies Prisma.AnalysisInclude;

export const analysisDetailInclude = {
  promptVersion: { include: { prompt: true } },
  categoryResults: { include: { findings: true } },
  recommendations: true,
} satisfies Prisma.AnalysisInclude;

export type AnalysisSummaryRow = Prisma.AnalysisGetPayload<{ include: typeof analysisSummaryInclude }>;
export type AnalysisDetailRow = Prisma.AnalysisGetPayload<{ include: typeof analysisDetailInclude }>;

const severityRank = (severity: string) => SEVERITIES.indexOf(severity as Severity);

export function emptySeverityCounts(): Record<Severity, number> {
  return { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
}

function countSeverities(categoryResults: ReadonlyArray<{ findings: ReadonlyArray<{ severity: string }> }>) {
  const counts = emptySeverityCounts();
  for (const result of categoryResults) {
    for (const finding of result.findings) {
      if (finding.severity in counts) counts[finding.severity as Severity] += 1;
    }
  }
  return counts;
}

export function toAnalysisSummary(row: AnalysisSummaryRow) {
  const counts = countSeverities(row.categoryResults);
  const vulnerabilityCount = counts.CRITICAL + counts.HIGH + counts.MEDIUM + counts.LOW;
  const tokenDetails = parseJson<{ estimatedTokens?: number }>(
    row.categoryResults.find((c) => c.category === 'token_cost')?.details,
    {},
  );
  return {
    id: row.id,
    status: row.status,
    mode: row.mode,
    provider: row.provider,
    overallScore: row.overallScore,
    riskLevel: row.riskLevel,
    rating: row.overallScore === null ? null : bandForScore(row.overallScore).rating,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
    prompt: row.promptVersion.prompt,
    version: { id: row.promptVersion.id, versionNumber: row.promptVersion.versionNumber },
    categoryScores: Object.fromEntries(row.categoryResults.map((c) => [c.category, c.score])) as Partial<Record<Category, number>>,
    estimatedTokens: tokenDetails.estimatedTokens ?? null,
    severityCounts: counts,
    vulnerabilityCount,
    recommendationCount: row._count.recommendations,
  };
}
export type AnalysisSummaryDTO = ReturnType<typeof toAnalysisSummary>;

export function toFindingDTO(finding: AnalysisDetailRow['categoryResults'][number]['findings'][number], category: Category) {
  return {
    id: finding.id,
    ruleId: finding.ruleId,
    category,
    categoryLabel: CATEGORY_LABELS[category],
    title: finding.title,
    severity: finding.severity as Severity,
    evidence: finding.evidence,
    explanation: finding.explanation,
    line: finding.line,
    column: finding.column,
    startOffset: finding.startOffset,
    endOffset: finding.endOffset,
    source: finding.source,
  };
}
export type FindingDTO = ReturnType<typeof toFindingDTO>;

export function toRecommendationDTO(rec: AnalysisDetailRow['recommendations'][number]) {
  return {
    id: rec.id,
    code: rec.code,
    category: rec.category as Category | null,
    priority: rec.priority as Severity,
    title: rec.title,
    description: rec.description,
    actions: parseJson<string[]>(rec.actions, []),
    relatedRuleIds: parseJson<string[]>(rec.relatedRuleIds, []),
  };
}
export type RecommendationDTO = ReturnType<typeof toRecommendationDTO>;

export function toAnalysisDetail(row: AnalysisDetailRow) {
  const content = row.promptVersion.content;
  const categories = CATEGORIES.map((category) => row.categoryResults.find((c) => c.category === category))
    .filter((c): c is AnalysisDetailRow['categoryResults'][number] => !!c)
    .map((result) => {
      const category = result.category as Category;
      return {
        category,
        label: CATEGORY_LABELS[category],
        score: result.score,
        riskLevel: result.riskLevel,
        rating: bandForScore(result.score).rating,
        detected: result.detected,
        weight: result.weight,
        explanation: result.explanation,
        durationMs: result.durationMs,
        details: parseJson<Record<string, unknown>>(result.details, {}),
        findings: [...result.findings]
          .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || (a.startOffset ?? 0) - (b.startOffset ?? 0))
          .map((f) => toFindingDTO(f, category)),
      };
    });

  const breakdown =
    categories.length > 0
      ? computeOverallScore(categories.map((c) => ({ category: c.category, score: c.score, findings: c.findings })))
      : null;
  const counts = countSeverities(row.categoryResults);

  return {
    id: row.id,
    status: row.status,
    mode: row.mode,
    provider: row.provider,
    overallScore: row.overallScore,
    riskLevel: row.riskLevel,
    rating: row.overallScore === null ? null : bandForScore(row.overallScore).rating,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
    currentStage: row.currentStage,
    stages: parseJson<StageEvent[]>(row.stageLog, []),
    notice: row.errorMessage,
    prompt: {
      id: row.promptVersion.prompt.id,
      title: row.promptVersion.prompt.title,
      category: row.promptVersion.prompt.category,
      description: row.promptVersion.prompt.description,
    },
    version: {
      id: row.promptVersion.id,
      versionNumber: row.promptVersion.versionNumber,
      changeNote: row.promptVersion.changeNote,
      createdAt: row.promptVersion.createdAt.toISOString(),
      maskedContent: maskSensitiveText(content),
      stats: getTextStats(content),
    },
    scoreBreakdown: breakdown
      ? { weightedAverage: breakdown.weightedAverage, cap: breakdown.cap, capReason: breakdown.capReason, weights: breakdown.weights }
      : null,
    severityCounts: counts,
    vulnerabilityCount: counts.CRITICAL + counts.HIGH + counts.MEDIUM + counts.LOW,
    categories,
    recommendations: [...row.recommendations]
      .sort((a, b) => severityRank(a.priority) - severityRank(b.priority))
      .map(toRecommendationDTO),
  };
}
export type AnalysisDetailDTO = ReturnType<typeof toAnalysisDetail>;
