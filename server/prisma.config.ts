import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration (Prisma ORM 7).
 * Prisma 7 does not load .env files automatically, so server/.env is loaded here.
 */
const serverRoot = import.meta.dirname;

try {
  process.loadEnvFile(path.join(serverRoot, '.env'));
} catch {
  // .env is optional (e.g. CI or variables already exported in the shell)
}

/** Resolve relative SQLite paths from the server/ folder so the CLI and the app use the same file. */
function resolveSqliteUrl(url: string): string {
  if (!url.startsWith('file:')) return url;
  const filePath = url.slice('file:'.length);
  if (filePath === ':memory:' || path.isAbsolute(filePath)) return url;
  return `file:${path.resolve(serverRoot, filePath).split(path.sep).join('/')}`;
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: resolveSqliteUrl(process.env.DATABASE_URL ?? 'file:./dev.db'),
  },
});
