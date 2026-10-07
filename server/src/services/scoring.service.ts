import type { Category, RiskLevel, Severity } from '../types/analysis.js';
import { isSecurityCategory } from '../types/analysis.js';
import {
  CATEGORY_WEIGHTS,
  SCORE_BANDS,
  SEVERITY_CAPS,
  SEVERITY_IMPACT,
  type ScoreBand,
} from '../config/scoring.js';

export interface ScoredCategory {
  category: Category;
  score: number;
  findings: ReadonlyArray<{ severity: Severity }>;
}

export interface OverallScore {
  score: number;
  riskLevel: RiskLevel;
  rating: ScoreBand['rating'];
  /** Weighted average before severity caps. */
  weightedAverage: number;
  /** Cap applied because of critical/high findings (null when no cap applied). */
  cap: number | null;
  capReason: string | null;
  weights: Record<Category, number>;
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

/** Safety score for a pattern-based category: 100 * product(1 - impact(severity)). */
export function categoryScoreFromFindings(findings: ReadonlyArray<{ severity: Severity }>): number {
  const product = findings.reduce((acc, finding) => acc * (1 - SEVERITY_IMPACT[finding.severity]), 1);
  return Math.round(clamp(100 * product));
}

export function bandForScore(score: number): ScoreBand {
  const band = SCORE_BANDS.find((candidate) => score >= candidate.min);
  return band ?? (SCORE_BANDS[SCORE_BANDS.length - 1] as ScoreBand);
}

export function riskLevelForScore(score: number): RiskLevel {
  return bandForScore(score).riskLevel;
}

/** Maximum overall score allowed given the number of critical/high/medium security findings. */
export function severityCap(
  criticalCount: number,
  highCount: number,
  mediumCount = 0,
): { cap: number | null; reason: string | null } {
  if (criticalCount > 0) {
    const { base, stepPerExtra, floor } = SEVERITY_CAPS.CRITICAL;
    const cap = Math.max(floor, base - stepPerExtra * (criticalCount - 1));
    return { cap, reason: `${criticalCount} critical security finding${criticalCount > 1 ? 's' : ''} detected` };
  }
  if (highCount > 0) {
    const { base, stepPerExtra, floor } = SEVERITY_CAPS.HIGH;
    const cap = Math.max(floor, base - stepPerExtra * (highCount - 1));
    return { cap, reason: `${highCount} high-severity security finding${highCount > 1 ? 's' : ''} detected` };
  }
  if (mediumCount > 0) {
    const { base, stepPerExtra, floor } = SEVERITY_CAPS.MEDIUM;
    const cap = Math.max(floor, base - stepPerExtra * (mediumCount - 1));
    return { cap, reason: `${mediumCount} medium-severity security finding${mediumCount > 1 ? 's' : ''} detected` };
  }
  return { cap: null, reason: null };
}

/** Weighted combination of category scores with severity caps (see config/scoring.ts). */
export function computeOverallScore(categories: ReadonlyArray<ScoredCategory>): OverallScore {
  let weightedSum = 0;
  let totalWeight = 0;
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;

  for (const result of categories) {
    const weight = CATEGORY_WEIGHTS[result.category];
    weightedSum += result.score * weight;
    totalWeight += weight;
    // Only security categories can cap the score; quality signals just move the average.
    if (!isSecurityCategory(result.category)) continue;
    for (const finding of result.findings) {
      if (finding.severity === 'CRITICAL') criticalCount += 1;
      if (finding.severity === 'HIGH') highCount += 1;
      if (finding.severity === 'MEDIUM') mediumCount += 1;
    }
  }

  const weightedAverage = totalWeight > 0 ? weightedSum / totalWeight : 100;
  const { cap, reason } = severityCap(criticalCount, highCount, mediumCount);
  const capped = cap !== null && weightedAverage > cap;
  const score = Math.round(clamp(capped ? cap : weightedAverage));
  const band = bandForScore(score);

  return {
    score,
    riskLevel: band.riskLevel,
    rating: band.rating,
    weightedAverage: Math.round(weightedAverage * 10) / 10,
    cap: capped ? cap : null,
    capReason: capped ? reason : null,
    weights: { ...CATEGORY_WEIGHTS },
  };
}
