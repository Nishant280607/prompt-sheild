import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { app, bearer } from '../helpers.js';

const credentials = { name: 'Alice Analyst', email: 'alice@tests.promptshield.dev', password: 'Password123' };

describe('Auth API', () => {
  it('reports health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.database).toBe('ok');
  });

  it('registers a user, returns a JWT and stores only a bcrypt hash', async () => {
    const res = await request(app).post('/api/auth/register').send(credentials);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: credentials.email } });
    expect(stored.passwordHash).not.toBe(credentials.password);
    expect(stored.passwordHash.startsWith('$2')).toBe(true);
  });

  it('rejects duplicate emails and invalid input', async () => {
    const duplicate = await request(app).post('/api/auth/register').send(credentials);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_IN_USE');

    const invalid = await request(app).post('/api/auth/register').send({ name: 'A', email: 'not-an-email', password: 'short' });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('logs in with valid credentials and rejects wrong passwords', async () => {
    const ok = await request(app).post('/api/auth/login').send({ email: credentials.email, password: credentials.password });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.email).toBe(credentials.email);

    const wrong = await request(app).post('/api/auth/login').send({ email: credentials.email, password: 'WrongPass999' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('protects routes and handles invalid and expired tokens', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: credentials.email, password: credentials.password });
    const { token, user } = login.body.data;

    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    const invalid = await request(app).get('/api/auth/me').set(bearer('not-a-real-token'));
    expect(invalid.body.error.code).toBe('INVALID_TOKEN');

    const me = await request(app).get('/api/auth/me').set(bearer(token));
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(credentials.email);

    const expired = jwt.sign({ tv: 0 }, process.env.JWT_SECRET as string, {
      subject: user.id,
      issuer: 'prompt-shield',
      audience: 'prompt-shield-client',
      expiresIn: -10,
    });
    const expiredRes = await request(app).get('/api/auth/me').set(bearer(expired));
    expect(expiredRes.status).toBe(401);
    expect(expiredRes.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('revokes existing sessions when the password changes', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: credentials.email, password: credentials.password });
    const oldToken = login.body.data.token;
    const change = await request(app)
      .put('/api/auth/password')
      .set(bearer(oldToken))
      .send({ currentPassword: credentials.password, newPassword: 'NewPassword456' });
    expect(change.status).toBe(200);

    const revoked = await request(app).get('/api/auth/me').set(bearer(oldToken));
    expect(revoked.body.error.code).toBe('SESSION_REVOKED');
    const fresh = await request(app).get('/api/auth/me').set(bearer(change.body.data.token));
    expect(fresh.status).toBe(200);
  });
});
