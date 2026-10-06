import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client/web';
import Database from 'better-sqlite3';
import type { DatabaseConfig } from '../config/env.js';
import type { EmbeddedMigration } from '../generated/migrations.js';

/** Minimal SQL access used only for schema migrations (the app itself always goes through Prisma). */
interface SqlRunner {
  all<T>(sql: string, args?: Array<string | number | null>): Promise<T[]>;
  run(sql: string, args?: Array<string | number | null>): Promise<void>;
  /** Execute a script that may contain several statements. */
  exec(script: string): Promise<void>;
  close(): void;
}

function openSqlite(url: string): SqlRunner {
  const file = url.slice('file:'.length);
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  return {
    all: async <T>(sql: string, args: Array<string | number | null> = []) =>
      db.prepare(sql).all(...args) as T[],
    run: async (sql, args = []) => {
      db.prepare(sql).run(...args);
    },
    exec: async (script) => {
      db.exec(script);
    },
    close: () => db.close(),
  };
}

function openLibsql(url: string, authToken: string): SqlRunner {
  const client = createClient({ url, authToken: authToken || undefined });
  return {
    all: async <T>(sql: string, args: Array<string | number | null> = []) =>
      (await client.execute({ sql, args })).rows as unknown as T[],
    run: async (sql, args = []) => {
      await client.execute({ sql, args });
    },
    exec: (script) => client.executeMultiple(script),
    close: () => client.close(),
  };
}

/** The bookkeeping table Prisma Migrate uses, so `prisma migrate deploy` and this runner agree. */
const MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)`;

export interface MigrationReport {
  applied: string[];
  /** True when the schema exists but was not created through migrations (e.g. `prisma db push`). */
  skipped: boolean;
}

async function appliedMigrations(db: SqlRunner): Promise<Set<string>> {
  const rows = await db.all<{ migration_name: string }>(
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
  );
  return new Set(rows.map((row) => String(row.migration_name)));
}

/**
 * Apply pending migrations - the same thing `prisma migrate deploy` does, but from inside the
 * server, so a brand-new database (a fresh Turso database, a temporary file on a serverless
 * instance, or a local dev.db) is ready without a separate setup step. Safe to run on every
 * start: already-applied migrations are skipped.
 */
export async function applyMigrations(
  database: Pick<DatabaseConfig, 'url' | 'authToken' | 'driver'>,
  migrations: readonly EmbeddedMigration[],
): Promise<MigrationReport> {
  const db =
    database.driver === 'libsql'
      ? openLibsql(database.url, database.authToken)
      : openSqlite(database.url);
  try {
    const tables = new Set(
      (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")).map(
        (row) => String(row.name),
      ),
    );
    if (!tables.has('_prisma_migrations')) {
      const appTables = [...tables].filter(
        (name) => !name.startsWith('sqlite_') && !name.startsWith('_'),
      );
      if (appTables.length > 0) return { applied: [], skipped: true };
      await db.run(MIGRATIONS_TABLE);
    }

    let done = await appliedMigrations(db);
    const applied: string[] = [];
    for (const migration of migrations) {
      if (done.has(migration.name)) continue;
      try {
        await db.exec(migration.sql);
        await db.run(
          `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
           VALUES (?, ?, current_timestamp, ?, current_timestamp, 1)`,
          [randomUUID(), migration.checksum, migration.name],
        );
        applied.push(migration.name);
      } catch (error) {
        // Another server instance may have applied it at the same moment.
        done = await appliedMigrations(db);
        if (done.has(migration.name)) continue;
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Database migration "${migration.name}" failed: ${reason}`, {
          cause: error,
        });
      }
    }
    return { applied, skipped: false };
  } finally {
    db.close();
  }
}
