import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client/web';
import Database from 'better-sqlite3';
import pg from 'pg';
import type { DatabaseConfig } from '../config/env.js';
import type { EmbeddedMigration } from '../generated/migrations.js';

/** Minimal SQL access used only for schema migrations (the app itself always goes through Prisma). */
interface MigrationTarget {
  listTables(): Promise<string[]>;
  createMigrationsTable(): Promise<void>;
  appliedMigrations(): Promise<Set<string>>;
  /** Run a migration script and record it in _prisma_migrations. */
  applyMigration(migration: EmbeddedMigration): Promise<void>;
  close(): Promise<void>;
}

/** The bookkeeping table Prisma Migrate uses, so `prisma migrate deploy` and this runner agree. */
const SQLITE_MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)`;

const POSTGRES_MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum"              VARCHAR(64) NOT NULL,
    "finished_at"           TIMESTAMPTZ,
    "migration_name"        VARCHAR(255) NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        TIMESTAMPTZ,
    "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
)`;

const APPLIED_QUERY =
  'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL';

const toNameSet = (rows: Array<Record<string, unknown>>, column: string) =>
  new Set(rows.map((row) => String(row[column])));

function openSqlite(url: string): MigrationTarget {
  const file = url.slice('file:'.length);
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  return {
    listTables: async () =>
      (
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
          name: string;
        }>
      )
        .map((row) => row.name)
        .filter((name) => !name.startsWith('sqlite_')),
    createMigrationsTable: async () => {
      db.exec(SQLITE_MIGRATIONS_TABLE);
    },
    appliedMigrations: async () =>
      toNameSet(
        db.prepare(APPLIED_QUERY).all() as Array<Record<string, unknown>>,
        'migration_name',
      ),
    applyMigration: async (migration) => {
      db.exec(migration.sql);
      db.prepare(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
         VALUES (?, ?, current_timestamp, ?, current_timestamp, 1)`,
      ).run(randomUUID(), migration.checksum, migration.name);
    },
    close: async () => {
      db.close();
    },
  };
}

function openLibsql(url: string, authToken: string): MigrationTarget {
  const client = createClient({ url, authToken: authToken || undefined });
  return {
    listTables: async () =>
      (await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows
        .map((row) => String(row.name))
        .filter((name) => !name.startsWith('sqlite_') && !name.startsWith('libsql_')),
    createMigrationsTable: async () => {
      await client.execute(SQLITE_MIGRATIONS_TABLE);
    },
    appliedMigrations: async () =>
      toNameSet(
        (await client.execute(APPLIED_QUERY)).rows as unknown as Array<Record<string, unknown>>,
        'migration_name',
      ),
    applyMigration: async (migration) => {
      await client.executeMultiple(migration.sql);
      await client.execute({
        sql: `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
              VALUES (?, ?, current_timestamp, ?, current_timestamp, 1)`,
        args: [randomUUID(), migration.checksum, migration.name],
      });
    },
    close: async () => client.close(),
  };
}

/** Arbitrary but fixed key: every Prompt Shield instance waits for the same lock. */
const POSTGRES_MIGRATION_LOCK = 72_735_100;

async function openPostgres(url: string): Promise<MigrationTarget> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  // Instances that start at the same moment wait here instead of migrating twice.
  await client.query('SELECT pg_advisory_lock($1)', [POSTGRES_MIGRATION_LOCK]);
  return {
    listTables: async () =>
      (
        await client.query<{ name: string }>(
          "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'",
        )
      ).rows.map((row) => row.name),
    createMigrationsTable: async () => {
      await client.query(POSTGRES_MIGRATIONS_TABLE);
    },
    appliedMigrations: async () =>
      toNameSet((await client.query(APPLIED_QUERY)).rows, 'migration_name'),
    applyMigration: async (migration) => {
      // PostgreSQL can roll back schema changes, so a failed migration leaves nothing behind.
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
           VALUES ($1, $2, now(), $3, now(), 1)`,
          [randomUUID(), migration.checksum, migration.name],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    },
    close: async () => {
      await client
        .query('SELECT pg_advisory_unlock($1)', [POSTGRES_MIGRATION_LOCK])
        .catch(() => undefined);
      await client.end();
    },
  };
}

export interface MigrationReport {
  applied: string[];
  /** True when the schema exists but was not created through migrations (e.g. `prisma db push`). */
  skipped: boolean;
}

/**
 * Apply pending migrations - the same thing `prisma migrate deploy` does, but from inside the
 * server, so a brand-new database (a fresh Turso or PostgreSQL database, a temporary file on a
 * serverless instance, or a local dev.db) is ready without a separate setup step. Safe to run on
 * every start: already-applied migrations are skipped.
 */
export async function applyMigrations(
  database: Pick<DatabaseConfig, 'url' | 'authToken' | 'driver'>,
  migrations: readonly EmbeddedMigration[],
): Promise<MigrationReport> {
  const db =
    database.driver === 'postgres'
      ? await openPostgres(database.url)
      : database.driver === 'libsql'
        ? openLibsql(database.url, database.authToken)
        : openSqlite(database.url);
  try {
    const tables = new Set(await db.listTables());
    if (!tables.has('_prisma_migrations')) {
      const appTables = [...tables].filter((name) => !name.startsWith('_'));
      if (appTables.length > 0) return { applied: [], skipped: true };
      await db.createMigrationsTable();
    }

    let done = await db.appliedMigrations();
    const applied: string[] = [];
    for (const migration of migrations) {
      if (done.has(migration.name)) continue;
      try {
        await db.applyMigration(migration);
        applied.push(migration.name);
      } catch (error) {
        // Another server instance may have applied it at the same moment.
        done = await db.appliedMigrations();
        if (done.has(migration.name)) continue;
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Database migration "${migration.name}" failed: ${reason}`, {
          cause: error,
        });
      }
    }
    return { applied, skipped: false };
  } finally {
    await db.close();
  }
}
