import type { Category, RiskLevel, Severity } from '../types/analysis.js';

/**
 * Security scoring model (project-defined, easy to modify).
 *
 * 1. Each category produces a SAFETY score from 0 (worst) to 100 (no issues detected).
 *    Pattern-based categories start at 100 and every finding multiplies the score by
 *    (1 - SEVERITY_IMPACT[severity]). Multiplication gives diminishing returns, so many
 *    low findings never outweigh a single critical one.
 * 2. The overall score is the weighted average of the category scores (CATEGORY_WEIGHTS).
 * 3. Severity caps stop serious findings from being "averaged away". A finding in a
 *    SECURITY category (injection, jailbreak, leakage) forces the overall score into the
 *    matching risk band, so one real security issue can never read as "minimal risk":
 *      - any CRITICAL security finding caps the score at 24 (Critical Risk), minus 6 per extra,
 *      - any HIGH security finding caps it at 49 (High Risk), minus 6 per extra,
 *      - any MEDIUM security finding caps it at 74 (Moderate), minus 4 per extra.
 *    Consistency and token-cost findings never trigger a cap - they only move the average.
 *
 * These thresholds are classifications used by this project - they are not a guarantee of
 * real-world security.
 */
export const CATEGORY_WEIGHTS: Record<Category, number> = {
  prompt_injection: 0.3,
  jailbreak: 0.25,
  information_leakage: 0.25,
  consistency: 0.1,
  token_cost: 0.1,
};

export const SEVERITY_IMPACT: Record<Severity, number> = {
  CRITICAL: 0.6,
  HIGH: 0.35,
  MEDIUM: 0.15,
  LOW: 0.05,
  INFO: 0,
};

export const SEVERITY_CAPS = {
  CRITICAL: { base: 24, stepPerExtra: 6, floor: 5 },
  HIGH: { base: 49, stepPerExtra: 6, floor: 25 },
  MEDIUM: { base: 74, stepPerExtra: 4, floor: 50 },
} as const;

export interface ScoreBand {
  min: number;
  rating: 'Excellent' | 'Good' | 'Moderate' | 'High Risk' | 'Critical Risk';
  riskLevel: RiskLevel;
}

/** Ordered from best to worst. */
export const SCORE_BANDS: readonly ScoreBand[] = [
  { min: 90, rating: 'Excellent', riskLevel: 'MINIMAL' },
  { min: 75, rating: 'Good', riskLevel: 'LOW' },
  { min: 50, rating: 'Moderate', riskLevel: 'MEDIUM' },
  { min: 25, rating: 'High Risk', riskLevel: 'HIGH' },
  { min: 0, rating: 'Critical Risk', riskLevel: 'CRITICAL' },
];

/** Minimum score change treated as a real improvement/regression when comparing versions. */
export const COMPARISON_TOLERANCE = 2;

/** Token cost thresholds (estimated tokens). */
export const TOKEN_THRESHOLDS = {
  mediumFrom: 500,
  highFrom: 2000,
  /** Relative cost is expressed against this baseline prompt size. */
  baselineTokens: 500,
} as const;
