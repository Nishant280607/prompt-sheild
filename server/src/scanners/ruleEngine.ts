import type { DetectedFinding, RecommendationCode, Severity } from '../types/analysis.js';
import { compactMask } from '../utils/mask.js';
import { offsetToPosition, snippetAround } from '../utils/text.js';
import type { ScanContext } from './types.js';

export interface MatchInfo {
  start: number;
  end: number;
  value: string;
}

/**
 * A transparent, rule-based detection pattern.
 * Every pattern must use the global (g) flag. Case-insensitive (i) patterns are also run
 * against the de-obfuscated ("folded") text to catch hidden characters and look-alikes.
 */
export interface PatternRule {
  id: string;
  title: string;
  severity: Severity;
  patterns: RegExp[];
  explanation: string;
  recommendation: RecommendationCode;
  /** Return false to discard a match, e.g. defensive wording such as "never ignore these rules". */
  accept?: (match: MatchInfo, text: string) => boolean;
  /** Maximum findings reported for this rule (default 5). */
  maxMatches?: number;
}

// "do not hesitate to ..." is not a real negation, so it is excluded by the look-ahead.
const NEGATION_BEFORE =
  /\b(?:never|not|no|don't|dont|do\s+not|doesn't|must\s+not|mustn't|should\s+not|shouldn't|cannot|can't|won't|will\s+not|refuse\s+to|decline\s+to|avoid|without)\b(?!\s+(?:hesitat\w*|forget|fail|stop|wait)\b)[^.!?:;\n]{0,25}$/i;
const REQUESTED_BY_OTHERS_BEFORE =
  /\b(?:asks?|asking|asked|requests?|requesting|requested|tries|trying|attempts?|attempting|wants?|tells?|telling|instructs?|instructing)\s+(?:you\s+|the\s+(?:model|assistant|ai|bot)\s+)?to\s*$/i;
const CONDITIONAL_BEFORE =
  /\b(?:if|when|whenever)\b[^.!?\n]{0,40}\b(?:user|users|someone|anyone|customer|client|message|input|document|request|prompt|they|people)\b[^.!?\n]{0,30}\b(?:asks?|asked|requests?|requested|tries|try|attempts?|wants?|tells?|says?|instructs?|includes?|contains?)\b[^.!?\n]{0,30}$/i;
