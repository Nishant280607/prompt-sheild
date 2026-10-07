import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import {
  getJwtSecret,
  isJwtSecretPersistent,
  loadOrCreateStoredSecret,
  prepareJwtSecret,
} from '../../src/services/secret.service.js';

describe('session secret', () => {
  it('uses JWT_SECRET when it is configured', async () => {
    expect(await prepareJwtSecret()).toBe('env');
    expect(getJwtSecret()).toBe(process.env.JWT_SECRET);
    expect(isJwtSecretPersistent()).toBe(true);
  });

  it('stores one generated secret that every server instance shares', async () => {
    const key = `test_secret_${Date.now()}`;
    // Several instances starting at the same moment must all end up with the same value.
    const values = await Promise.all([1, 2, 3, 4].map(() => loadOrCreateStoredSecret(key)));
    expect(new Set(values).size).toBe(1);
    expect(values[0]).toMatch(/^[0-9a-f]{96}$/);

    const stored = await prisma.setting.findUniqueOrThrow({ where: { key } });
    expect(stored.value).toBe(values[0]);
    expect(await loadOrCreateStoredSecret(key)).toBe(values[0]);
  });
});
