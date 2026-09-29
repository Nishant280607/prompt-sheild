import type { Category, Rating, RiskLevel, Severity } from '../types/api';

export const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

interface Tone {
  label: string;
  text: string;
  bg: string;
  border: string;
  dot: string;
  hex: string;
}

export const SEVERITY_TONES: Record<Severity, Tone> = {
  CRITICAL: { label: 'Critical', text: 'text-sev-critical', bg: 'bg-sev-critical/10', border: 'border-sev-critical/30', dot: 'bg-sev-critical', hex: '#fb7185' },
  HIGH: { label: 'High', text: 'text-sev-high', bg: 'bg-sev-high/10', border: 'border-sev-high/30', dot: 'bg-sev-high', hex: '#fb923c' },
  MEDIUM: { label: 'Medium', text: 'text-sev-medium', bg: 'bg-sev-medium/10', border: 'border-sev-medium/30', dot: 'bg-sev-medium', hex: '#fbbf24' },
  LOW: { label: 'Low', text: 'text-sev-low', bg: 'bg-sev-low/10', border: 'border-sev-low/30', dot: 'bg-sev-low', hex: '#60a5fa' },
  INFO: { label: 'Info', text: 'text-sev-info', bg: 'bg-sev-info/10', border: 'border-sev-info/30', dot: 'bg-sev-info', hex: '#94a3b8' },
};

export const RISK_TONES: Record<RiskLevel, Tone> = {
  CRITICAL: { ...SEVERITY_TONES.CRITICAL, label: 'Critical risk' },
  HIGH: { ...SEVERITY_TONES.HIGH, label: 'High risk' },
  MEDIUM: { ...SEVERITY_TONES.MEDIUM, label: 'Medium risk' },
  LOW: { label: 'Low risk', text: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/30', dot: 'bg-accent', hex: '#22d3ee' },
  MINIMAL: { label: 'Minimal risk', text: 'text-sev-safe', bg: 'bg-sev-safe/10', border: 'border-sev-safe/30', dot: 'bg-sev-safe', hex: '#34d399' },
};

/** Project-defined bands (mirrors server/src/config/scoring.ts). */
export function ratingFor(score: number): { rating: Rating; risk: RiskLevel } {
  if (score >= 90) return { rating: 'Excellent', risk: 'MINIMAL' };
  if (score >= 75) return { rating: 'Good', risk: 'LOW' };
  if (score >= 50) return { rating: 'Moderate', risk: 'MEDIUM' };
  if (score >= 25) return { rating: 'High Risk', risk: 'HIGH' };
  return { rating: 'Critical Risk', risk: 'CRITICAL' };
}

export const scoreHex = (score: number) => RISK_TONES[ratingFor(score).risk].hex;

export const CATEGORY_META: Record<Category, { label: string; short: string; description: string }> = {
  prompt_injection: { label: 'Prompt Injection', short: 'Injection', description: 'Instruction overrides, extraction attempts, hidden or encoded instructions.' },
  jailbreak: { label: 'Jailbreak', short: 'Jailbreak', description: 'Attempts to bypass safety policies, unrestricted personas, refusal suppression.' },
  information_leakage: { label: 'Information Leakage', short: 'Leakage', description: 'Secrets, credentials, personal data and confidential information.' },
  consistency: { label: 'Consistency', short: 'Consistency', description: 'How predictably the model will behave across runs.' },
  token_cost: { label: 'Token Cost', short: 'Tokens', description: 'Estimated size, cost and redundancy of the prompt.' },
};

export const CATEGORY_ORDER: Category[] = ['prompt_injection', 'jailbreak', 'information_leakage', 'consistency', 'token_cost'];
