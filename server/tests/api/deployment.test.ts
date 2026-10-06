import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DEMO_ACCOUNT, seedDemoAccount } from '../../src/db/demo.js';
import { prisma } from '../../src/lib/prisma.js';
import handler from '../../src/index.js';
import { bearer } from '../helpers.js';

/**
 * The Vercel entrypoint: a plain (req, res) handler that prepares the database (migrations +
 * demo account) on the first request, then serves the Express API.
 */
describe('Vercel serverless entrypoint', () => {
  it('serves the API from its default export', async () => {
    const res = await request(handler).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'ok',
      database: 'ok',
      storage: 'persistent',
      sessions: 'persistent',
    });

    const notFound = await request(handler).get('/api/does-not-exist');
    expect(notFound.status).toBe(404);
    expect(notFound.body.error.code).toBe('NOT_FOUND');
  });

  it('creates the demo account on start-up so demo login works on a fresh deployment', async () => {
    const login = await request(handler)
      .post('/api/auth/login')
      .send({ email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password });
    expect(login.status).toBe(200);
    expect(login.body.data.user).toMatchObject({ id: DEMO_ACCOUNT.id, email: DEMO_ACCOUNT.email });

    const me = await request(handler).get('/api/auth/me').set(bearer(login.body.data.token));
    expect(me.status).toBe(200);

    const dashboard = await request(handler)
      .get('/api/dashboard/summary')
      .set(bearer(login.body.data.token));
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.totals).toMatchObject({
      prompts: 7,
      versions: 10,
      analyses: 10,
      completedAnalyses: 10,
    });
  });

  it('registers and signs in new accounts', async () => {
    const credentials = {
      name: 'Vercel Visitor',
      email: `visitor.${Date.now()}@tests.promptshield.dev`,
      password: 'Password123',
    };
    const registered = await request(handler).post('/api/auth/register').send(credentials);
    expect(registered.status).toBe(201);

    const login = await request(handler)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: credentials.password });
    expect(login.status).toBe(200);
    expect(login.body.data.user.email).toBe(credentials.email);
  });

  it('keeps an existing demo account untouched and can re-create it on request', async () => {
    expect(await seedDemoAccount()).toBe('exists');

    const before = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_ACCOUNT.email } });
    expect(await seedDemoAccount({ reset: true })).toBe('created');
    const after = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_ACCOUNT.email } });
    expect(after.id).toBe(DEMO_ACCOUNT.id);
    expect(after.createdAt.getTime()).toBeGreaterThanOrEqual(before.createdAt.getTime());
    expect(await prisma.prompt.count({ where: { userId: DEMO_ACCOUNT.id } })).toBe(7);
  });
});
