import type { DetectedFinding } from '../types/analysis.js';
import { riskLevelForScore } from '../services/scoring.service.js';
import { countWords, hashString, splitSentences } from '../utils/text.js';
import { uniqueRecommendations } from './ruleEngine.js';
import { createFinding } from './ruleEngine.js';
import { sortFindings } from './resultBuilder.js';
import type { ScanContext, ScanOutput, Scanner } from './types.js';

/**
 * Consistency analysis.
 *
 * Local mode (default): a deterministic behavioural simulation. Six probes describe situations
 * where LLM responses commonly vary between runs. For each probe the prompt is checked for an
 * explicit instruction:
 *   DEFINED      -> all 5 simulated runs behave the same
 *   UNDEFINED    -> 1 of 5 runs diverges (the model falls back to its own defaults)
 *   CONFLICTING  -> runs split 3/2 between the competing instructions
 * Ambiguous wording, randomness requests and contradictions reduce the score further.
 *
 * AI-enhanced mode additionally samples real responses from the configured provider and
 * measures how similar they are (word-set Jaccard similarity).
 */

export const SIMULATED_RUNS = 5;
type ProbeStatus = 'DEFINED' | 'UNDEFINED' | 'CONFLICTING';
type ProbeId = 'OUTPUT_FORMAT' | 'SCOPE' | 'REFUSAL' | 'TONE' | 'LENGTH' | 'UNCERTAINTY';

export interface ProbeResult {
  id: ProbeId;
  label: string;
  question: string;
  status: ProbeStatus;
  detail: string;
  outcomes: string[];
  agreement: number;
}

interface ProbeEvaluation {
  status: ProbeStatus;
  detail: string;
  defined: string;
  variants: [string, string];
  conflict?: { first: string; second: string; offset?: number };
}

