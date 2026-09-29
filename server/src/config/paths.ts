import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Absolute path of the server/ package.
 * Works from src/ (tsx) and from dist/ (compiled) because both sit one level below server/.
 */
export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Resolve a SQLite `file:` URL relative to the server/ folder and return an absolute URL.
 * The Prisma CLI (prisma.config.ts) applies the same rule, so both always use the same file.
 */
export function resolveSqliteUrl(url: string, baseDir = SERVER_ROOT): string {
  if (!url.startsWith('file:')) return url;
  const filePath = url.slice('file:'.length);
  if (filePath === ':memory:' || path.isAbsolute(filePath)) return url;
  return `file:${path.resolve(baseDir, filePath).split(path.sep).join('/')}`;
}
