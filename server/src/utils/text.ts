/**
 * Text helpers shared by the validator and the scanners.
 * All offsets are JavaScript string (UTF-16) indices into the ORIGINAL prompt text.
 */

/** Zero-width, bidirectional-control and other invisible formatting characters. */
export const INVISIBLE_CHARS = /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/;
export const INVISIBLE_CHARS_GLOBAL = new RegExp(INVISIBLE_CHARS.source, 'g');

/** Unicode "tag" characters (U+E0000 - U+E007F) can smuggle invisible ASCII text. */
export const TAG_CHARS_GLOBAL = /[\u{E0000}-\u{E007F}]+/gu;

/** Look-alike letters from other scripts that attackers use to dodge keyword filters. */
const HOMOGLYPHS: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't',
  у: 'y', х: 'x', і: 'i', ї: 'i', ј: 'j', ѕ: 's', ԁ: 'd', һ: 'h', ӏ: 'l',
  α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x',
};

/** Common "leetspeak" substitutions. */
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

export interface FoldedText {
  /** Lower-cased text with invisible characters removed and look-alikes normalised. */
  text: string;
  /** map[i] = index in the original text of folded character i. */
  map: number[];
}

/**
 * Produce a "folded" copy of the text used to catch obfuscated instructions
 * (hidden characters, homoglyphs, leetspeak, full-width letters, tag-character smuggling).
 * The index map lets findings point back to the original text.
 */
export function foldText(raw: string): FoldedText {
  let text = '';
  const map: number[] = [];
  const append = (value: string, origin: number) => {
    for (const unit of value) {
      text += unit;
      for (let k = 0; k < unit.length; k += 1) map.push(origin);
    }
  };

  for (let i = 0; i < raw.length; ) {
    const codePoint = raw.codePointAt(i) ?? 0;
    const char = String.fromCodePoint(codePoint);
    if (codePoint >= 0xe0020 && codePoint <= 0xe007e) {
      append(String.fromCharCode(codePoint - 0xe0000).toLowerCase(), i);
    } else if ((codePoint >= 0xe0000 && codePoint <= 0xe007f) || INVISIBLE_CHARS.test(char)) {
      // dropped: invisible characters carry no visible meaning
    } else {
      for (const normalized of char.normalize('NFKC').toLowerCase()) {
        append(HOMOGLYPHS[normalized] ?? LEET[normalized] ?? normalized, i);
      }
    }
    i += char.length;
  }
  return { text, map };
}

/** Offsets at which each line starts (line 1 starts at 0). */
export function buildLineIndex(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

/** Convert a string offset to a 1-based line/column pair. */
export function offsetToPosition(lineStarts: number[], offset: number): { line: number; column: number } {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if ((lineStarts[mid] ?? 0) <= offset) low = mid;
    else high = mid - 1;
  }
  return { line: low + 1, column: offset - (lineStarts[low] ?? 0) + 1 };
}

/** Readable evidence: the matched text plus a little context, whitespace collapsed. */
export function snippetAround(text: string, start: number, end: number, context = 18, maxLength = 180): string {
  const from = Math.max(0, start - context);
  const to = Math.min(text.length, end + context);
  let snippet = text.slice(from, to).replace(/\s+/g, ' ').trim();
  if (from > 0) snippet = `…${snippet}`;
  if (to < text.length) snippet = `${snippet}…`;
  if (snippet.length > maxLength) snippet = `${snippet.slice(0, maxLength - 1)}…`;
  return snippet;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Shannon entropy in bits per character - high values suggest random secrets. */
export function shannonEntropy(value: string): number {
  if (!value) return 0;
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** Normalise Windows line endings so offsets are stable across operating systems. */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Human readable Unicode code point, e.g. U+200B. */
export function codePointLabel(char: string): string {
  return `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;
}

/** Split text into sentences / lines (good enough for instruction analysis). */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** Remove ASCII control characters (keeps tab/newline) - used for titles and other metadata. */
export function stripControlChars(value: string): string {
  let result = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    if ((code < 32 && code !== 9 && code !== 10) || code === 127) continue;
    result += char;
  }
  return result;
}

/** Index of the first disallowed control character (binary data), or -1. */
export function findControlCharacter(value: string): number {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) return i;
  }
  return -1;
}

/** Deterministic 32-bit FNV-1a hash, used to seed reproducible simulations. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