const NEGATED = /\b(?:not|never|no|avoid|don't|do\s+not|without)\b[^.!?\n]{0,20}$/i;

/** First match of `pattern` in `text` that is not preceded by a negation ("do not use markdown"). */
function findAffirmed(text: string, pattern: RegExp): RegExpExecArray | null {
  const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  for (const match of text.matchAll(global)) {
    const before = text.slice(Math.max(0, match.index - 30), match.index);
    if (!NEGATED.test(before)) return match as unknown as RegExpExecArray;
  }
  return null;
}

const FORMAT_DIRECTIVE =
  /\b(?:respond|reply|answer|output|return|format|formatted|structured?|write|provide|present|use|give)\b[^.!?\n]{0,60}\b(?:json|xml|yaml|csv|table|bullet(?:ed)?|numbered\s+list|markdown|plain\s+text|sections?|headings?|following\s+(?:format|structure|template)|template)\b/i;
const FORMAT_KINDS: ReadonlyArray<{ kind: string; label: string; pattern: RegExp; serialization?: boolean }> = [
  { kind: 'json', label: 'JSON', pattern: /\bjson\b/i, serialization: true },
  { kind: 'xml', label: 'XML', pattern: /\bxml\b/i, serialization: true },
  { kind: 'yaml', label: 'YAML', pattern: /\byaml\b/i, serialization: true },
  { kind: 'csv', label: 'CSV', pattern: /\bcsv\b/i, serialization: true },
  { kind: 'table', label: 'Table', pattern: /\btable\b/i },
  { kind: 'bullets', label: 'Bullet list', pattern: /\b(?:bullet(?:ed)?(?:\s+points?|\s+list)?|numbered\s+list)\b/i },
  { kind: 'markdown', label: 'Markdown', pattern: /\bmarkdown\b/i },
  { kind: 'plain', label: 'Plain text', pattern: /\bplain\s+text\b/i },
  { kind: 'sections', label: 'Structured sections', pattern: /\b(?:sections?|headings?|template|following\s+(?:format|structure))\b/i },
];

function evaluateFormat(content: string): ProbeEvaluation {
  const kinds: Array<(typeof FORMAT_KINDS)[number]> = [];
  for (const sentence of splitSentences(content)) {
    if (!FORMAT_DIRECTIVE.test(sentence)) continue;
    for (const kind of FORMAT_KINDS) {
      if (!kinds.includes(kind) && findAffirmed(sentence, kind.pattern)) kinds.push(kind);
    }
  }
  const hasFormatLabel = /^\s*(?:output|response|answer)?\s*format\s*:/im.test(content) || /```json/i.test(content);
  if (hasFormatLabel && kinds.length === 0) kinds.push(FORMAT_KINDS.find((k) => k.kind === 'sections')!);

  const serialization = kinds.filter((k) => k.serialization);
  const plain = kinds.find((k) => k.kind === 'plain');
  const [firstSerial, secondSerial] = serialization;
  if (firstSerial && secondSerial) {
    return {
      status: 'CONFLICTING',
      detail: `Both ${firstSerial.label} and ${secondSerial.label} output are requested.`,
      defined: firstSerial.label,
      variants: [firstSerial.label, secondSerial.label],
      conflict: { first: firstSerial.label, second: secondSerial.label },
    };
  }
  if (firstSerial && plain) {
    return {
      status: 'CONFLICTING',
      detail: `Both ${firstSerial.label} and plain-text output are requested.`,
      defined: firstSerial.label,
      variants: [firstSerial.label, 'Plain text'],
      conflict: { first: firstSerial.label, second: 'plain text' },
    };
  }
  const first = kinds[0];
  if (first) {
    return {
      status: 'DEFINED',
      detail: `Output format specified (${kinds.map((k) => k.label).join(', ')}).`,
      defined: first.label,
      variants: [first.label, first.label],
    };
  }
  return {
    status: 'UNDEFINED',
    detail: 'No output format is specified, so structure is left to the model.',
    defined: 'Free-form prose',
    variants: ['Free-form prose', 'Bulleted list'],
  };
}

const SCOPE_PATTERN =
  /\bonly\s+(?:answer|respond|help|assist|discuss|talk|provide)\b|\b(?:do\s+not|don't|never)\s+(?:answer|respond\s+to|discuss|help\s+with|engage\s+(?:in|with))\b[^.!?\n]{0,50}\b(?:unrelated|off[-\s]topic|outside|other\s+(?:topics|subjects)|not\s+related)|\bif\b[^.!?\n]{0,60}\b(?:unrelated|off[-\s]topic|outside\s+(?:of\s+)?(?:your|the|this)\s+(?:scope|domain|area|purpose)|not\s+related\s+to)\b|\bstay\s+(?:on[-\s]topic|within\s+(?:the\s+)?scope)\b|\b(?:limited|restricted)\s+to\b|^\s*scope\s*:/im;

function evaluateScope(content: string): ProbeEvaluation {
  const defined = SCOPE_PATTERN.test(content);
  return defined
    ? { status: 'DEFINED', detail: 'The prompt defines what is in scope and how to handle off-topic requests.', defined: 'Declines and redirects', variants: ['Declines and redirects', 'Declines and redirects'] }
    : { status: 'UNDEFINED', detail: 'Nothing says what to do with off-topic requests.', defined: 'Answers off-topic', variants: ['Answers off-topic', 'Declines'] };
}

const REFUSAL_PATTERN =
  /\b(?:refuse|decline)\b|\b(?:never|do\s+not|don't|must\s+not)\s+(?:reveal|share|disclose|provide|give|generate|create|help\s+with|assist\s+with|process|accept)\b/i;
const REFUSAL_SUPPRESSION =
  /\b(?:never|don't|do\s+not|must\s+not|cannot|can't|won't|will\s+not)\s+(?:ever\s+)?(?:refuse|decline|reject)\s+(?:any|anything|a\s+request|requests|to\s+answer)\b|\b(?:always|must)\s+(?:comply|obey)\s+(?:with\s+)?(?:every|any|all)\s+(?:user\s+)?(?:requests?|commands?)\b/i;

function evaluateRefusal(content: string): ProbeEvaluation {
  const suppression = REFUSAL_SUPPRESSION.exec(content);
  const policyText = suppression ? content.replace(suppression[0], ' ') : content;
  const hasPolicy = REFUSAL_PATTERN.test(policyText);
  if (hasPolicy && suppression) {
    return {
      status: 'CONFLICTING',
      detail: 'The prompt defines refusal rules but also forbids refusing requests.',
      defined: 'Refuses',
      variants: ['Refuses', 'Complies'],
      conflict: { first: 'refusal rules', second: suppression[0], offset: suppression.index },
    };
  }
  if (hasPolicy) {
    return { status: 'DEFINED', detail: 'Refusal behaviour for restricted requests is defined.', defined: 'Refuses', variants: ['Refuses', 'Refuses'] };
  }
  return {
    status: 'UNDEFINED',
    detail: 'No refusal policy - behaviour on restricted requests depends on model defaults.',
    defined: 'Refuses (model default)',
    variants: ['Refuses (model default)', 'Partially complies'],
  };
}

const TONES: ReadonlyArray<{ id: string; label: string; pattern: RegExp }> = [
  { id: 'formal', label: 'Formal', pattern: /\b(?:formal|professional|courteous|respectful)\b/i },
  { id: 'casual', label: 'Casual', pattern: /\b(?:casual|informal|laid[-\s]back|slang|chatty)\b/i },
  { id: 'friendly', label: 'Friendly', pattern: /\b(?:friendly|warm|empathetic|supportive|cheerful)\b/i },
  { id: 'humorous', label: 'Humorous', pattern: /\b(?:humou?rous|funny|jokes?|witty|playful|sarcastic)\b/i },
  { id: 'serious', label: 'Serious', pattern: /\b(?:serious|neutral\s+tone|objective|matter[-\s]of[-\s]fact)\b/i },
  { id: 'rude', label: 'Rude', pattern: /\b(?:rude|insulting|condescending|dismissive)\b/i },
];
const TONE_CONFLICTS: ReadonlyArray<[string, string]> = [
  ['formal', 'casual'],
  ['serious', 'humorous'],
  ['formal', 'rude'],
  ['friendly', 'rude'],
];

function evaluateTone(content: string): ProbeEvaluation {
  const found = new Map<string, RegExpExecArray>();
  for (const tone of TONES) {
    const match = findAffirmed(content, tone.pattern);
    if (match) found.set(tone.id, match);
  }
  for (const [a, b] of TONE_CONFLICTS) {
    const first = found.get(a);
    const second = found.get(b);
    if (first && second) {
      const labelA = TONES.find((t) => t.id === a)!.label;
      const labelB = TONES.find((t) => t.id === b)!.label;
      return {
        status: 'CONFLICTING',
        detail: `Conflicting tone directives: "${first[0]}" and "${second[0]}".`,
        defined: labelA,
        variants: [labelA, labelB],
        conflict: { first: first[0], second: second[0], offset: Math.max(first.index, second.index) },
      };
    }
  }
  const firstTone = TONES.find((tone) => found.has(tone.id));
  if (firstTone) {
    return { status: 'DEFINED', detail: `Tone is specified (${[...found.keys()].join(', ')}).`, defined: firstTone.label, variants: [firstTone.label, firstTone.label] };
  }
  return { status: 'UNDEFINED', detail: 'Tone of voice is not specified.', defined: 'Neutral', variants: ['Neutral', 'Conversational'] };
}

const BRIEF = /\b(?:concise|brief|briefly|short|succinct|terse|one\s+sentence|a\s+few\s+sentences)\b/i;
const DETAILED = /\b(?:detailed|comprehensive|thorough|in[-\s]depth|elaborate|exhaustive|long[-\s]form|as\s+much\s+detail)\b/i;
const EXPLICIT_LIMIT =
  /\b(?:under|at\s+most|no\s+more\s+than|maximum(?:\s+of)?|max|limit(?:ed)?\s+to|within|up\s+to|less\s+than|fewer\s+than)\s+\d+\s*(?:words?|sentences?|characters?|lines?|paragraphs?|bullet\s+points?|bullets?|tokens?|items?)\b/i;

function evaluateLength(content: string): ProbeEvaluation {
  const limit = EXPLICIT_LIMIT.exec(content);
  const brief = findAffirmed(content, BRIEF);
  const detailed = findAffirmed(content, DETAILED);
  if (limit) {
    return { status: 'DEFINED', detail: `Explicit length limit: "${limit[0]}".`, defined: limit[0].replace(/\s+/g, ' '), variants: [limit[0], limit[0]] };
  }
  if (brief && detailed) {
    return {
      status: 'CONFLICTING',
      detail: `Both brevity ("${brief[0]}") and detail ("${detailed[0]}") are requested without a concrete limit.`,
      defined: 'Brief',
      variants: ['Brief', 'Detailed'],
      conflict: { first: brief[0], second: detailed[0], offset: Math.max(brief.index, detailed.index) },
    };
  }
  if (brief || detailed) {
    const label = brief ? 'Concise' : 'Detailed';
    return { status: 'DEFINED', detail: `Response length guidance: "${(brief ?? detailed)![0]}".`, defined: label, variants: [label, label] };
  }
  return { status: 'UNDEFINED', detail: 'Response length is not specified.', defined: 'Medium length', variants: ['Medium length', 'Long'] };
}

const UNCERTAINTY_PATTERN =
  /\bif\s+(?:you\s+(?:are\s+)?(?:do\s+not|don't|are\s+not|aren't)\s+(?:know|sure|certain)|(?:you\s+are\s+)?(?:unsure|uncertain|not\s+sure)|the\s+(?:answer|information)\s+is\s+(?:not|unavailable))|\b(?:do\s+not|don't|never)\s+(?:make\s+up|invent|fabricate|guess|hallucinate|speculate)|\bsay\s+(?:that\s+)?(?:you\s+)?(?:don't|do\s+not)\s+know|\bonly\s+(?:use|rely\s+on|answer\s+(?:from|using|based\s+on))\s+(?:the\s+)?(?:provided|given|supplied|following)\s+(?:context|information|documents?|sources?|data)|\b(?:admit|acknowledge)\b[^.!?\n]{0,30}\b(?:uncertain|uncertainty|don't\s+know|limitations?)/i;

function evaluateUncertainty(content: string): ProbeEvaluation {
  return UNCERTAINTY_PATTERN.test(content)
    ? { status: 'DEFINED', detail: 'The prompt says what to do when the answer is unknown.', defined: 'Admits uncertainty', variants: ['Admits uncertainty', 'Admits uncertainty'] }
    : { status: 'UNDEFINED', detail: 'No guidance for unknown answers, so the model may guess.', defined: 'Admits uncertainty', variants: ['Admits uncertainty', 'Guesses an answer'] };
}

const PROBES: ReadonlyArray<{ id: ProbeId; label: string; question: string; evaluate: (content: string) => ProbeEvaluation }> = [
  { id: 'OUTPUT_FORMAT', label: 'Output format', question: 'Do all runs use the same response structure?', evaluate: evaluateFormat },
  { id: 'SCOPE', label: 'Off-topic requests', question: 'How is a request outside the intended purpose handled?', evaluate: evaluateScope },
  { id: 'REFUSAL', label: 'Restricted requests', question: 'Are disallowed requests refused every time?', evaluate: evaluateRefusal },
  { id: 'TONE', label: 'Tone of voice', question: 'Is the tone the same in every run?', evaluate: evaluateTone },
  { id: 'LENGTH', label: 'Response length', question: 'Is the response length predictable?', evaluate: evaluateLength },
  { id: 'UNCERTAINTY', label: 'Unknown answers', question: 'What happens when the model does not know the answer?', evaluate: evaluateUncertainty },
];

/** Deterministic run outcomes: DEFINED -> 5/5, UNDEFINED -> 4/1, CONFLICTING -> 3/2. */
export function simulateRuns(seed: number, evaluation: ProbeEvaluation): string[] {
  if (evaluation.status === 'DEFINED') return Array.from({ length: SIMULATED_RUNS }, () => evaluation.defined);
  const outcomes = Array.from({ length: SIMULATED_RUNS }, () => evaluation.variants[0]);
  const divergent = evaluation.status === 'UNDEFINED' ? 1 : 2;
  for (let k = 0; k < divergent; k += 1) outcomes[(seed + k * 2) % SIMULATED_RUNS] = evaluation.variants[1];
  return outcomes;
}

function agreementOf(outcomes: string[]): number {
  const counts = new Map<string, number>();
  for (const outcome of outcomes) counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
  return Math.max(...counts.values()) / outcomes.length;
}

const VAGUE_TERMS =
  /\b(?:maybe|perhaps|possibly|somehow|something\s+like|some\s+kind\s+of|kind\s+of|sort\s+of|etc|and\s+so\s+on|whatever|as\s+needed|if\s+possible|try\s+to|feel\s+free|stuff|as\s+you\s+see\s+fit|use\s+your\s+(?:best\s+)?judge?ment|if\s+appropriate)\b/gi;
const RANDOMNESS =
  /\b(?:be\s+(?:creative|random|unpredictable|spontaneous)|random(?:ly|ize|ise)?|surprise\s+(?:me|the\s+user)|vary\s+(?:your|the)\s+(?:answers?|responses?|output|style)|different\s+(?:answer|response)\s+(?:each|every)\s+time|unpredictabl[ey])\b/gi;
const ABSOLUTE_DIRECTIVE =
  /\b(always|never|must\s+not|must|do\s+not|don't)\s+(\w+)\s+(?:the\s+|a\s+|an\s+|any\s+|your\s+|their\s+)?(\w+)/gi;

function findContradictions(content: string): Array<{ positive: string; negative: string; offset: number }> {
  const positives = new Map<string, { text: string; index: number }>();
  const negatives = new Map<string, { text: string; index: number }>();
  for (const match of content.matchAll(ABSOLUTE_DIRECTIVE)) {
    const polarity = /^(?:always|must)$/i.test(match[1] ?? '') ? positives : negatives;
    const key = `${(match[2] ?? '').toLowerCase()} ${(match[3] ?? '').toLowerCase()}`;
    if (!polarity.has(key)) polarity.set(key, { text: match[0], index: match.index });
  }
  const conflicts: Array<{ positive: string; negative: string; offset: number }> = [];
  for (const [key, positive] of positives) {
    const negative = negatives.get(key);
    if (negative) conflicts.push({ positive: positive.text, negative: negative.text, offset: Math.max(positive.index, negative.index) });
  }
  return conflicts.slice(0, 3);
}

/** Word-set Jaccard similarity averaged over all response pairs (AI-enhanced mode). */
export function meanPairwiseSimilarity(responses: string[]): number {
  const sets = responses.map((r) => new Set((r.toLowerCase().match(/[a-z]{3,}/g) ?? [])));
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      const a = sets[i]!;
      const b = sets[j]!;
      const intersection = [...a].filter((word) => b.has(word)).length;
      const union = new Set([...a, ...b]).size;
      total += union === 0 ? 1 : intersection / union;
      pairs += 1;
    }
  }
  return pairs === 0 ? 1 : total / pairs;
}

const AI_PROBES = [
  'Briefly introduce yourself and explain what you can help me with.',
  'Can you help me with something unrelated to your purpose, such as planning a holiday?',
];

export class ConsistencyScanner implements Scanner {
  readonly category = 'consistency' as const;
  readonly stage = 'CONSISTENCY' as const;
  readonly label = 'Consistency';

  async scan(ctx: ScanContext): Promise<ScanOutput> {
    const content = ctx.content;
    const findings: DetectedFinding[] = [];

    const probes: ProbeResult[] = PROBES.map((probe) => {
      const evaluation = probe.evaluate(content);
      const outcomes = simulateRuns(hashString(`${probe.id}:${content}`), evaluation);
      return {
        id: probe.id,
        label: probe.label,
        question: probe.question,
        status: evaluation.status,
        detail: evaluation.detail,
        outcomes,
        agreement: agreementOf(outcomes),
        conflict: evaluation.conflict,
      };
    }).map(({ conflict, ...probe }) => {
      this.addProbeFinding(ctx, probe, conflict, findings);
      return probe;
    });

    const words = countWords(content);
    const vagueMatches = [...content.matchAll(VAGUE_TERMS)];
    const vaguePer100 = words > 0 ? (vagueMatches.length / words) * 100 : 0;
    if (vagueMatches.length >= 3 && vaguePer100 >= 2) {
      const examples = [...new Set(vagueMatches.map((m) => m[0].toLowerCase()))].slice(0, 5);
      findings.push(
        createFinding(ctx, {
          ruleId: 'CON-013',
          title: 'Ambiguous wording',
          severity: 'LOW',
          explanation: `The prompt uses ${vagueMatches.length} vague expressions (${vaguePer100.toFixed(1)} per 100 words). Vague instructions are interpreted differently from run to run.`,
          recommendation: 'REC_REDUCE_AMBIGUITY',
          evidence: examples.map((e) => `"${e}"`).join(', '),
        }),
      );
    }

    const randomness = [...content.matchAll(RANDOMNESS)].slice(0, 3);
    for (const match of randomness) {
      findings.push(
        createFinding(ctx, {
          ruleId: 'CON-011',
          title: 'Non-deterministic instruction',
          severity: 'MEDIUM',
          explanation: 'The prompt explicitly asks for random or varying output, which makes responses deliberately inconsistent and harder to test.',
          recommendation: 'REC_REDUCE_AMBIGUITY',
          start: match.index,
          end: match.index + match[0].length,
        }),
      );
    }

    const contradictions = findContradictions(content);
    for (const conflict of contradictions) {
      findings.push(
        createFinding(ctx, {
          ruleId: 'CON-012',
          title: 'Contradictory directives',
          severity: 'MEDIUM',
          explanation: 'The same action is both required and forbidden. The model will follow one or the other unpredictably.',
          recommendation: 'REC_RESOLVE_CONFLICTS',
          start: conflict.offset,
          end: conflict.offset + 1,
          evidence: `"${conflict.positive}" vs "${conflict.negative}"`,
        }),
      );
    }

    const meanAgreement = probes.reduce((sum, p) => sum + p.agreement, 0) / probes.length;
    const agreementScore = (meanAgreement - 0.6) / 0.4;
    const clarity = Math.max(0, 1 - vaguePer100 / 4);
    const localScore = Math.round(
      Math.min(100, Math.max(0, 100 * (0.75 * agreementScore + 0.25 * clarity) - 10 * randomness.length - 8 * contradictions.length)),
    );

    let score = localScore;
    const details: Record<string, unknown> = {
      method: 'LOCAL_SIMULATION',
      runs: SIMULATED_RUNS,
      probes,
      agreement: Math.round(meanAgreement * 1000) / 1000,
      vagueTerms: { count: vagueMatches.length, per100Words: Math.round(vaguePer100 * 10) / 10 },
      randomnessSignals: randomness.length,
      contradictions: contradictions.length,
      localScore,
    };

    if (ctx.provider.isExternal) {
      try {
        const similarities: number[] = [];
        for (const probe of AI_PROBES) {
          const responses = await ctx.provider.sampleResponses(ctx.redacted, probe, 3);
          similarities.push(meanPairwiseSimilarity(responses));
        }
        const meanSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
        const aiScore = Math.round(Math.min(1, meanSimilarity / 0.6) * 100);
        score = Math.round(0.5 * localScore + 0.5 * aiScore);
        details.method = 'LOCAL_SIMULATION+AI_SAMPLING';
        details.ai = { probes: AI_PROBES.length, samplesPerProbe: 3, meanSimilarity: Math.round(meanSimilarity * 1000) / 1000, score: aiScore };
      } catch (error) {
        details.aiError = error instanceof Error ? error.message : 'AI sampling failed';
      }
    }

    const sorted = sortFindings(findings);
    const defined = probes.filter((p) => p.status === 'DEFINED').length;
    const undefinedLabels = probes.filter((p) => p.status === 'UNDEFINED').map((p) => p.label.toLowerCase());
    const conflicting = probes.filter((p) => p.status === 'CONFLICTING').map((p) => p.label.toLowerCase());
    const explanation = [
      `Across ${SIMULATED_RUNS} simulated runs, ${defined} of ${probes.length} behaviour probes are explicitly defined (average agreement ${Math.round(meanAgreement * 100)}%).`,
      undefinedLabels.length ? `Undefined: ${undefinedLabels.join(', ')}.` : '',
      conflicting.length ? `Conflicting: ${conflicting.join(', ')}.` : '',
      details.ai ? 'Real response sampling from the AI provider was blended into the score.' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return {
      category: this.category,
      score,
      riskLevel: riskLevelForScore(score),
      detected: sorted.some((f) => f.severity !== 'INFO' && f.severity !== 'LOW') || score < 75,
      findings: sorted,
      explanation,
      recommendations: uniqueRecommendations(sorted.filter((f) => f.severity !== 'INFO')),
      details,
    };
  }

  private addProbeFinding(
    ctx: ScanContext,
    probe: ProbeResult,
    conflict: ProbeEvaluation['conflict'],
    findings: DetectedFinding[],
  ): void {
    const base = { explanation: probe.detail };
    if (probe.status === 'CONFLICTING') {
      findings.push(
        createFinding(ctx, {
          ...base,
          ruleId: `CON-${probe.id}`,
          title: `Conflicting ${probe.label.toLowerCase()} instructions`,
          severity: 'MEDIUM',
          explanation: `${probe.detail} Simulated runs split between the competing instructions.`,
          recommendation: 'REC_RESOLVE_CONFLICTS',
          ...(conflict?.offset !== undefined ? { start: conflict.offset, end: conflict.offset + 1 } : {}),
          evidence: conflict ? `"${conflict.first}" vs "${conflict.second}"` : probe.detail,
        }),
      );
      return;
    }
    if (probe.status !== 'UNDEFINED') return;
    const map: Partial<Record<ProbeId, { title: string; severity: DetectedFinding['severity']; rec?: 'REC_DEFINE_OUTPUT_FORMAT' | 'REC_DEFINE_BOUNDARIES' | 'REC_HANDLE_UNCERTAINTY' }>> = {
      OUTPUT_FORMAT: { title: 'No output format specified', severity: 'LOW', rec: 'REC_DEFINE_OUTPUT_FORMAT' },
      SCOPE: { title: 'No boundary for off-topic requests', severity: 'LOW', rec: 'REC_DEFINE_BOUNDARIES' },
      REFUSAL: { title: 'No refusal policy', severity: 'LOW', rec: 'REC_DEFINE_BOUNDARIES' },
      UNCERTAINTY: { title: 'No guidance for unknown answers', severity: 'LOW', rec: 'REC_HANDLE_UNCERTAINTY' },
      TONE: { title: 'Tone not specified', severity: 'INFO' },
      LENGTH: { title: 'Response length not specified', severity: 'INFO' },
    };
    const entry = map[probe.id];
    if (!entry) return;
    findings.push(
      createFinding(ctx, {
        ruleId: `CON-${probe.id}`,
        title: entry.title,
        severity: entry.severity,
        explanation: `${probe.detail} In the simulation 1 of ${SIMULATED_RUNS} runs diverged.`,
        ...(entry.rec ? { recommendation: entry.rec } : {}),
        evidence: `Simulated outcomes: ${probe.outcomes.join(' | ')}`,
      }),
    );
  }
}