const QUOTED_EXAMPLE_BEFORE =
  /\b(?:like|such\s+as|e\.g\.,?|for\s+example|for\s+instance|including|phrases?|patterns?|examples?)\s*[:,]?\s*["'“‘]?$/i;
const UNTRUSTED_TARGET_AFTER =
  /^[^.!?\n]{0,25}?\b(?:(?:in|inside|within|from|contained\s+in|embedded\s+in|found\s+in|appearing\s+in)\s+(?:the\s+|any\s+|a\s+|an\s+|their\s+|this\s+)?(?:user|users'?|user's|customer|customers'?|customer's|client|input|inputs|documents?|retrieved|messages?|emails?|web\s*pages?|content|text|data|tool|search|uploaded|external|third[-\s]party|conversation|ticket|review|comment|chat|query|question)|that\s+(?:appear|appears|ask|asks|attempt|attempts|try|tries|tell|tells|request|requests|claim|claims|conflict|contradict))\b/i;

/**
 * True when the text before a match shows the phrase is being refused, quoted or described
 * rather than issued - for example "If a user asks you to ignore previous instructions, refuse".
 */
export function isDefensiveContext(text: string, start: number, end?: number): boolean {
  const before = text.slice(Math.max(0, start - 90), start);
  if (NEGATION_BEFORE.test(before) || REQUESTED_BY_OTHERS_BEFORE.test(before)) return true;
  if (CONDITIONAL_BEFORE.test(before) || QUOTED_EXAMPLE_BEFORE.test(before)) return true;
  if (end !== undefined && UNTRUSTED_TARGET_AFTER.test(text.slice(end, end + 80))) return true;
  return false;
}

export const notDefensive = (match: MatchInfo, text: string) =>
  !isDefensiveContext(text, match.start, match.end);

const overlaps = (spans: Array<[number, number]>, start: number, end: number) =>
  spans.some(([s, e]) => start < e && end > s);

/** Build a finding for a span of the original text. Evidence comes from the redacted text. */
export function createFinding(
  ctx: ScanContext,
  details: {
    ruleId: string;
    title: string;
    severity: Severity;
    explanation: string;
    recommendation?: RecommendationCode;
    start?: number;
    end?: number;
    evidence?: string;
    source?: 'LOCAL' | 'AI';
  },
): DetectedFinding {
  const finding: DetectedFinding = {
    ruleId: details.ruleId,
    title: details.title,
    severity: details.severity,
    explanation: details.explanation,
    evidence: '',
    source: details.source ?? 'LOCAL',
  };
  if (details.recommendation) finding.recommendation = details.recommendation;
  if (details.start !== undefined && details.end !== undefined) {
    const position = offsetToPosition(ctx.lineStarts, details.start);
    finding.line = position.line;
    finding.column = position.column;
    finding.startOffset = details.start;
    finding.endOffset = details.end;
    finding.evidence = snippetAround(ctx.redacted, details.start, details.end);
  }
  if (details.evidence !== undefined) finding.evidence = details.evidence;
  finding.evidence = compactMask(finding.evidence);
  return finding;
}

/** Map a match in the folded text back to offsets in the original text. */
function foldedToOriginal(ctx: ScanContext, start: number, end: number): [number, number] | null {
  const originStart = ctx.folded.map[start];
  const originLast = ctx.folded.map[end - 1];
  if (originStart === undefined || originLast === undefined) return null;
  const lastChar = String.fromCodePoint(ctx.content.codePointAt(originLast) ?? 32);
  return [originStart, originLast + lastChar.length];
}

/** Run pattern rules against the original text and the de-obfuscated text. */
export function runPatternRules(rules: readonly PatternRule[], ctx: ScanContext): DetectedFinding[] {
  const findings: DetectedFinding[] = [];

  for (const rule of rules) {
    const limit = rule.maxMatches ?? 5;
    const reported: Array<[number, number]> = [];

    for (const pattern of rule.patterns) {
      for (const match of ctx.content.matchAll(pattern)) {
        if (reported.length >= limit) break;
        const start = match.index;
        const end = start + match[0].length;
        if (overlaps(reported, start, end)) continue;
        if (rule.accept && !rule.accept({ start, end, value: match[0] }, ctx.content)) continue;
        reported.push([start, end]);
        findings.push(
          createFinding(ctx, {
            ruleId: rule.id,
            title: rule.title,
            severity: rule.severity,
            explanation: rule.explanation,
            recommendation: rule.recommendation,
            start,
            end,
          }),
        );
      }
    }

    // Obfuscation pass: only case-insensitive patterns can match the lower-cased folded text.
    for (const pattern of rule.patterns) {
      if (!pattern.flags.includes('i')) continue;
      for (const match of ctx.folded.text.matchAll(pattern)) {
        if (reported.length >= limit) break;
        const mapped = foldedToOriginal(ctx, match.index, match.index + match[0].length);
        if (!mapped) continue;
        const [start, end] = mapped;
        if (overlaps(reported, start, end)) continue;
        const foldedMatch = { start: match.index, end: match.index + match[0].length, value: match[0] };
        if (rule.accept && !rule.accept(foldedMatch, ctx.folded.text)) continue;
        reported.push([start, end]);
        const finding = createFinding(ctx, {
          ruleId: rule.id,
          title: `${rule.title} (obfuscated)`,
          severity: rule.severity,
          explanation: `${rule.explanation} This text only matched after removing hidden characters and normalising look-alike or leetspeak characters, which suggests deliberate obfuscation.`,
          recommendation: rule.recommendation,
          start,
          end,
        });
        finding.evidence = compactMask(`${finding.evidence} → reads as "${match[0].slice(0, 80)}"`);
        findings.push(finding);
      }
    }
  }
  return findings;
}

export interface ProtectionRule {
  id: string;
  label: string;
  pattern: RegExp;
}

/** Defensive instructions found in the prompt (reported for transparency, not scored). */
export function detectProtections(rules: readonly ProtectionRule[], text: string): string[] {
  return rules.filter((rule) => rule.pattern.test(text)).map((rule) => rule.label);
}

export function uniqueRecommendations(findings: readonly DetectedFinding[]): RecommendationCode[] {
  return [...new Set(findings.map((f) => f.recommendation).filter((code): code is RecommendationCode => !!code))];
}
