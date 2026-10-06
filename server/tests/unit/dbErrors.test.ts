import { describe, expect, it } from 'vitest';
import { isUniqueConstraintError } from '../../src/utils/dbErrors.js';

describe('unique constraint detection', () => {
  it('recognises the SQLite (better-sqlite3) and libSQL / Turso forms', () => {
    expect(isUniqueConstraintError({ code: 'P2002' })).toBe(true);
    expect(
      isUniqueConstraintError({
        code: 'P2039',
        meta: {
          driverAdapterError: {
            message: 'SQLITE_CONSTRAINT: SQLite error: UNIQUE constraint failed: User.email',
          },
        },
      }),
    ).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isUniqueConstraintError({ code: 'P2025' })).toBe(false);
    expect(isUniqueConstraintError(new Error('FOREIGN KEY constraint failed'))).toBe(false);
    expect(isUniqueConstraintError(null)).toBe(false);
  });
});
