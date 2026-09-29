import axios from 'axios';
import type { ApiErrorBody, TextStats } from '../types/api';

/** Mirrors server/src/utils/tokens.ts so the editor can show live estimates. */
export function estimateTokens(text: string): number {
  if (!text.trim()) return 0;
  let ascii = 0;
  let nonAscii = 0;
  for (const char of text) {
    if ((char.codePointAt(0) ?? 0) < 128) ascii += 1;
    else nonAscii += 1;
  }
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return Math.max(1, Math.round((ascii / 4 + words * 1.3) / 2 + nonAscii * 0.9));
}

export function textStats(text: string): TextStats {
  return {
    characters: [...text].length,
    words: text.trim() ? text.trim().split(/\s+/).length : 0,
    lines: text.length === 0 ? 0 : text.split('\n').length,
    estimatedTokens: estimateTokens(text),
  };
}

export function sizeClass(tokens: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (tokens >= 2000) return 'HIGH';
  if (tokens >= 500) return 'MEDIUM';
  return 'LOW';
}

/** Friendly message for any error thrown by the API layer. */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    if (error.response?.data?.error?.message) return error.response.data.error.message;
    if (!error.response) return 'Cannot reach the Prompt Shield API. Make sure the server is running (npm run dev).';
    if (error.response.status >= 500) return 'The server encountered an error. Please try again.';
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function getErrorCode(error: unknown): string | null {
  return axios.isAxiosError<ApiErrorBody>(error) ? (error.response?.data?.error?.code ?? null) : null;
}

export function getErrorDetails<T>(error: unknown): T | null {
  return axios.isAxiosError<ApiErrorBody>(error) ? ((error.response?.data?.error?.details as T) ?? null) : null;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
