import { prisma } from '../lib/prisma.js';
import {
  analysisSummaryInclude,
  emptySeverityCounts,
  toAnalysisSummary,
  toRecommendationDTO,
} from '../models/analysis.model.js';
import { CATEGORIES, CATEGORY_LABELS, SEVERITIES, type Severity } from '../types/analysis.js';
import { parseJson } from '../utils/json.js';
import { getAIStatus } from './ai/aiService.js';
import { bandForScore } from './scoring.service.js';

const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const average = (values: number[]) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null);

/** Dashboard metrics, all computed from stored analyses (nothing is hard-coded). */
export async function getDashboardSummary(userId: string) {
  const [promptCount, versionCount, analyses] = await Promise.all([
    prisma.prompt.count({ where: { userId } }),
    prisma.promptVersion.count({ where: { prompt: { userId } } }),
    prisma.analysis.findMany({
      where: { promptVersion: { prompt: { userId } } },
      orderBy: { createdAt: 'desc' },
      include: analysisSummaryInclude,
    }),
  ]);

  const summaries = analyses.map(toAnalysisSummary);
  const completed = summaries.filter((a) => a.status === 'COMPLETED' && a.overallScore !== null);

  // "Current posture" = latest completed analysis of each prompt
  const latestPerPrompt = new Map<string, (typeof completed)[number]>();
  for (const analysis of completed) {
    if (!latestPerPrompt.has(analysis.prompt.id)) latestPerPrompt.set(analysis.prompt.id, analysis);
  }
  const latest = [...latestPerPrompt.values()];
  const postureScore = average(latest.map((a) => a.overallScore as number));

  const categories = CATEGORIES.map((category) => {
    const score = average(latest.map((a) => a.categoryScores[category]).filter((s): s is number => typeof s === 'number'));
    return {
      category,
      label: CATEGORY_LABELS[category],
      averageScore: score,
      riskLevel: score === null ? null : bandForScore(score).riskLevel,
    };
  });

  const bySeverity = emptySeverityCounts();
  for (const analysis of latest) {
    for (const severity of SEVERITIES) bySeverity[severity] += analysis.severityCounts[severity];
  }

  const tokenValues = latest.map((a) => a.estimatedTokens).filter((t): t is number => typeof t === 'number');
  const tokenDetails = analyses
    .filter((a) => latest.some((l) => l.id === a.id))
    .map((a) => parseJson<{ sizeClass?: string }>(a.categoryResults.find((c) => c.category === 'token_cost')?.details, {}));

  const today = new Date();
  const activity = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (13 - index));
    const key = dayKey(date);
    return { date: key, count: summaries.filter((a) => a.createdAt.slice(0, 10) === key).length };
  });

  return {
    totals: {
      prompts: promptCount,
      versions: versionCount,
      analyses: summaries.length,
      completedAnalyses: completed.length,
    },
    posture:
      postureScore === null
        ? null
        : {
            score: postureScore,
            rating: bandForScore(postureScore).rating,
            riskLevel: bandForScore(postureScore).riskLevel,
            promptsAnalyzed: latest.length,
          },
    categories,
    vulnerabilities: {
      total: bySeverity.CRITICAL + bySeverity.HIGH + bySeverity.MEDIUM + bySeverity.LOW,
      bySeverity,
    },
    recommendations: { total: latest.reduce((sum, a) => sum + a.recommendationCount, 0) },
    tokenUsage: {
      averageTokens: average(tokenValues),
      maxTokens: tokenValues.length ? Math.max(...tokenValues) : null,
      sizeClasses: {
        LOW: tokenDetails.filter((d) => d.sizeClass === 'LOW').length,
        MEDIUM: tokenDetails.filter((d) => d.sizeClass === 'MEDIUM').length,
        HIGH: tokenDetails.filter((d) => d.sizeClass === 'HIGH').length,
      },
    },
    trend: [...completed]
      .reverse()
      .slice(-20)
      .map((a) => ({
        id: a.id,
        date: a.createdAt,
        score: a.overallScore as number,
        label: `${a.prompt.title} v${a.version.versionNumber}`,
      })),
    activity,
    recentAnalyses: summaries.slice(0, 6),
    analysisMode: getAIStatus(),
  };
}

const priorityRank = (priority: string) => SEVERITIES.indexOf(priority as Severity);

/** Recommendations from the latest completed analysis of every prompt. */
export async function getRecommendationsOverview(userId: string) {
  const analyses = await prisma.analysis.findMany({
    where: { status: 'COMPLETED', promptVersion: { prompt: { userId } } },
    orderBy: { createdAt: 'desc' },
    include: {
      recommendations: true,
      promptVersion: { select: { versionNumber: true, prompt: { select: { id: true, title: true } } } },
    },
  });

  const seen = new Set<string>();
  const items = [];
  for (const analysis of analyses) {
    const prompt = analysis.promptVersion.prompt;
    if (seen.has(prompt.id)) continue;
    seen.add(prompt.id);
    for (const rec of analysis.recommendations) {
      items.push({
        ...toRecommendationDTO(rec),
        prompt,
        versionNumber: analysis.promptVersion.versionNumber,
        analysisId: analysis.id,
        analysisScore: analysis.overallScore,
      });
    }
  }
  items.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));

  const byPriority = emptySeverityCounts();
  for (const item of items) byPriority[item.priority] += 1;
  return { items, total: items.length, byPriority };
}
