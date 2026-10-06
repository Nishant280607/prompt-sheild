import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaLibSql } from '@prisma/adapter-libsql/web';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Single Prisma client for the whole process (Prisma ORM 7 + SQLite driver adapters).
 * - `file:` URLs use better-sqlite3 (local development, tests, temporary serverless storage).
 * - libSQL / Turso URLs use the HTTP libSQL client, so data persists across serverless instances.
 */
const adapter =
  env.database.driver === 'libsql'
    ? new PrismaLibSql({ url: env.database.url, authToken: env.database.authToken || undefined })
    : new PrismaBetterSqlite3({ url: env.database.url });

export const prisma = new PrismaClient({ adapter });

export type { Prisma } from '../generated/prisma/client.js';
