import type { Category, DetectedFinding, RecommendationCode } from '../types/analysis.js';
import { maskSensitiveText } from './patterns/leakage.patterns.js';
import { createFinding } from './ruleEngine.js';
import type { ScanContext } from './types.js';

const AI_RULE_IDS: Record<string, string> = {
  prompt_injection: 'AI-INJ',
  jailbreak: 'AI-JB',
  information_leakage: 'AI-LEAK',
};

const AI_RECOMMENDATIONS: Record<string, RecommendationCode> = {
  prompt_injection: 'REC_INSTRUCTION_HIERARCHY',
  jailbreak: 'REC_REVIEW_ROLE_OVERRIDES',
  information_leakage: 'REC_REMOVE_SECRETS',
};

export interface AIFindingsResult {
  findings: DetectedFinding[];
  error?: string;
}

/**
 * Findings from the optional AI review (AI-enhanced mode only).
 * AI findings are advisory: severity is capped at HIGH and evidence is re-masked.
 */
export async function aiFindingsFor(ctx: ScanContext, category: Category): Promise<AIFindingsResult> {
  if (!ctx.provider.isExternal) return { findings: [] };
  try {
    const review = await ctx.getAIReview();
    return {
      findings: review
        .filter((item) => item.category === category)
        .map((item) =>
          createFinding(ctx, {
            ruleId: AI_RULE_IDS[category] ?? 'AI',
            title: `AI review: ${item.title}`,
            severity: item.severity === 'CRITICAL' ? 'HIGH' : item.severity,
            explanation: item.explanation,
            evidence: maskSensitiveText(item.evidence).slice(0, 180),
            recommendation: AI_RECOMMENDATIONS[category],
            source: 'AI',
          }),
        ),
    };
  } catch (error) {
    return { findings: [], error: error instanceof Error ? error.message : 'AI review failed' };
  }
}
