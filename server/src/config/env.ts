import os from 'node:os';
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

/** A configuration problem whose message is safe to show to the person running the app. */
export class ConfigError extends Error {
  override name = 'ConfigError';
}

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const booleanFlag = (fallback: 'true' | 'false') =>
  z
    .preprocess(emptyToUndefined, z.enum(['true', 'false']).default(fallback))
    .transform((value) => value === 'true');

/** True on serverless hosts (Vercel sets VERCEL=1): read-only disk, no long-running process. */
const serverless = Boolean(process.env.VERCEL);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: optionalString,
  DATABASE_AUTH_TOKEN: optionalString,
  TURSO_DATABASE_URL: optionalString,
  TURSO_AUTH_TOKEN: optionalString,
  JWT_SECRET: optionalString,
  JWT_EXPIRES_IN: z.string().default('8h'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  DEMO_ACCOUNT: booleanFlag('true'),
  TRUST_PROXY: optionalString,
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
  RATE_LIMIT_ENABLED: booleanFlag('true'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new ConfigError(`Invalid environment configuration:\n${details}`);
}
const raw = parsed.data;

const PLACEHOLDER_SECRETS = new Set([
  'change-me',
  'changeme',
  'secret',
  'change-me-to-a-long-random-string',
]);

export interface JwtSecret {
  secret: string;
  /** False when a random per-process secret is used: sessions end when the server restarts. */
  persistent: boolean;
}

/**
 * A configured secret must be strong in production. When no secret is configured a random one
 * is generated. With a persistent database (`canStore`) the server keeps a generated secret in
 * the database on start-up (src/services/secret.service.ts), so sessions survive restarts;
 * otherwise sessions end when the server restarts and a warning explains how to fix it.
 */
export function resolveJwtSecret(
  nodeEnv: string,
  value: string | undefined,
  warn: (message: string) => void = console.warn,
  canStore = false,
): JwtSecret {
  const secret = value?.trim();
  if (!secret) {
    if (nodeEnv !== 'test' && !canStore) {
      warn(
        '[config] JWT_SECRET is not set - using a temporary random secret, so everyone is signed out when the server restarts. ' +
          'Set JWT_SECRET to a long random string, or connect a database (DATABASE_URL) so a secret can be stored.',
      );
    }
    return { secret: randomBytes(48).toString('hex'), persistent: false };
  }
  if (nodeEnv === 'production' && (PLACEHOLDER_SECRETS.has(secret) || secret.length < 32)) {
    throw new ConfigError(
      'JWT_SECRET must be a random string of at least 32 characters in production.',
    );
  }
  if (PLACEHOLDER_SECRETS.has(secret) && nodeEnv === 'development') {
    warn(
      '[config] JWT_SECRET is still the placeholder value. Replace it with a long random string.',
    );
  }
  return { secret, persistent: true };
}

export interface DatabaseConfig {
  /** `file:` URL (SQLite through better-sqlite3) or a libSQL / Turso URL. */
  url: string;
  authToken: string;
  driver: 'sqlite' | 'libsql';
  /** True when data does not survive a restart (a local file on a serverless instance). */
  temporary: boolean;
}

const LIBSQL_URL = /^(libsql|https?|wss?):\/\//i;

/**
 * Pick the database: DATABASE_URL (or TURSO_DATABASE_URL, as set by the Vercel <-> Turso
 * integration). Without one, local development uses server/dev.db and serverless hosts use a
 * file in the writable temp folder - fine for a demo, but it is reset with each new instance.
 */
export function resolveDatabaseConfig(
  vars: {
    DATABASE_URL?: string | undefined;
    DATABASE_AUTH_TOKEN?: string | undefined;
    TURSO_DATABASE_URL?: string | undefined;
    TURSO_AUTH_TOKEN?: string | undefined;
  },
  options: { serverless: boolean; tmpDir?: string; warn?: (message: string) => void },
): DatabaseConfig {
  const warn = options.warn ?? console.warn;
  const tmpDir = options.tmpDir ?? os.tmpdir();
  const databaseUrl = vars.DATABASE_URL?.trim();
  const tursoUrl = vars.TURSO_DATABASE_URL?.trim();

  // A libSQL URL in either variable wins, e.g. a leftover DATABASE_URL=file:./dev.db next to the
  // TURSO_DATABASE_URL added by the Vercel integration.
  if (databaseUrl && LIBSQL_URL.test(databaseUrl)) {
    const authToken = (vars.DATABASE_AUTH_TOKEN ?? vars.TURSO_AUTH_TOKEN ?? '').trim();
    return { url: databaseUrl, authToken, driver: 'libsql', temporary: false };
  }
  if (tursoUrl && LIBSQL_URL.test(tursoUrl)) {
    const authToken = (vars.TURSO_AUTH_TOKEN ?? vars.DATABASE_AUTH_TOKEN ?? '').trim();
    return { url: tursoUrl, authToken, driver: 'libsql', temporary: false };
  }
  const configured = databaseUrl ?? tursoUrl;
  if (configured && !configured.startsWith('file:')) {
    throw new ConfigError(
      'DATABASE_URL must be a SQLite file URL (file:./dev.db) or a libSQL/Turso URL (libsql://<db>.turso.io).',
    );
  }

  if (!options.serverless) {
    return {
      url: resolveSqliteUrl(configured ?? 'file:./dev.db'),
      authToken: '',
      driver: 'sqlite',
      temporary: false,
    };
  }

  // Serverless: the deployment folder is read-only, only the temp folder is writable.
  const requested = configured ? resolveSqliteUrl(configured).slice('file:'.length) : '';
  const fileName =
    requested && requested !== ':memory:' ? path.basename(requested) : 'prompt-shield.db';
  const target = path.join(tmpDir, fileName).split(path.sep).join('/');
  if (requested && requested !== target) {
    warn(
      `[config] DATABASE_URL points to a read-only location on this host - using ${target} instead.`,
    );
  }
  warn(
    '[config] Using a temporary SQLite database: accounts and analyses are reset when the serverless instance restarts. ' +
      'Set DATABASE_URL (libsql://...) and DATABASE_AUTH_TOKEN to a Turso database to keep data.',
  );
  return { url: `file:${target}`, authToken: '', driver: 'sqlite', temporary: true };
}

/** Express "trust proxy": Vercel's edge sets X-Forwarded-For to the real client IP (one hop). */
export function resolveTrustProxy(
  value: string | undefined,
  serverlessHost: boolean,
): boolean | number | string {
  if (value === undefined) return serverlessHost ? 1 : false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

const warnUnlessTest = (message: string) => {
  if (raw.NODE_ENV !== 'test') console.warn(message);
};
const database = resolveDatabaseConfig(raw, { serverless, warn: warnUnlessTest });
const jwt = resolveJwtSecret(raw.NODE_ENV, raw.JWT_SECRET, warnUnlessTest, !database.temporary);

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  isServerless: serverless,
  /** Secret from JWT_SECRET, or a random one - read it through getJwtSecret() (secret.service). */
  jwtSecret: jwt.secret,
  jwtSecretConfigured: jwt.persistent,
  database,
  databaseUrl: database.url,
  trustProxy: resolveTrustProxy(raw.TRUST_PROXY, serverless),
  clientOrigins: raw.CLIENT_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  openaiApiKey: raw.OPENAI_API_KEY.trim(),
  geminiApiKey: raw.GEMINI_API_KEY.trim(),
} as const;

export type AppEnv = typeof env;
