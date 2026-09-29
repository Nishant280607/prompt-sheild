import { PROMPT_LIMITS } from '../config/constants.js';
import { INJECTION_RULES } from '../scanners/patterns/injection.patterns.js';
import { JAILBREAK_RULES } from '../scanners/patterns/jailbreak.patterns.js';
import { runPatternRules } from '../scanners/ruleEngine.js';
import { createScanContext } from '../scanners/SecurityScanner.js';
import { resolveProvider } from './ai/aiService.js';
import type { Severity } from '../types/analysis.js';
import { getTextStats, type TextStats } from '../utils/tokens.js';
import { findControlCharacter, INVISIBLE_CHARS, normalizeLineEndings } from '../utils/text.js';

export interface ValidationIssue {
  code: string;
  message: string;
  line?: number;
}

export interface PromptValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: TextStats;
  placeholders: string[];
}

export interface Highlight {
  start: number;
  end: number;
  severity: Severity;
  ruleId: string;
  label: string;
  category: 'prompt_injection' | 'jailbreak' | 'information_leakage';
}

const lineAt = (text: string, index: number) => text.slice(0, index).split('\n').length;

/** Check {{ }} and {% %} template syntax. */
function checkTemplateSyntax(content: string, errors: ValidationIssue[], warnings: ValidationIssue[]): string[] {
  const placeholders = new Set<string>();
  let cursor = 0;
  let matchedClosers = 0;
  while (true) {
    const open = content.indexOf('{{', cursor);
    if (open === -1) break;
    const close = content.indexOf('}}', open + 2);
    const nextOpen = content.indexOf('{{', open + 2);
    if (close === -1 || (nextOpen !== -1 && nextOpen < close)) {
      errors.push({
        code: 'INCOMPLETE_TEMPLATE',
        message: 'A template placeholder is opened with "{{" but never closed with "}}".',
        line: lineAt(content, open),
      });
      cursor = open + 2;
      continue;
    }
    const name = content.slice(open + 2, close).trim();
    if (!name) {
      errors.push({ code: 'EMPTY_PLACEHOLDER', message: 'A template placeholder "{{ }}" has no variable name.', line: lineAt(content, open) });
    } else if (!/^[\w.-]+$/.test(name)) {
      warnings.push({ code: 'INVALID_PLACEHOLDER_NAME', message: `Placeholder "{{${name}}}" contains unexpected characters.`, line: lineAt(content, open) });
    } else {
      placeholders.add(name);
    }
    matchedClosers += 1;
    cursor = close + 2;
  }
  const totalClosers = content.split('}}').length - 1;
  if (totalClosers > matchedClosers) {
    warnings.push({ code: 'UNMATCHED_TEMPLATE_CLOSE', message: 'Found "}}" without a matching "{{".' });
  }
  const jinjaOpen = content.split('{%').length - 1;
  const jinjaClose = content.split('%}').length - 1;
  if (jinjaOpen !== jinjaClose) {
    errors.push({ code: 'INCOMPLETE_TEMPLATE', message: 'Template block tags "{% %}" are not balanced.' });
  }
  for (const match of content.matchAll(/\$\{([A-Za-z_][\w.]*)\}/g)) {
    if (match[1]) placeholders.add(match[1]);
  }
  if (/\$\{[^}\n]*$/m.test(content)) {
    warnings.push({ code: 'INCOMPLETE_TEMPLATE_EXPRESSION', message: 'A "${" expression is not closed on the same line.' });
  }
  return [...placeholders];
}

/**
 * Validate prompt text before it is saved or analysed.
 * Errors block saving/analysis; warnings are informational.
 */
