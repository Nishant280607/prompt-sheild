import { countWords } from './text.js';

export interface TextStats {
  characters: number;
  words: number;
  lines: number;
  estimatedTokens: number;
}

/**
 * Estimate the number of LLM tokens without shipping a full tokenizer.
 *
 * English text averages ~4 characters or ~0.75 words per token, so the estimate
 * averages both heuristics. Non-ASCII characters (accents, Indic scripts, CJK, emoji)
 * usually cost about one token each and are counted separately.
 * Typical error for English prompts is around +/-15%. The client mirrors this function.
 */
export function estimateTokens(text: string): number {
  if (!text.trim()) return 0;
  let ascii = 0;
  let nonAscii = 0;
  for (const char of text) {
    if ((char.codePointAt(0) ?? 0) < 128) ascii += 1;
    else nonAscii += 1;
  }
  const byCharacters = ascii / 4;
  const byWords = countWords(text) * 1.3;
  return Math.max(1, Math.round((byCharacters + byWords) / 2 + nonAscii * 0.9));
}

export function getTextStats(text: string): TextStats {
  return {
    characters: [...text].length,
    words: countWords(text),
    lines: text.length === 0 ? 0 : text.split('\n').length,
    estimatedTokens: estimateTokens(text),
  };
}
