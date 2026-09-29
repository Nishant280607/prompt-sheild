import { env } from '../config/env.js';
import { TOKEN_THRESHOLDS } from '../config/scoring.js';
import type { DetectedFinding } from '../types/analysis.js';
import { riskLevelForScore } from '../services/scoring.service.js';
import { getTextStats } from '../utils/tokens.js';
import { splitSentences } from '../utils/text.js';
import { createFinding, uniqueRecommendations } from './ruleEngine.js';
import { sortFindings } from './resultBuilder.js';
import type { ScanContext, ScanOutput, Scanner } from './types.js';

export type SizeClass = 'LOW' | 'MEDIUM' | 'HIGH';

export function classifySize(tokens: number): SizeClass {
  if (tokens >= TOKEN_THRESHOLDS.highFrom) return 'HIGH';
  if (tokens >= TOKEN_THRESHOLDS.mediumFrom) return 'MEDIUM';
  return 'LOW';
}

/** Efficiency score from prompt size: 100 up to 400 tokens, 60 at 2,000, 30 at 6,000, floor 20. */
export function sizeEfficiencyScore(tokens: number): number {
  if (tokens <= 400) return 100;
  if (tokens <= 2000) return 100 - ((tokens - 400) / 1600) * 40;
  if (tokens <= 6000) return 60 - ((tokens - 2000) / 4000) * 30;
  return Math.max(20, 30 - ((tokens - 6000) / 1000) * 2);
}

const normalizeSentence = (sentence: string) =>
  sentence.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

export class TokenCostScanner implements Scanner {
  readonly category = 'token_cost' as const;
  readonly stage = 'TOKEN_COST' as const;
  readonly label = 'Token Cost';

