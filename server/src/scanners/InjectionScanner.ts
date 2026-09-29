import type { DetectedFinding } from '../types/analysis.js';
import { codePointLabel, INVISIBLE_CHARS_GLOBAL, TAG_CHARS_GLOBAL } from '../utils/text.js';
import { aiFindingsFor } from './aiFindings.js';
import { INJECTION_PROTECTIONS, INJECTION_RULES, USER_CONTENT_PLACEHOLDER } from './patterns/injection.patterns.js';
import { maskSensitiveText } from './patterns/leakage.patterns.js';
import { buildPatternResult } from './resultBuilder.js';
import { createFinding, detectProtections, runPatternRules } from './ruleEngine.js';
import type { ScanContext, ScanOutput, Scanner } from './types.js';

type InvisibleClass = 'bidi' | 'zeroWidth' | 'directionMark' | 'softHyphen' | 'invisibleOperator';

function classifyInvisible(char: string): InvisibleClass {
  const code = char.codePointAt(0) ?? 0;
  if ((code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) return 'bidi';
  if (code === 0x200e || code === 0x200f) return 'directionMark';
  if (code === 0x00ad) return 'softHyphen';
  if (code >= 0x2061 && code <= 0x2064) return 'invisibleOperator';
  return 'zeroWidth';
}

const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const isNonLatinLetter = (char: string) => /\p{L}/u.test(char) && !/[A-Za-zÀ-ɏ]/.test(char);

/** Zero-width joiners are legitimate inside emoji sequences and some non-Latin scripts. */
function isLegitimateJoiner(text: string, index: number): boolean {
  const code = text.charCodeAt(index);
  if (code !== 0x200d && code !== 0x200c) return false;
  const before = text.slice(Math.max(0, index - 2), index);
  const after = text.slice(index + 1, index + 3);
  return (
    PICTOGRAPHIC.test(before + after) ||
    isNonLatinLetter(before.slice(-1)) ||
    isNonLatinLetter(after.slice(0, 1))
  );
}

const INVISIBLE_META: Record<InvisibleClass, { title: string; severity: DetectedFinding['severity']; explanation: string }> = {
  bidi: {
    title: 'Bidirectional control characters',
    severity: 'HIGH',
    explanation:
      'Unicode bidirectional override characters change the order in which text is displayed ("Trojan Source"). What a reviewer sees can differ from what the model reads.',
  },
  zeroWidth: {
    title: 'Hidden zero-width characters',
    severity: 'HIGH',
    explanation:
      'Invisible zero-width characters were found. They are used to hide instructions from human reviewers or to split keywords so filters miss them.',
  },
  directionMark: {
    title: 'Invisible direction marks',
    severity: 'LOW',
    explanation:
      'Left-to-right/right-to-left marks were found. They are normal in right-to-left languages but are invisible and can hide text boundaries.',
  },
  softHyphen: {
    title: 'Soft hyphen characters',
    severity: 'LOW',
    explanation: 'Invisible soft hyphens were found. They can split words so keyword filters no longer match them.',
  },
  invisibleOperator: {
    title: 'Invisible mathematical operators',
    severity: 'MEDIUM',
    explanation: 'Invisible operator characters (U+2061-U+2064) were found. They have no legitimate use in natural-language prompts.',
  },
};

function detectHiddenCharacters(ctx: ScanContext): DetectedFinding[] {
  const findings: DetectedFinding[] = [];
  const groups = new Map<InvisibleClass, { count: number; first: number; codes: Set<string> }>();

  for (const match of ctx.content.matchAll(INVISIBLE_CHARS_GLOBAL)) {
    if (isLegitimateJoiner(ctx.content, match.index)) continue;
    if (match.index === 0 && match[0] === '\uFEFF') continue; // byte order mark at file start
    const kind = classifyInvisible(match[0]);
    const group = groups.get(kind) ?? { count: 0, first: match.index, codes: new Set<string>() };
    group.count += 1;
    group.codes.add(codePointLabel(match[0]));
    groups.set(kind, group);
  }

  for (const [kind, group] of groups) {
    const meta = INVISIBLE_META[kind];
    const finding = createFinding(ctx, {
      ruleId: 'INJ-006',
      title: meta.title,
      severity: meta.severity,
      explanation: meta.explanation,
      recommendation: 'REC_REMOVE_HIDDEN_CONTENT',
      start: group.first,
      end: group.first + 1,
    });
    finding.evidence = `${group.count} invisible character${group.count > 1 ? 's' : ''} (${[...group.codes].join(', ')}) - first near: ${finding.evidence}`;
    findings.push(finding);
  }

  for (const match of ctx.content.matchAll(TAG_CHARS_GLOBAL)) {
    const decoded = [...match[0]]
      .map((char) => (char.codePointAt(0) ?? 0) - 0xe0000)
      .filter((code) => code >= 0x20 && code <= 0x7e)
      .map((code) => String.fromCharCode(code))
      .join('');
    if (!decoded.trim()) continue;
    findings.push(
      createFinding(ctx, {
        ruleId: 'INJ-006',
        title: 'Invisible tag-character text (ASCII smuggling)',
        severity: 'HIGH',
        explanation:
          'Unicode tag characters encode text that is completely invisible to people but can be read by language models. This technique is used to smuggle hidden instructions.',
        recommendation: 'REC_REMOVE_HIDDEN_CONTENT',
        start: match.index,
        end: match.index + match[0].length,
        evidence: `Hidden text decodes to: "${maskSensitiveText(decoded).slice(0, 120)}"`,
      }),
    );
  }
  return findings;
}

const INSTRUCTION_WORDS =
  /\b(?:ignore|disregard|instructions?|system\s+prompt|jailbreak|bypass|override|reveal|password|you\s+are\s+now|developer\s+mode|pretend)\b/i;

function detectEncodedPayloads(ctx: ScanContext): DetectedFinding[] {
  const findings: DetectedFinding[] = [];
  const base64 = /(?<![A-Za-z0-9+/=])[A-Za-z0-9+/]{24,}={0,2}(?![A-Za-z0-9+/=])/g;
  let inspected = 0;
  for (const match of ctx.content.matchAll(base64)) {
    if (inspected++ >= 20) break;
    const candidate = match[0];
    if (candidate.replace(/=+$/, '').length % 4 === 1) continue;
    let decoded: string;
    try {
      decoded = Buffer.from(candidate, 'base64').toString('utf8');
    } catch {
      continue;
    }
    const printable = decoded.replace(/[^\x20-\x7E\n\t]/g, '');
    if (decoded.length < 12 || printable.length / decoded.length < 0.92) continue;
    const words = decoded.match(/[A-Za-z]{2,}/g) ?? [];
    const isInstruction = INSTRUCTION_WORDS.test(decoded);
    if (!isInstruction && words.length < 3) continue;
    const finding = createFinding(ctx, {
      ruleId: 'INJ-008',
      title: isInstruction ? 'Encoded instruction (Base64)' : 'Encoded natural-language text',
      severity: isInstruction ? 'HIGH' : 'LOW',
      explanation: isInstruction
        ? 'A Base64 string decodes to instruction-like text. Encoding is used to hide injected instructions from reviewers and keyword filters while models can still decode them.'
        : 'A Base64 string decodes to readable text. Encoded text cannot be reviewed at a glance and may hide instructions.',
      recommendation: 'REC_REMOVE_HIDDEN_CONTENT',
      start: match.index,
      end: match.index + candidate.length,
    });
    finding.evidence = `${finding.evidence} → decodes to "${maskSensitiveText(decoded).replace(/\s+/g, ' ').slice(0, 100)}"`;
    findings.push(finding);
  }
  return findings;
}

const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*\}\}|\$\{([A-Za-z_][\w.]*)\}|(?<!\{)\{([A-Za-z_]\w*)\}(?!\})/g;
const DELIMITER_LINE = /^\s*(?:```\w*|"""|'''|-{3,}|={3,}|#{3,}.*|<\/?[\w-]+>|\[(?:BEGIN|START|END)[^\]]*\]|<<<.*|>>>.*)\s*$/i;

function nearestNonEmptyLine(lines: string[], from: number, step: number): string | undefined {
  for (let i = from; i >= 0 && i < lines.length; i += step) {
    if ((lines[i] ?? '').trim()) return lines[i];
  }
  return undefined;
}

/** A placeholder is considered delimited when quotes, tags or fence lines clearly wrap it. */
function isDelimited(ctx: ScanContext, start: number, end: number): boolean {
  const lineStartIndex = ctx.content.lastIndexOf('\n', start - 1) + 1;
  const lineEndIndex = ctx.content.indexOf('\n', end);
  const lineEnd = lineEndIndex === -1 ? ctx.content.length : lineEndIndex;
  const before = ctx.content.slice(lineStartIndex, start).trimEnd();
  const after = ctx.content.slice(end, lineEnd).trimStart();
  if (/["'`“«]$|<[\w-]+>$|\[[\w\s-]*\]:?$/.test(before) && /^["'`”»]|^<\/[\w-]+>|^\[/.test(after)) return true;

  const window = ctx.content.slice(Math.max(0, start - 300), Math.min(ctx.content.length, end + 300));
  const offset = Math.max(0, start - 300);
  const openTag = /<([A-Za-z][\w-]*)>/g;
  for (const tag of window.matchAll(openTag)) {
    const tagStart = offset + tag.index;
    const closeIndex = ctx.content.indexOf(`</${tag[1]}>`, end);
    if (tagStart < start && closeIndex !== -1 && closeIndex - end < 300) return true;
  }

  const lines = ctx.content.split('\n');
  const lineNumber = ctx.content.slice(0, start).split('\n').length - 1;
  const previous = nearestNonEmptyLine(lines, lineNumber - 1, -1);
  const next = nearestNonEmptyLine(lines, lineNumber + 1, 1);
  return !!previous && !!next && DELIMITER_LINE.test(previous) && DELIMITER_LINE.test(next);
}

