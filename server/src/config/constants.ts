/** Limits applied to prompt content, metadata and uploads. */
export const PROMPT_LIMITS = {
  /** Below this length a prompt is rejected as "extremely short". */
  minChars: 10,
  /** Below this length a warning is shown. */
  shortWarningChars: 40,
  /** Above this length a prompt is rejected as "excessively large". */
  maxChars: 50_000,
  /** Above this length a warning is shown. */
  largeWarningChars: 20_000,
  /** Lines longer than this produce a warning. */
  maxLineLength: 4_000,
  titleMax: 120,
  descriptionMax: 500,
  changeNoteMax: 300,
} as const;

export const PROMPT_CATEGORIES = [
  'GENERAL',
  'CUSTOMER_SUPPORT',
  'CODING_ASSISTANT',
  'CONTENT_GENERATION',
  'DATA_EXTRACTION',
  'AGENT_WORKFLOW',
  'RAG_SYSTEM',
  'OTHER',
] as const;
export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

export const VERSION_SOURCES = ['EDITOR', 'UPLOAD', 'SEED'] as const;
export type VersionSource = (typeof VERSION_SOURCES)[number];

export const UPLOAD_RULES = {
  allowedExtensions: ['.txt', '.md', '.markdown', '.json'],
  fieldName: 'file',
} as const;

export const PAGINATION = {
  defaultPageSize: 10,
  maxPageSize: 50,
} as const;
