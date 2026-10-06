import request from 'supertest';
import { createApp } from '../src/createApp.js';

export const app = createApp();

let counter = 0;

/** Register a fresh user and return its token. */
export async function registerTestUser(prefix = 'user') {
  counter += 1;
  const email = `${prefix}.${counter}.${Date.now()}@tests.promptshield.dev`;
  const res = await request(app).post('/api/auth/register').send({ name: 'Test User', email, password: 'Password123' });
  if (res.status !== 201) throw new Error(`Registration failed: ${JSON.stringify(res.body)}`);
  return { token: res.body.data.token as string, userId: res.body.data.user.id as string, email };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