function detectUndelimitedPlaceholders(ctx: ScanContext, protections: string[]): DetectedFinding[] {
  const findings: DetectedFinding[] = [];
  const hasDataRule = protections.some((p) => /untrusted|data, not instructions/i.test(p));
  const seen = new Set<string>();
  for (const match of ctx.content.matchAll(PLACEHOLDER)) {
    const name = match[1] ?? match[2] ?? match[3] ?? '';
    if (!USER_CONTENT_PLACEHOLDER.test(name) || seen.has(name)) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (isDelimited(ctx, start, end)) continue;
    seen.add(name);
    findings.push(
      createFinding(ctx, {
        ruleId: 'INJ-012',
        title: 'User-controlled placeholder without delimiters',
        severity: hasDataRule ? 'LOW' : 'MEDIUM',
        explanation: `The placeholder "${match[0]}" will be replaced with user-controlled text but is not wrapped in clear delimiters (quotes, XML tags or fenced blocks). Without a boundary the model cannot tell trusted instructions from injected ones.${hasDataRule ? ' The prompt does state that user content is untrusted, which reduces the risk.' : ''}`,
        recommendation: 'REC_DELIMIT_UNTRUSTED_INPUT',
        start,
        end,
      }),
    );
  }
  return findings;
}

export class InjectionScanner implements Scanner {
  readonly category = 'prompt_injection' as const;
  readonly stage = 'INJECTION' as const;
  readonly label = 'Prompt Injection';

  async scan(ctx: ScanContext): Promise<ScanOutput> {
    const protections = detectProtections(INJECTION_PROTECTIONS, ctx.content);
    const ai = await aiFindingsFor(ctx, this.category);
    const findings = [
      ...runPatternRules(INJECTION_RULES, ctx),
      ...detectHiddenCharacters(ctx),
      ...detectEncodedPayloads(ctx),
      ...detectUndelimitedPlaceholders(ctx, protections),
      ...ai.findings,
    ];
    return buildPatternResult({
      category: this.category,
      findings,
      noun: 'injection indicator',
      cleanExplanation:
        'No prompt-injection patterns were detected: no instruction overrides, extraction attempts, hidden characters, encoded payloads or undelimited user placeholders.',
      foundExplanation:
        'Injected instructions can override the intended behaviour of the application, so these should be removed or neutralised.',
      details: {
        rulesEvaluated: INJECTION_RULES.length + 3,
        protections,
        ...(ai.error ? { aiError: ai.error } : {}),
      },
    });
  }
}