export function validatePromptContent(input: unknown): PromptValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (typeof input !== 'string') {
    return {
      valid: false,
      errors: [{ code: 'MALFORMED_INPUT', message: 'Prompt content must be text.' }],
      warnings,
      stats: getTextStats(''),
      placeholders: [],
    };
  }

  const content = normalizeLineEndings(input);
  const trimmed = content.trim();

  if (!trimmed) {
    errors.push({ code: 'EMPTY_PROMPT', message: 'The prompt is empty.' });
  } else if (trimmed.length < PROMPT_LIMITS.minChars) {
    errors.push({
      code: 'PROMPT_TOO_SHORT',
      message: `The prompt is too short to analyse (minimum ${PROMPT_LIMITS.minChars} characters).`,
    });
  } else if (trimmed.length < PROMPT_LIMITS.shortWarningChars) {
    warnings.push({ code: 'SHORT_PROMPT', message: 'Very short prompts rarely give the model enough context for reliable behaviour.' });
  }

  if (content.length > PROMPT_LIMITS.maxChars) {
    errors.push({
      code: 'PROMPT_TOO_LARGE',
      message: `The prompt exceeds the maximum size of ${PROMPT_LIMITS.maxChars.toLocaleString('en-US')} characters.`,
    });
  } else if (content.length > PROMPT_LIMITS.largeWarningChars) {
    warnings.push({ code: 'LARGE_PROMPT', message: 'The prompt is very large; consider moving reference data out of it.' });
  }

  const controlIndex = findControlCharacter(content);
  if (controlIndex !== -1) {
    errors.push({
      code: 'MALFORMED_INPUT',
      message: 'The prompt contains binary or control characters. Paste plain text only.',
      line: lineAt(content, controlIndex),
    });
  }
  if (content.includes('\uFFFD')) {
    warnings.push({ code: 'ENCODING_ISSUE', message: 'The text contains replacement characters (\uFFFD), which usually means an encoding problem.' });
  }
  if (INVISIBLE_CHARS.test(content)) {
    warnings.push({ code: 'HIDDEN_CHARACTERS', message: 'Invisible characters were found. The injection scanner will report them in detail.' });
  }

  const lines = content.split('\n');
  const longLine = lines.findIndex((line) => line.length > PROMPT_LIMITS.maxLineLength);
  if (longLine !== -1) {
    warnings.push({ code: 'LONG_LINE', message: `Line ${longLine + 1} is longer than ${PROMPT_LIMITS.maxLineLength.toLocaleString('en-US')} characters.`, line: longLine + 1 });
  }
  if (trimmed && !/\p{L}/u.test(trimmed)) {
    warnings.push({ code: 'NO_NATURAL_LANGUAGE', message: 'The prompt contains no letters - is this the right content?' });
  }
  const lineCounts = new Map<string, number>();
  for (const line of lines.map((l) => l.trim()).filter((l) => l.length > 10)) {
    lineCounts.set(line, (lineCounts.get(line) ?? 0) + 1);
  }
  if ([...lineCounts.values()].some((count) => count >= 5)) {
    warnings.push({ code: 'REPEATED_LINES', message: 'The same line is repeated five or more times.' });
  }

  const placeholders = checkTemplateSyntax(content, errors, warnings);

  return { valid: errors.length === 0, errors, warnings, stats: getTextStats(content), placeholders };
}

/** Fast local pass used by the editor to highlight suspicious text while typing. */
export function quickScanHighlights(content: string): Highlight[] {
  const ctx = createScanContext(normalizeLineEndings(content), resolveProvider('local'));
  const highlights: Highlight[] = [];
  const add = (category: Highlight['category'], findings: ReturnType<typeof runPatternRules>) => {
    for (const finding of findings) {
      if (finding.startOffset === undefined || finding.endOffset === undefined) continue;
      highlights.push({
        start: finding.startOffset,
        end: finding.endOffset,
        severity: finding.severity,
        ruleId: finding.ruleId,
        label: finding.title,
        category,
      });
    }
  };
  add('prompt_injection', runPatternRules(INJECTION_RULES, ctx));
  add('jailbreak', runPatternRules(JAILBREAK_RULES, ctx));
  for (const span of ctx.sensitiveSpans) {
    highlights.push({
      start: span.matchStart,
      end: span.matchEnd,
      severity: span.severity,
      ruleId: span.detectorId,
      label: span.label,
      category: 'information_leakage',
    });
  }
  return highlights.sort((a, b) => a.start - b.start).slice(0, 200);
}
