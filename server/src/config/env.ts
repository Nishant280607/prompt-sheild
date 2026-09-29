import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { SERVER_ROOT, resolveSqliteUrl } from './paths.js';

/**
 * Environment configuration.
 * server/.env is loaded with Node's built-in loader (Node >= 20.12); variables that are
 * already set in the shell always win. Test runs configure their own variables.
 */
if (process.env.NODE_ENV !== 'test') {
  try {
    process.loadEnvFile(path.join(SERVER_ROOT, '.env'));
  } catch {
    // .env is optional - defaults below keep local development working
  }
}

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().default('file:./dev.db'),
  JWT_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  JWT_EXPIRES_IN: z.string().default('8h'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  AI_PROVIDER: z.enum(['auto', 'local', 'openai', 'gemini']).default('auto'),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(20000),
  TOKEN_PRICE_PER_MILLION_USD: z.coerce.number().min(0).default(0.5),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(5 * 1024 * 1024)
    .default(256 * 1024),
  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}
const raw = parsed.data;

const PLACEHOLDER_SECRETS = new Set(['change-me', 'changeme', 'secret', 'change-me-to-a-long-random-string']);

function resolveJwtSecret(): string {
  const secret = raw.JWT_SECRET?.trim();
  if (raw.NODE_ENV === 'production') {
    if (!secret || PLACEHOLDER_SECRETS.has(secret) || secret.length < 32) {
      throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
    }
    return secret;
  }
  if (!secret) {
    console.warn('[config] JWT_SECRET is not set - using a temporary secret. Run `npm run setup` to create server/.env.');
    return randomBytes(48).toString('hex');
  }
  if (PLACEHOLDER_SECRETS.has(secret) && raw.NODE_ENV === 'development') {
    console.warn('[config] JWT_SECRET is still the placeholder value. Replace it with a long random string.');
  }
  return secret;
}

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  jwtSecret: resolveJwtSecret(),
  databaseUrl: resolveSqliteUrl(raw.DATABASE_URL),
  clientOrigins: raw.CLIENT_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  openaiApiKey: raw.OPENAI_API_KEY.trim(),
  geminiApiKey: raw.GEMINI_API_KEY.trim(),
} as const;

export type AppEnv = typeof env;
