import { performance } from 'node:perf_hooks';
import type { GeneratedRecommendation, ScannerResult, StageKey } from '../types/analysis.js';
import { STAGES } from '../types/analysis.js';
import type { AIProvider, AIReviewFinding } from '../services/ai/AIProvider.js';
import { computeOverallScore, type OverallScore } from '../services/scoring.service.js';
import { generateRecommendations } from '../services/recommendation.service.js';
import { buildLineIndex, foldText } from '../utils/text.js';
import { ConsistencyScanner } from './ConsistencyScanner.js';
import { InjectionScanner } from './InjectionScanner.js';
import { JailbreakScanner } from './JailbreakScanner.js';
import { LeakageScanner } from './LeakageScanner.js';
import { detectSensitiveSpans, redactText } from './patterns/leakage.patterns.js';
import { TokenCostScanner } from './TokenCostScanner.js';
import type { ScanContext, Scanner } from './types.js';

/**
 * Scanner registry. Scanners run in this order and each one is a pipeline stage.
 * To add a new check: implement the Scanner interface and append it here.
 */
export const SCANNERS: readonly Scanner[] = [
  new InjectionScanner(),
  new JailbreakScanner(),
  new LeakageScanner(),
  new ConsistencyScanner(),
  new TokenCostScanner(),
];

export function createScanContext(content: string, provider: AIProvider): ScanContext {
  const sensitiveSpans = detectSensitiveSpans(content);
  const redacted = redactText(content, sensitiveSpans);
  let review: Promise<AIReviewFinding[]> | null = null;
  return {
    content,
    redacted,
    folded: foldText(content),
    lineStarts: buildLineIndex(content),
    sensitiveSpans,
    provider,
    // Only the redacted prompt is ever sent to an external provider.
    getAIReview: () => {
      if (!provider.isExternal) return Promise.resolve([]);
      review ??= provider.reviewPrompt(redacted);
      return review;
    },
  };
}

export interface StageHooks {
  onStageStart?: (stage: StageKey, label: string) => Promise<void> | void;
  onStageComplete?: (stage: StageKey, summary: string, durationMs: number) => Promise<void> | void;
}

export interface SecurityScanResult {
  results: ScannerResult[];
  overall: OverallScore;
  recommendations: GeneratedRecommendation[];
  aiUsed: boolean;
  aiErrors: string[];
}

const round = (value: number) => Math.round(value * 100) / 100;
const labelOf = (stage: StageKey) => STAGES.find((s) => s.key === stage)?.label ?? stage;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Run the complete analysis pipeline: context -> scanners -> scoring -> recommendations. */
export async function runSecurityScan(
  content: string,
  provider: AIProvider,
  hooks: StageHooks = {},
): Promise<SecurityScanResult> {
  async function stage<T>(key: StageKey, work: () => Promise<{ value: T; summary: string }>): Promise<T> {
    await hooks.onStageStart?.(key, labelOf(key));
    const started = performance.now();
    const { value, summary } = await work();
    await hooks.onStageComplete?.(key, summary, round(performance.now() - started));
    return value;
  }

  const ctx = await stage('INITIALIZING', async () => {
    const context = createScanContext(content, provider);
    return {
      value: context,
      summary: `${content.length.toLocaleString('en-US')} characters prepared, ${plural(context.sensitiveSpans.length, 'sensitive value')} pre-masked (${provider.isExternal ? `AI provider: ${provider.name}` : 'Local Analysis Mode'})`,
    };
  });

  const results: ScannerResult[] = [];
  for (const scanner of SCANNERS) {
    const result = await stage(scanner.stage, async () => {
      const started = performance.now();
      const output = await scanner.scan(ctx);
      const actionable = output.findings.filter((f) => f.severity !== 'INFO').length;
      return {
        value: { ...output, durationMs: round(performance.now() - started) },
        summary: `${plural(actionable, 'finding')}, score ${output.score}/100`,
      };
    });
    results.push(result);
  }

  const overall = await stage('SCORING', async () => {
    const score = computeOverallScore(results);
    return {
      value: score,
      summary: `Security score ${score.score}/100 (${score.rating})${score.cap !== null ? `, capped because ${score.capReason}` : ''}`,
    };
  });

  const recommendations = await stage('RECOMMENDATIONS', async () => {
    const generated = generateRecommendations(results);
    return { value: generated, summary: `${plural(generated.length, 'recommendation')} generated` };
  });

  const aiErrors = [
    ...new Set(results.map((r) => r.details.aiError).filter((e): e is string => typeof e === 'string')),
  ];
  const aiUsed =
    provider.isExternal &&
    (aiErrors.length === 0 ||
      results.some((r) => r.findings.some((f) => f.source === 'AI') || r.details.method === 'LOCAL_SIMULATION+AI_SAMPLING'));

  return { results, overall, recommendations, aiUsed, aiErrors };
}
