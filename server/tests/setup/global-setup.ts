import { readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * Creates a fresh SQLite test database by applying every migration in prisma/migrations.
 * This mirrors `prisma migrate deploy` without needing the Prisma CLI during tests.
 */
const serverRoot = path.resolve(import.meta.dirname, '..', '..');
const dbPath = path.join(serverRoot, 'test.db');
const removeDatabase = () => {
  for (const suffix of ['', '-journal', '-wal', '-shm']) rmSync(`${dbPath}${suffix}`, { force: true });
};

export default function setup() {
  removeDatabase();
  const db = new Database(dbPath);
  const migrationsDir = path.join(serverRoot, 'prisma', 'migrations');
  const migrations = readdirSync(migrationsDir)
    .filter((name) => /^\d+_/.test(name))
    .sort();
  for (const migration of migrations) {
    db.exec(readFileSync(path.join(migrationsDir, migration, 'migration.sql'), 'utf8'));
  }
  db.close();
  return removeDatabase;
}
