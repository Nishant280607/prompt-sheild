import { readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import pg from 'pg';

/**
 * Creates a fresh test database by applying every migration, mirroring `prisma migrate deploy`
 * without needing the Prisma CLI during tests:
 * - SQLite (default): server/test.db from prisma/migrations
 * - PostgreSQL (TEST_DATABASE_URL=postgres://...): an emptied schema from prisma/migrations-postgres
 */
const serverRoot = path.resolve(import.meta.dirname, '..', '..');
const dbPath = path.join(serverRoot, 'test.db');
const removeDatabase = () => {
  for (const suffix of ['', '-journal', '-wal', '-shm'])
    rmSync(`${dbPath}${suffix}`, { force: true });
};

function migrationScripts(folder: string): string[] {
  const migrationsDir = path.join(serverRoot, 'prisma', folder);
  return readdirSync(migrationsDir)
    .filter((name) => /^\d+_/.test(name))
    .sort()
    .map((name) => readFileSync(path.join(migrationsDir, name, 'migration.sql'), 'utf8'));
}

export default async function setup() {
  const postgresUrl = process.env.TEST_DATABASE_URL;
  if (postgresUrl && /^postgres(ql)?:\/\//i.test(postgresUrl)) {
    const client = new pg.Client({ connectionString: postgresUrl });
    await client.connect();
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    for (const script of migrationScripts('migrations-postgres')) await client.query(script);
    await client.end();
    return undefined;
  }

  removeDatabase();
  const db = new Database(dbPath);
  for (const script of migrationScripts('migrations')) db.exec(script);
  db.close();
  return removeDatabase;
}
