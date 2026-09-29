import { describe, expect, it } from 'vitest';
import { CATEGORY_WEIGHTS } from '../../src/config/scoring.js';
import { INJECTION_EXAMPLE, LEAKAGE_EXAMPLE, SUPPORT_V3 } from '../../src/data/samplePrompts.js';
import { runSecurityScan } from '../../src/scanners/SecurityScanner.js';
import { LocalProvider } from '../../src/services/ai/LocalProvider.js';
import { generateRecommendations } from '../../src/services/recommendation.service.js';
import { bandForScore, categoryScoreFromFindings, computeOverallScore } from '../../src/services/scoring.service.js';
import type { Category } from '../../src/types/analysis.js';

const provider = new LocalProvider();
const clean = (category: Category, score = 100) => ({ category, score, findings: [] });

describe('Security score calculation', () => {
  it('uses weights that add up to 100%', () => {
    const total = Object.values(CATEGORY_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('scores categories from finding severity with diminishing impact', () => {
    expect(categoryScoreFromFindings([])).toBe(100);
    expect(categoryScoreFromFindings([{ severity: 'CRITICAL' }])).toBe(40);
    expect(categoryScoreFromFindings([{ severity: 'HIGH' }, { severity: 'HIGH' }])).toBe(42);
    expect(categoryScoreFromFindings([{ severity: 'INFO' }])).toBe(100);
  });

  it('maps scores to the project-defined bands', () => {
    expect(bandForScore(100).rating).toBe('Excellent');
    expect(bandForScore(90).rating).toBe('Excellent');
    expect(bandForScore(75).rating).toBe('Good');
    expect(bandForScore(74).rating).toBe('Moderate');
    expect(bandForScore(49).rating).toBe('High Risk');
    expect(bandForScore(24).rating).toBe('Critical Risk');
  });

  it('computes the weighted average of categories', () => {
    const result = computeOverallScore([
      clean('prompt_injection', 80),
      clean('jailbreak', 80),
      clean('information_leakage', 80),
      clean('consistency', 80),
      clean('token_cost', 80),
    ]);
    expect(result.score).toBe(80);
    expect(result.cap).toBeNull();
  });

  it('caps the overall score when critical findings exist', () => {
    const result = computeOverallScore([
      clean('prompt_injection'),
      clean('jailbreak'),
      { category: 'information_leakage', score: 40, findings: [{ severity: 'CRITICAL' }] },
      clean('consistency'),
      clean('token_cost'),
    ]);
    expect(result.weightedAverage).toBe(85);
    expect(result.score).toBe(40);
    expect(result.riskLevel).toBe('HIGH');
  });

  it('rates a hardened prompt far above an injected one', async () => {
    const safe = await runSecurityScan(SUPPORT_V3, provider);
    const attack = await runSecurityScan(INJECTION_EXAMPLE, provider);
    expect(safe.overall.score).toBeGreaterThanOrEqual(75);
    expect(attack.overall.score).toBeLessThanOrEqual(40);
  });
});

describe('Recommendation engine', () => {
  it('generates recommendations from actual findings', async () => {
    const result = await runSecurityScan(LEAKAGE_EXAMPLE, provider);
    const codes = result.recommendations.map((r) => r.code);
    expect(codes).toEqual(expect.arrayContaining(['REC_REMOVE_SECRETS', 'REC_MINIMISE_PII']));
    expect(result.recommendations[0]?.priority).toBe('CRITICAL');
    expect(result.recommendations[0]?.relatedRuleIds.length).toBeGreaterThan(0);
  });

  it('recommends strengthening the instruction hierarchy for injections', async () => {
    const result = await runSecurityScan(INJECTION_EXAMPLE, provider);
    expect(result.recommendations.map((r) => r.code)).toContain('REC_INSTRUCTION_HIERARCHY');
  });

  it('only suggests maintaining posture when nothing was found', () => {
    const recommendations = generateRecommendations([]);
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]?.code).toBe('REC_MAINTAIN_POSTURE');
  });
});
