import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { LEAKAGE_EXAMPLE, LEAKAGE_FIXED } from '../../src/data/samplePrompts.js';
import { app, bearer, registerTestUser, sleep } from '../helpers.js';

const binaryParser = (res: unknown, callback: (error: Error | null, body: unknown) => void) => {
  const stream = res as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('Analysis API', () => {
  let token = '';
  let promptId = '';
  let analysisId = '';

  beforeAll(async () => {
    ({ token } = await registerTestUser('analysis'));
    const created = await request(app)
      .post('/api/prompts')
      .set(bearer(token))
      .send({ title: 'DevOps Helper', category: 'CODING_ASSISTANT', content: LEAKAGE_EXAMPLE });
    promptId = created.body.data.id;
  });

  it('runs the full pipeline, stores results and masks secrets', async () => {
    const res = await request(app).post(`/api/prompts/${promptId}/analyze?wait=true`).set(bearer(token)).send({});
    expect(res.status).toBe(201);
    const analysis = res.body.data;
    analysisId = analysis.id;

    expect(analysis.status).toBe('COMPLETED');
    expect(analysis.mode).toBe('LOCAL');
    expect(analysis.categories).toHaveLength(5);
    expect(analysis.overallScore).toBeLessThanOrEqual(40);
    expect(analysis.recommendations.length).toBeGreaterThan(0);
    expect(analysis.stages.map((s: { stage: string }) => s.stage)).toEqual([
      'INITIALIZING',
      'INJECTION',
      'JAILBREAK',
      'LEAKAGE',
      'CONSISTENCY',
      'TOKEN_COST',
      'SCORING',
      'RECOMMENDATIONS',
      'COMPLETE',
    ]);
    expect(JSON.stringify(analysis)).not.toContain('FAKE7x9QwErTyUiOp2468AsDfGhJkL');
  });

  it('supports asynchronous analysis with status polling', async () => {
    const start = await request(app).post(`/api/prompts/${promptId}/analyze`).set(bearer(token)).send({ mode: 'local' });
    expect(start.status).toBe(202);
    let status = '';
    for (let attempt = 0; attempt < 60 && status !== 'COMPLETED'; attempt += 1) {
      const res = await request(app).get(`/api/analyses/${start.body.data.analysisId}/status`).set(bearer(token));
      status = res.body.data.status;
      if (status !== 'COMPLETED') await sleep(50);
    }
    expect(status).toBe('COMPLETED');
  });

  it('lists history with search and filters', async () => {
    const all = await request(app).get('/api/analyses').set(bearer(token));
    expect(all.body.data.total).toBeGreaterThanOrEqual(2);
    const none = await request(app).get('/api/analyses?search=does-not-exist').set(bearer(token));
    expect(none.body.data.total).toBe(0);
    const invalid = await request(app).get('/api/analyses?riskLevel=EXTREME').set(bearer(token));
    expect(invalid.status).toBe(400);
  });

  it('builds a vulnerability report', async () => {
    const res = await request(app).get(`/api/analyses/${analysisId}/report`).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data.executiveSummary).toContain('DevOps Helper');
    expect(res.body.data.severityCounts.CRITICAL).toBeGreaterThan(0);
    expect(res.body.data.vulnerabilities.length).toBeGreaterThan(0);
  });

  it('generates a downloadable PDF report', async () => {
    const res = await request(app).get(`/api/analyses/${analysisId}/pdf`).set(bearer(token)).buffer(true).parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('returns 404 for unknown or foreign analyses', async () => {
    const missing = await request(app).get('/api/analyses/does-not-exist').set(bearer(token));
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('ANALYSIS_NOT_FOUND');

    const intruder = await registerTestUser('snoop');
    expect((await request(app).get(`/api/analyses/${analysisId}`).set(bearer(intruder.token))).status).toBe(404);
  });

  it('shows improvement between analysed versions', async () => {
    await request(app).post(`/api/prompts/${promptId}/versions`).set(bearer(token)).send({ content: LEAKAGE_FIXED });
    await request(app).post(`/api/prompts/${promptId}/analyze?wait=true`).set(bearer(token)).send({});
    const res = await request(app).get(`/api/prompts/${promptId}/compare?from=1&to=2`).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data.verdict).toBe('IMPROVED');
    expect(res.body.data.vulnerabilities.removed.length).toBeGreaterThan(0);
  });

  it('builds the dashboard from stored analyses', async () => {
    const res = await request(app).get('/api/dashboard/summary').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data.totals.analyses).toBeGreaterThanOrEqual(3);
    expect(typeof res.body.data.posture.score).toBe('number');
    expect(res.body.data.analysisMode.mode).toBe('LOCAL');
  });
});
