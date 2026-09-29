import { z } from 'zod';
import { PAGINATION, PROMPT_CATEGORIES, PROMPT_LIMITS } from '../config/constants.js';
import { ANALYSIS_STATUSES, RISK_LEVELS } from '../types/analysis.js';
import { stripControlChars } from '../utils/text.js';

/** Treat empty query-string values (?risk=) as "not provided". */
const optionalQuery = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const title = z
  .string()
  .trim()
  .min(3, 'Title must be at least 3 characters.')
  .max(PROMPT_LIMITS.titleMax, `Title must be at most ${PROMPT_LIMITS.titleMax} characters.`)
  .transform(stripControlChars);
const category = z.enum(PROMPT_CATEGORIES, { error: 'Choose a valid prompt category.' });
const description = z.string().trim().max(PROMPT_LIMITS.descriptionMax).transform(stripControlChars).nullish();
// The validation service enforces the real size limit and returns a structured error.
const content = z.string({ error: 'Prompt content must be text.' }).max(PROMPT_LIMITS.maxChars * 2, 'The prompt is far too large.');
const source = z.enum(['EDITOR', 'UPLOAD']).optional();

export const createPromptSchema = z.object({ title, category: category.default('GENERAL'), description, content, source });

export const updatePromptSchema = z
  .object({ title: title.optional(), category: category.optional(), description })
  .refine((value) => Object.values(value).some((v) => v !== undefined), 'Provide at least one field to update.');

export const validateContentSchema = z.object({ content });

export const createVersionSchema = z.object({
  content,
  changeNote: z.string().trim().max(PROMPT_LIMITS.changeNoteMax).transform(stripControlChars).nullish(),
  source,
});

export const analyzeSchema = z.object({
  versionId: z.string().min(1).optional(),
  mode: z.enum(['auto', 'local']).optional(),
});

export const listPromptsQuery = z.object({
  search: optionalQuery(z.string().trim().max(100)),
  category: optionalQuery(category),
});

export const listAnalysesQuery = z.object({
  search: optionalQuery(z.string().trim().max(100)),
  status: optionalQuery(z.enum(ANALYSIS_STATUSES)),
  riskLevel: optionalQuery(z.enum(RISK_LEVELS)),
  promptId: optionalQuery(z.string().max(64)),
  sort: optionalQuery(z.enum(['newest', 'oldest', 'score_desc', 'score_asc'])),
  page: optionalQuery(z.coerce.number().int().min(1)),
  pageSize: optionalQuery(z.coerce.number().int().min(1).max(PAGINATION.maxPageSize)),
});

export const compareQuery = z.object({
  from: optionalQuery(z.coerce.number().int().min(1)),
  to: optionalQuery(z.coerce.number().int().min(1)),
});

export type CreatePromptBody = z.infer<typeof createPromptSchema>;
export type UpdatePromptBody = z.infer<typeof updatePromptSchema>;
export type CreateVersionBody = z.infer<typeof createVersionSchema>;
export type AnalyzeBody = z.infer<typeof analyzeSchema>;
export type ListPromptsQuery = z.infer<typeof listPromptsQuery>;
export type ListAnalysesQuery = z.infer<typeof listAnalysesQuery>;
export type CompareQuery = z.infer<typeof compareQuery>;
