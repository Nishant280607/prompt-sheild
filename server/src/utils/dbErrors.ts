/**
 * True for a unique-constraint violation. better-sqlite3 surfaces it as Prisma P2002; the libSQL
 * (Turso) adapter reports a generic driver error, so the SQLite message is checked as well.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const known = error as {
    code?: unknown;
    message?: unknown;
    meta?: { driverAdapterError?: { message?: unknown } };
  };
  if (known.code === 'P2002') return true;
  const text = `${String(known.meta?.driverAdapterError?.message ?? '')} ${String(known.message ?? '')}`;
  return /UNIQUE constraint failed/i.test(text);
}
