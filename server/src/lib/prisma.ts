import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Single Prisma client for the whole process (Prisma ORM 7 + SQLite driver adapter).
 * The adapter talks to SQLite through better-sqlite3, which enforces foreign keys.
 */
const adapter = new PrismaBetterSqlite3({ url: env.databaseUrl });

export const prisma = new PrismaClient({ adapter });

export type { Prisma } from '../generated/prisma/client.js';
