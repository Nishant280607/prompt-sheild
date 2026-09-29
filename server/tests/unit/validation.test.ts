import { describe, expect, it } from 'vitest';
import { parseUploadedPrompt } from '../../src/services/upload.service.js';
import { validatePromptContent } from '../../src/services/validation.service.js';
import { AppError } from '../../src/utils/AppError.js';

const codes = (issues: Array<{ code: string }>) => issues.map((issue) => issue.code);

describe('Prompt validation', () => {
  it('accepts a normal prompt', () => {
    const result = validatePromptContent('You are a helpful assistant that answers questions about gardening.');
    expect(result).toMatchObject({ valid: true, errors: [] });
    expect(result.stats.words).toBe(10);
  });

  it('rejects empty, extremely short and excessively large prompts', () => {
    expect(codes(validatePromptContent('   ').errors)).toContain('EMPTY_PROMPT');
    expect(codes(validatePromptContent('Hi there').errors)).toContain('PROMPT_TOO_SHORT');
    expect(codes(validatePromptContent('a'.repeat(50_001)).errors)).toContain('PROMPT_TOO_LARGE');
  });

  it('rejects malformed input', () => {
    expect(codes(validatePromptContent(42).errors)).toContain('MALFORMED_INPUT');
    expect(codes(validatePromptContent('Binary data \u0000 inside the prompt text').errors)).toContain('MALFORMED_INPUT');
  });

  it('detects incomplete template syntax and extracts placeholders', () => {
    const broken = validatePromptContent('Answer the question: {{user_question');
    expect(broken.valid).toBe(false);
    expect(codes(broken.errors)).toContain('INCOMPLETE_TEMPLATE');

    const ok = validatePromptContent('Answer the question in <q>{{user_question}}</q> for {{ customer_name }}.');
    expect(ok.valid).toBe(true);
    expect(ok.placeholders).toEqual(['user_question', 'customer_name']);
  });

  it('warns about very short prompts and hidden characters', () => {
    const result = validatePromptContent('Summarise the\u200B text below.');
    expect(result.valid).toBe(true);
    expect(codes(result.warnings)).toEqual(expect.arrayContaining(['SHORT_PROMPT', 'HIDDEN_CHARACTERS']));
  });
});

describe('Prompt template upload parsing', () => {
  const file = (name: string, content: string) => ({ originalname: name, size: Buffer.byteLength(content), buffer: Buffer.from(content) });

  it('extracts prompts from JSON, Markdown and text files', () => {
    const json = parseUploadedPrompt(file('bot.json', JSON.stringify({ title: 'Garden bot', category: 'customer support', prompt: 'You help people with gardening questions.' })));
    expect(json).toMatchObject({ title: 'Garden bot', category: 'CUSTOMER_SUPPORT', format: 'json' });

    const markdown = parseUploadedPrompt(file('notes.md', '---\ntitle: Markdown bot\n---\nYou answer questions about Markdown syntax.'));
    expect(markdown.title).toBe('Markdown bot');
    expect(markdown.content).toBe('You answer questions about Markdown syntax.');

    const text = parseUploadedPrompt(file('support_prompt.txt', 'You are a support assistant for a bakery.'));
    expect(text.title).toBe('Support prompt');
    expect(text.validation.valid).toBe(true);
  });

  it('supports OpenAI-style message arrays', () => {
    const result = parseUploadedPrompt(file('chat.json', JSON.stringify({ messages: [{ role: 'system', content: 'You are a travel planner.' }] })));
    expect(result.content).toBe('You are a travel planner.');
  });

  it('rejects unsupported, empty and malformed files with clear errors', () => {
    const errorCode = (fn: () => unknown) => {
      try {
        fn();
      } catch (error) {
        return error instanceof AppError ? error.code : 'UNKNOWN';
      }
      return 'NO_ERROR';
    };
    expect(errorCode(() => parseUploadedPrompt(file('script.exe', 'MZ')))).toBe('UNSUPPORTED_FILE_TYPE');
    expect(errorCode(() => parseUploadedPrompt(file('empty.txt', '')))).toBe('EMPTY_FILE');
    expect(errorCode(() => parseUploadedPrompt(file('bad.json', '{"prompt": ')))).toBe('INVALID_JSON');
    expect(errorCode(() => parseUploadedPrompt(file('shape.json', '{"foo": 1}')))).toBe('UNSUPPORTED_JSON_STRUCTURE');
  });
});
