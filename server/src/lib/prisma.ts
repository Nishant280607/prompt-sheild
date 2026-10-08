import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaLibSql } from '@prisma/adapter-libsql/web';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaClient as PostgresPrismaClient } from '../generated/prisma-postgres/client.js';
import { logger } from '../utils/logger.js';

/**
 * Single Prisma client for the whole process (Prisma ORM 7 + driver adapters), chosen from
 * the database URL (see config/env.ts):
 * - `file:` URLs use better-sqlite3 (local development, tests, temporary serverless storage).
 * - libSQL / Turso URLs use the HTTP libSQL client, so data persists across serverless instances.
 * - PostgreSQL URLs (Neon, Prisma Postgres, Supabase...) use node-postgres with a client generated
 *   from the same schema (src/generated/schema.postgres.prisma), so the API is identical.
 */
function createClient(): PrismaClient {
  const { database } = env;
  if (database.driver === 'postgres') {
    // Small pool: serverless hosts run many short-lived instances.
    const adapter = new PrismaPg(
      { connectionString: database.url, max: 5, idleTimeoutMillis: 10_000 },
      { onPoolError: (error) => logger.warn(`PostgreSQL connection closed: ${error.message}`) },
    );
    return new PostgresPrismaClient({ adapter }) as unknown as PrismaClient;
  }
  if (database.driver === 'libsql') {
    return new PrismaClient({ adapter: new PrismaLibSql({ url: database.url, authToken: database.authToken || undefined }) });
  }
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: database.url }) });
}

export const prisma = createClient();

/**
 * Case-insensitive "contains" filter. SQLite's LIKE already ignores case for ASCII text;
 * PostgreSQL needs mode: 'insensitive' (which the SQLite client does not accept).
 */
export function containsText(value: string): { contains: string } {
  return env.database.driver === 'postgres' ? ({ contains: value, mode: 'insensitive' } as { contains: string }) : { contains: value };
}

export type { Prisma } from '../generated/prisma/client.js';
