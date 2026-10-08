import { describe, expect, it, vi } from 'vitest';
import {
  cleanEnvValue,
  ConfigError,
  normalizePostgresUrl,
  resolveDatabaseConfig,
  resolveJwtSecret,
  resolveTrustProxy,
} from '../../src/config/env.js';

describe('JWT secret configuration', () => {
  it('uses a configured strong secret', () => {
    const secret = 'a'.repeat(64);
    expect(resolveJwtSecret('production', secret)).toEqual({ secret, persistent: true });
  });

  it('falls back to a random temporary secret when none is set, even in production', () => {
    const warn = vi.fn();
    const first = resolveJwtSecret('production', undefined, warn);
    const second = resolveJwtSecret('production', '   ', warn);
    expect(first.persistent).toBe(false);
    expect(first.secret).toMatch(/^[0-9a-f]{96}$/);
    expect(second.secret).not.toBe(first.secret);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('JWT_SECRET is not set'));
  });

  it('does not warn when a database can store a generated secret', () => {
    const warn = vi.fn();
    expect(resolveJwtSecret('production', undefined, warn, true).persistent).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('rejects weak or placeholder secrets in production', () => {
    expect(() => resolveJwtSecret('production', 'short-secret')).toThrow(ConfigError);
    expect(() => resolveJwtSecret('production', 'change-me-to-a-long-random-string')).toThrow(
      /at least 32 characters/,
    );
  });
});

describe('database configuration', () => {
  const quiet = { warn: () => undefined };

  it('defaults to server/dev.db locally', () => {
    const config = resolveDatabaseConfig({}, { serverless: false, ...quiet });
    expect(config).toMatchObject({ driver: 'sqlite', temporary: false });
    expect(config.url).toMatch(/^file:.*\/server\/dev\.db$/);
  });

  it('uses a writable temporary file on serverless hosts when no database is configured', () => {
    const warn = vi.fn();
    const config = resolveDatabaseConfig({}, { serverless: true, tmpDir: '/tmp', warn });
    expect(config).toEqual({
      url: 'file:/tmp/prompt-shield.db',
      authToken: '',
      driver: 'sqlite',
      temporary: true,
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('temporary SQLite database'));
  });

  it('moves a file database out of the read-only deployment folder on serverless hosts', () => {
    const config = resolveDatabaseConfig(
      { DATABASE_URL: 'file:./dev.db' },
      { serverless: true, tmpDir: '/tmp', ...quiet },
    );
    expect(config.url).toBe('file:/tmp/dev.db');
    expect(config.temporary).toBe(true);
  });

  it('uses libSQL / Turso URLs with their auth token, including the Vercel integration variable names', () => {
    expect(
      resolveDatabaseConfig(
        { DATABASE_URL: 'libsql://shield-demo.turso.io', DATABASE_AUTH_TOKEN: 'token-1' },
        { serverless: true, ...quiet },
      ),
    ).toEqual({
      url: 'libsql://shield-demo.turso.io',
      authToken: 'token-1',
      driver: 'libsql',
      temporary: false,
    });
    expect(
      resolveDatabaseConfig(
        { TURSO_DATABASE_URL: 'libsql://other.turso.io', TURSO_AUTH_TOKEN: 'token-2' },
        { serverless: true, ...quiet },
      ),
    ).toMatchObject({ url: 'libsql://other.turso.io', authToken: 'token-2', driver: 'libsql' });
  });

  it('prefers a Turso URL over a leftover SQLite file URL', () => {
    expect(
      resolveDatabaseConfig(
        {
          DATABASE_URL: 'file:./dev.db',
          TURSO_DATABASE_URL: 'libsql://other.turso.io',
          TURSO_AUTH_TOKEN: 'token-3',
        },
        { serverless: true, ...quiet },
      ),
    ).toMatchObject({ url: 'libsql://other.turso.io', authToken: 'token-3', temporary: false });
  });

  it('uses PostgreSQL URLs from Vercel Postgres integrations (Neon, Prisma Postgres, Supabase)', () => {
    const neon = resolveDatabaseConfig(
      {
        DATABASE_URL:
          'postgresql://user:pw@ep-x-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require',
      },
      { serverless: true, ...quiet },
    );
    expect(neon).toMatchObject({ driver: 'postgres', temporary: false });
    // sslmode=require keeps its libpq meaning (encrypted connection).
    expect(neon.url).toBe(
      'postgresql://user:pw@ep-x-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&uselibpqcompat=true',
    );

    // Supabase only sets POSTGRES_URL.
    expect(
      resolveDatabaseConfig(
        { POSTGRES_URL: 'postgres://u:p@db.example.com:5432/postgres' },
        { serverless: true, ...quiet },
      ),
    ).toMatchObject({ driver: 'postgres', url: 'postgres://u:p@db.example.com:5432/postgres' });

    // Prisma Postgres: an Accelerate DATABASE_URL falls back to the direct POSTGRES_URL.
    expect(
      resolveDatabaseConfig(
        {
          DATABASE_URL: 'prisma+postgres://accelerate.prisma-data.net/?api_key=x',
          POSTGRES_URL: 'postgres://u:p@db.prisma.io:5432/postgres',
        },
        { serverless: true, ...quiet },
      ),
    ).toMatchObject({ driver: 'postgres', url: 'postgres://u:p@db.prisma.io:5432/postgres' });
  });

  it('ignores quotes pasted around a value', () => {
    expect(
      resolveDatabaseConfig(
        { DATABASE_URL: ' "libsql://db.turso.io" ', DATABASE_AUTH_TOKEN: "'token'" },
        { serverless: true, ...quiet },
      ),
    ).toMatchObject({ url: 'libsql://db.turso.io', authToken: 'token', driver: 'libsql' });
  });

  it('explains unusable database settings without revealing them', () => {
    const resolve = (vars: Record<string, string>) => () =>
      resolveDatabaseConfig(vars, { serverless: true, ...quiet });
    expect(resolve({ DATABASE_URL: 'mysql://u:secret@host/db' })).toThrow(ConfigError);
    expect(resolve({ DATABASE_URL: 'mysql://u:secret@host/db' })).toThrow(
      /unsupported database type \(mysql:\/\/\)/,
    );
    expect(resolve({ DATABASE_URL: 'mysql://u:secret@host/db' })).not.toThrow(/secret/);
    expect(
      resolve({ DATABASE_URL: 'prisma+postgres://accelerate.prisma-data.net/?api_key=x' }),
    ).toThrow(/Prisma Accelerate URL/);
    expect(resolve({ TURSO_DATABASE_URL: 'eyJhbGciOiJFZERTQSJ9.eyJhIjoicncifQ.sig' })).toThrow(
      /TURSO_DATABASE_URL contains an auth token instead of a database URL.*TURSO_AUTH_TOKEN/,
    );
    expect(resolve({ DATABASE_URL: 'prompt-shield-db' })).toThrow(
      /DATABASE_URL is not a database URL/,
    );
  });
});

describe('PostgreSQL URL normalisation', () => {
  it('only adds libpq compatibility when an sslmode is given', () => {
    expect(normalizePostgresUrl('postgres://u:p@h/db')).toBe('postgres://u:p@h/db');
    expect(normalizePostgresUrl('postgres://u:p@h/db?sslmode=verify-full')).toBe(
      'postgres://u:p@h/db?sslmode=verify-full&uselibpqcompat=true',
    );
    expect(normalizePostgresUrl('postgres://u:p@h/db?sslmode=require&uselibpqcompat=false')).toBe(
      'postgres://u:p@h/db?sslmode=require&uselibpqcompat=false',
    );
  });

  it('strips matching quotes only', () => {
    expect(cleanEnvValue('"x"')).toBe('x');
    expect(cleanEnvValue("'x'")).toBe('x');
    expect(cleanEnvValue('"x')).toBe('"x');
    expect(cleanEnvValue('  ')).toBeUndefined();
  });
});

describe('trust proxy', () => {
  it('trusts one proxy hop on serverless hosts and none locally by default', () => {
    expect(resolveTrustProxy(undefined, true)).toBe(1);
    expect(resolveTrustProxy(undefined, false)).toBe(false);
    expect(resolveTrustProxy('2', false)).toBe(2);
    expect(resolveTrustProxy('loopback', false)).toBe('loopback');
  });
});
