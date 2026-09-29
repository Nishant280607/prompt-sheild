import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { INJECTION_EXAMPLE, SUPPORT_V2, SUPPORT_V3 } from '../../src/data/samplePrompts.js';
import { app, bearer, registerTestUser } from '../helpers.js';

describe('Prompt API', () => {
  let token = '';
  let promptId = '';

  beforeAll(async () => {
    ({ token } = await registerTestUser('prompts'));
  });

  it('creates a prompt with version 1', async () => {
    const res = await request(app)
      .post('/api/prompts')
      .set(bearer(token))
      .send({ title: 'Support bot', category: 'CUSTOMER_SUPPORT', content: SUPPORT_V2 });
    expect(res.status).toBe(201);
    expect(res.body.data.versions).toHaveLength(1);
    expect(res.body.data.versions[0].versionNumber).toBe(1);
    promptId = res.body.data.id;

    const list = await request(app).get('/api/prompts').set(bearer(token));
    expect(list.body.data.map((p: { id: string }) => p.id)).toContain(promptId);
  });

  it('refuses invalid prompts with structured validation results', async () => {
    const res = await request(app).post('/api/prompts').set(bearer(token)).send({ title: 'Empty', category: 'GENERAL', content: '   ' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PROMPT_INVALID');
    expect(res.body.error.details).toMatchObject({ valid: false, errors: [{ code: 'EMPTY_PROMPT' }] });
  });

  it('validates raw content and returns highlights for suspicious text', async () => {
    const res = await request(app).post('/api/prompts/validate').set(bearer(token)).send({ content: INJECTION_EXAMPLE });
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.highlights.length).toBeGreaterThan(0);
  });

  it('keeps prompts private to their owner', async () => {
    const intruder = await registerTestUser('intruder');
    const res = await request(app).get(`/api/prompts/${promptId}`).set(bearer(intruder.token));
    expect(res.status).toBe(404);
  });

  it('saves new versions and refuses unchanged content', async () => {
    const created = await request(app)
      .post(`/api/prompts/${promptId}/versions`)
      .set(bearer(token))
      .send({ content: SUPPORT_V3, changeNote: 'Hardened' });
    expect(created.status).toBe(201);
    expect(created.body.data.versionNumber).toBe(2);

    const duplicate = await request(app).post(`/api/prompts/${promptId}/versions`).set(bearer(token)).send({ content: SUPPORT_V3 });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('NO_CHANGES');
  });

  it('compares versions with a line diff', async () => {
    const res = await request(app).get(`/api/prompts/${promptId}/compare?from=1&to=2`).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data.verdict).toBe('NOT_ANALYZED');
    expect(res.body.data.diff.stats.added + res.body.data.diff.stats.modified).toBeGreaterThan(0);

    const same = await request(app).get(`/api/prompts/${promptId}/compare?from=2&to=2`).set(bearer(token));
    expect(same.status).toBe(400);
    expect(same.body.error.code).toBe('INVALID_COMPARISON');
  });

  it('uploads prompt templates and rejects unsupported files', async () => {
    const json = JSON.stringify({ title: 'Uploaded bot', prompt: 'You are a helpful assistant that answers gardening questions.' });
    const ok = await request(app).post('/api/prompts/upload').set(bearer(token)).attach('file', Buffer.from(json), 'bot.json');
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ title: 'Uploaded bot', format: 'json', validation: { valid: true } });

    const exe = await request(app).post('/api/prompts/upload').set(bearer(token)).attach('file', Buffer.from('MZ'), 'tool.exe');
    expect(exe.status).toBe(415);
    expect(exe.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');

    const broken = await request(app).post('/api/prompts/upload').set(bearer(token)).attach('file', Buffer.from('{"prompt":'), 'broken.json');
    expect(broken.status).toBe(422);
    expect(broken.body.error.code).toBe('INVALID_JSON');
  });

  it('deletes a prompt', async () => {
    const created = await request(app)
      .post('/api/prompts')
      .set(bearer(token))
      .send({ title: 'Temporary', category: 'OTHER', content: 'You are a temporary assistant for testing deletion.' });
    const id = created.body.data.id;
    expect((await request(app).delete(`/api/prompts/${id}`).set(bearer(token))).status).toBe(200);
    expect((await request(app).get(`/api/prompts/${id}`).set(bearer(token))).status).toBe(404);
  });
});
