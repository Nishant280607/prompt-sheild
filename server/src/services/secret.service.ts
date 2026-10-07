import { randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { isUniqueConstraintError } from '../utils/dbErrors.js';

/**
 * Session (JWT) signing secret.
 *
 * - JWT_SECRET set: that value is used.
 * - Not set, persistent database: a random secret is generated once and kept in the Setting
 *   table, so every server instance signs and accepts the same sessions and they survive
 *   restarts. Connecting a database is therefore enough to make sign-ins stick on Vercel.
 * - Not set, temporary database: a random per-process secret (sessions end on restart).
 */
const JWT_SECRET_KEY = 'jwt_secret';

let current = env.jwtSecret;
let persistent = env.jwtSecretConfigured;

export const getJwtSecret = (): string => current;

/** False while sessions would end on a server restart (no JWT_SECRET and no stored secret). */
export const isJwtSecretPersistent = (): boolean => persistent;

/** Read the stored secret, creating it on first use. Safe when several instances start at once. */
export async function loadOrCreateStoredSecret(key = JWT_SECRET_KEY): Promise<string> {
  const existing = await prisma.setting.findUnique({ where: { key } });
  if (existing) return existing.value;
  const value = randomBytes(48).toString('hex');
  try {
    await prisma.setting.create({ data: { key, value } });
    return value;
  } catch (error) {
    // Another instance stored one at the same moment - use theirs so all instances agree.
    if (!isUniqueConstraintError(error)) throw error;
    return (await prisma.setting.findUniqueOrThrow({ where: { key } })).value;
  }
}

/** Called on start-up after migrations. Returns where the active secret comes from. */
export async function prepareJwtSecret(): Promise<'env' | 'database' | 'temporary'> {
  if (env.jwtSecretConfigured) return 'env';
  if (env.database.temporary) return 'temporary';
  current = await loadOrCreateStoredSecret();
  persistent = true;
  return 'database';
}