  async scan(ctx: ScanContext): Promise<ScanOutput> {
    const content = ctx.content;
    const stats = getTextStats(content);
    const tokens = stats.estimatedTokens;
    const sizeClass = classifySize(tokens);
    const findings: DetectedFinding[] = [];

    if (sizeClass !== 'LOW') {
      findings.push(
        createFinding(ctx, {
          ruleId: 'TOK-001',
          title: sizeClass === 'HIGH' ? 'Large prompt' : 'Moderately large prompt',
          severity: sizeClass === 'HIGH' ? 'MEDIUM' : 'LOW',
          explanation: `The prompt is estimated at ${tokens.toLocaleString('en-US')} tokens. Every request pays for these tokens and long prompts reduce the context left for user input and answers.`,
          recommendation: 'REC_REDUCE_CONTEXT',
          evidence: `~${tokens.toLocaleString('en-US')} tokens (${sizeClass} size class)`,
        }),
      );
    }

    // Repeated instructions (sentences of 4+ words that appear more than once)
    const occurrences = new Map<string, { count: number; original: string }>();
    for (const sentence of splitSentences(content)) {
      const key = normalizeSentence(sentence);
      if (key.split(' ').length < 4) continue;
      const entry = occurrences.get(key) ?? { count: 0, original: sentence };
      entry.count += 1;
      occurrences.set(key, entry);
    }
    const repeated = [...occurrences.values()].filter((entry) => entry.count > 1);
    for (const entry of repeated.slice(0, 3)) {
      const first = content.indexOf(entry.original);
      const second = first === -1 ? -1 : content.indexOf(entry.original, first + entry.original.length);
      findings.push(
        createFinding(ctx, {
          ruleId: 'TOK-002',
          title: 'Repeated instruction',
          severity: 'LOW',
          explanation: `This sentence appears ${entry.count} times. Repetition adds cost without adding information.`,
          recommendation: 'REC_DEDUPLICATE_INSTRUCTIONS',
          ...(second !== -1 ? { start: second, end: second + entry.original.length } : {}),
          evidence: `"${entry.original.slice(0, 120)}" (x${entry.count})`,
        }),
      );
    }

    const wordList = content.toLowerCase().match(/\p{L}{2,}/gu) ?? [];
    const uniqueWordRatio = wordList.length ? new Set(wordList).size / wordList.length : 1;
    const lowDiversity = wordList.length >= 150 && uniqueWordRatio < 0.35;
    if (lowDiversity) {
      findings.push(
        createFinding(ctx, {
          ruleId: 'TOK-003',
          title: 'Highly repetitive wording',
          severity: 'LOW',
          explanation: `Only ${Math.round(uniqueWordRatio * 100)}% of the words are unique. The same content can usually be expressed with far fewer tokens.`,
          recommendation: 'REC_REDUCE_CONTEXT',
          evidence: `${new Set(wordList).size} unique of ${wordList.length} words`,
        }),
      );
    }

    const lines = content.split('\n');
    const longLineIndex = lines.findIndex((line) => line.length > 800);
    if (longLineIndex !== -1) {
      const start = lines.slice(0, longLineIndex).reduce((sum, line) => sum + line.length + 1, 0);
      findings.push(
        createFinding(ctx, {
          ruleId: 'TOK-004',
          title: 'Large embedded data block',
          severity: 'LOW',
          explanation: 'A very long line (usually pasted data, JSON or encoded content) inflates the prompt. Reference data is cheaper to supply through retrieval only when needed.',
          recommendation: 'REC_EXTERNALISE_DATA',
          start,
          end: start + 80,
        }),
      );
    }

    const blankLines = lines.filter((line) => !line.trim()).length;
    if (lines.length >= 20 && blankLines / lines.length > 0.3) {
      findings.push(
        createFinding(ctx, {
          ruleId: 'TOK-005',
          title: 'Excess whitespace',
          severity: 'INFO',
          explanation: `${blankLines} of ${lines.length} lines are blank. Whitespace is cheap but not free.`,
          evidence: `${Math.round((blankLines / lines.length) * 100)}% blank lines`,
        }),
      );
    }

    let score = sizeEfficiencyScore(tokens);
    score -= Math.min(20, repeated.length * 5);
    if (lowDiversity) score -= 10;
    if (longLineIndex !== -1) score -= 5;
    score = Math.round(Math.min(100, Math.max(0, score)));

    const relativeCost = Math.round((tokens / TOKEN_THRESHOLDS.baselineTokens) * 100) / 100;
    const costPer1kCallsUsd = Math.round(((tokens * 1000) / 1_000_000) * env.TOKEN_PRICE_PER_MILLION_USD * 10000) / 10000;
    const sorted = sortFindings(findings);

    return {
      category: this.category,
      score,
      riskLevel: riskLevelForScore(score),
      detected: sizeClass !== 'LOW' || repeated.length > 0 || lowDiversity,
      findings: sorted,
      explanation: `Estimated ${tokens.toLocaleString('en-US')} tokens (${sizeClass} size class), about ${relativeCost}x the cost of a ${TOKEN_THRESHOLDS.baselineTokens}-token baseline prompt.${repeated.length ? ` ${repeated.length} repeated instruction${repeated.length > 1 ? 's' : ''} found.` : ''} Token counts are estimates.`,
      recommendations: uniqueRecommendations(sorted),
      details: {
        ...stats,
        sizeClass,
        relativeCost,
        baselineTokens: TOKEN_THRESHOLDS.baselineTokens,
        costPer1kCallsUsd,
        pricePerMillionUsd: env.TOKEN_PRICE_PER_MILLION_USD,
        repeatedSentences: repeated.length,
        uniqueWordRatio: Math.round(uniqueWordRatio * 100) / 100,
        thresholds: { mediumFrom: TOKEN_THRESHOLDS.mediumFrom, highFrom: TOKEN_THRESHOLDS.highFrom },
        estimateNote:
          'Estimated with a heuristic (about 4 characters or 0.75 words per token for English). Real tokenizer counts vary by model.',
      },
    };
  }
}
