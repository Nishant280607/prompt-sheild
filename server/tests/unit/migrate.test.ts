import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrate.js';
import { MIGRATIONS } from '../../src/generated/migrations.js';

const dirs: string[] = [];
function tempDatabase() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'prompt-shield-migrate-'));
  dirs.push(dir);
  const file = path.join(dir, 'nested', 'app.db');
  return { file, config: { url: `file:${file}`, authToken: '', driver: 'sqlite' as const } };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('start-up migrations', () => {
  it('embeds every migration folder', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    for (const migration of MIGRATIONS) {
      expect(migration.name).toMatch(/^\d+_/);
      expect(migration.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(migration.sql).toContain('CREATE TABLE');
    }
  });

  it('creates the schema in a brand-new database and records it like Prisma Migrate', async () => {
    const { file, config } = tempDatabase();
    const report = await applyMigrations(config, MIGRATIONS);
    expect(report).toEqual({ applied: MIGRATIONS.map((m) => m.name), skipped: false });

    const db = new Database(file, { readonly: true });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining(['User', 'Prompt', 'Analysis', '_prisma_migrations']),
    );
    const rows = db
      .prepare('SELECT migration_name, checksum, finished_at FROM _prisma_migrations')
      .all() as Array<{
      migration_name: string;
      checksum: string;
      finished_at: string | null;
    }>;
    db.close();
    expect(rows.map((r) => r.migration_name)).toEqual(MIGRATIONS.map((m) => m.name));
    expect(rows[0]?.checksum).toBe(MIGRATIONS[0]?.checksum);
    expect(rows[0]?.finished_at).toBeTruthy();
  });

  it('is a no-op once every migration is applied', async () => {
    const { config } = tempDatabase();
    await applyMigrations(config, MIGRATIONS);
    expect(await applyMigrations(config, MIGRATIONS)).toEqual({ applied: [], skipped: false });
  });

  it('leaves databases created without migration history alone', async () => {
    const { file, config } = tempDatabase();
    await applyMigrations(config, MIGRATIONS);
    const db = new Database(file);
    db.exec('DROP TABLE _prisma_migrations');
    db.close();
    expect(await applyMigrations(config, MIGRATIONS)).toEqual({ applied: [], skipped: true });
  });

  it('reports which migration failed', async () => {
    const { config } = tempDatabase();
    const broken = [
      { name: '20990101000000_broken', checksum: '0'.repeat(64), sql: 'CREATE TABLE "Oops" (' },
    ];
    await expect(applyMigrations(config, broken)).rejects.toThrow(/20990101000000_broken/);
  });
});
