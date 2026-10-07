import { describe, expect, it, vi } from 'vitest';
import {
  ConfigError,
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

  it('rejects unsupported database URLs with a clear message', () => {
    expect(() =>
      resolveDatabaseConfig(
        { DATABASE_URL: 'postgresql://localhost/db' },
        { serverless: false, ...quiet },
      ),
    ).toThrow(ConfigError);
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
