import path from 'node:path';
import { PROMPT_CATEGORIES, UPLOAD_RULES, type PromptCategory } from '../config/constants.js';
import { AppError } from '../utils/AppError.js';
import { normalizeLineEndings, stripControlChars } from '../utils/text.js';
import { validatePromptContent, type PromptValidationResult } from './validation.service.js';

export interface UploadedFileInput {
  originalname: string;
  size: number;
  buffer: Buffer;
}

export interface ExtractedPrompt {
  title: string;
  category: PromptCategory;
  description: string | null;
  content: string;
  format: 'text' | 'markdown' | 'json';
  file: { name: string; size: number };
  validation: PromptValidationResult;
}

const ACCEPTED_JSON_SHAPES =
  'Accepted JSON: a string, {"prompt": "..."} (or "content" / "template" / "text" / "system"), optionally with "title", "category" and "description", or an OpenAI-style {"messages": [{"role": "...", "content": "..."}]}.';

const asCategory = (value: unknown): PromptCategory => {
  const upper = typeof value === 'string' ? value.trim().toUpperCase().replace(/[\s-]+/g, '_') : '';
  return (PROMPT_CATEGORIES as readonly string[]).includes(upper) ? (upper as PromptCategory) : 'GENERAL';
};

const cleanTitle = (value: string) => stripControlChars(value).replace(/\s+/g, ' ').trim().slice(0, 120);

function titleFromFileName(name: string): string {
  const base = path.basename(name, path.extname(name)).replace(/[_-]+/g, ' ').trim();
  return cleanTitle(base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Uploaded prompt');
}

function decodeUtf8(buffer: Buffer): string {
  if (buffer.includes(0)) {
    throw AppError.unprocessable('BINARY_FILE', 'The file appears to be binary. Upload a plain-text .txt, .md or .json file.');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  } catch {
    throw AppError.unprocessable('INVALID_ENCODING', 'The file is not valid UTF-8 text.');
  }
}

function fromMessages(messages: unknown): string | null {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const parts = messages
    .filter((m): m is { role?: unknown; content?: unknown } => typeof m === 'object' && m !== null)
    .filter((m) => typeof m.content === 'string')
    .map((m) => ({ role: typeof m.role === 'string' ? m.role : 'message', content: m.content as string }));
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!.content;
  return parts.map((p) => `--- ${p.role} message ---\n${p.content}`).join('\n\n');
}

function parseJsonPrompt(text: string): { content: string; title?: string; category?: PromptCategory; description?: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'syntax error';
    throw AppError.unprocessable('INVALID_JSON', `The JSON file could not be parsed (${detail}).`);
  }
  if (typeof data === 'string') return { content: data };
  const fromArray = fromMessages(data);
  if (fromArray) return { content: fromArray };
  if (typeof data === 'object' && data !== null) {
    const record = data as Record<string, unknown>;
    const field = ['prompt', 'content', 'template', 'text', 'system', 'systemPrompt'].find(
      (key) => typeof record[key] === 'string',
    );
    const content = field ? (record[field] as string) : fromMessages(record.messages);
    if (content) {
      const title = typeof record.title === 'string' ? record.title : typeof record.name === 'string' ? record.name : undefined;
      return {
        content,
        ...(title ? { title } : {}),
        category: asCategory(record.category),
        ...(typeof record.description === 'string' ? { description: record.description } : {}),
      };
    }
  }
  throw AppError.unprocessable('UNSUPPORTED_JSON_STRUCTURE', `No prompt text was found in the JSON file. ${ACCEPTED_JSON_SHAPES}`);
}

function parseMarkdown(text: string): { content: string; title?: string; category?: PromptCategory; description?: string } {
  const frontMatter = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!frontMatter) return { content: text };
  const meta: Record<string, string> = {};
  for (const line of (frontMatter[1] ?? '').split('\n')) {
    const separator = line.indexOf(':');
    if (separator > 0) meta[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
  }
  return {
    content: text.slice(frontMatter[0].length),
    ...(meta.title ? { title: meta.title } : {}),
    category: asCategory(meta.category),
    ...(meta.description ? { description: meta.description } : {}),
  };
}

/**
 * Safely extract a prompt from an uploaded template. The file is only ever read as text;
 * its content is never executed or evaluated.
 */
export function parseUploadedPrompt(file: UploadedFileInput): ExtractedPrompt {
  const extension = path.extname(file.originalname).toLowerCase();
  if (!(UPLOAD_RULES.allowedExtensions as readonly string[]).includes(extension)) {
    throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', `Unsupported file type "${extension || 'none'}". Upload a .txt, .md or .json file.`);
  }
  if (file.size === 0 || file.buffer.length === 0) {
    throw AppError.unprocessable('EMPTY_FILE', 'The uploaded file is empty.');
  }

  const text = normalizeLineEndings(decodeUtf8(file.buffer));
  const format = extension === '.json' ? 'json' : extension === '.txt' ? 'text' : 'markdown';
  const parsed = format === 'json' ? parseJsonPrompt(text) : format === 'markdown' ? parseMarkdown(text) : { content: text };
  const content = normalizeLineEndings(parsed.content).replace(/^\n+|\s+$/g, '');

  return {
    title: parsed.title ? cleanTitle(parsed.title) || titleFromFileName(file.originalname) : titleFromFileName(file.originalname),
    category: parsed.category ?? 'GENERAL',
    description: parsed.description ? stripControlChars(parsed.description).slice(0, 500) : null,
    content,
    format,
    file: { name: path.basename(file.originalname).slice(0, 200), size: file.size },
    validation: validatePromptContent(content),
  };
}
