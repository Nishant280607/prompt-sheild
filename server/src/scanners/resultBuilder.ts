import type { Category, DetectedFinding, Severity } from '../types/analysis.js';
import { SEVERITIES } from '../types/analysis.js';
import { categoryScoreFromFindings, riskLevelForScore } from '../services/scoring.service.js';
import { uniqueRecommendations } from './ruleEngine.js';
import type { ScanOutput } from './types.js';

const severityRank = (severity: Severity) => SEVERITIES.indexOf(severity);

/** Most severe first, then by position in the prompt. */
export function sortFindings(findings: readonly DetectedFinding[]): DetectedFinding[] {
  return [...findings].sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      (a.startOffset ?? Number.MAX_SAFE_INTEGER) - (b.startOffset ?? Number.MAX_SAFE_INTEGER),
  );
}

export function severityCounts(findings: readonly DetectedFinding[]): Record<Severity, number> {
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 } as Record<Severity, number>;
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

/** "3 issues detected (1 critical, 2 high). Most severe: "Instruction override attempt" (line 4)." */
export function summarizeFindings(findings: readonly DetectedFinding[], noun: string): string {
  const counts = severityCounts(findings);
  const parts = SEVERITIES.filter((s) => s !== 'INFO' && counts[s] > 0).map(
    (s) => `${counts[s]} ${s.toLowerCase()}`,
  );
  const top = sortFindings(findings)[0];
  const where = top?.line ? ` (line ${top.line})` : '';
  const plural = findings.length === 1 ? '' : 's';
  return `${findings.length} ${noun}${plural} detected (${parts.join(', ')}). Most severe: "${top?.title ?? 'n/a'}"${where}.`;
}

/** Shared result builder for pattern-based scanners (injection, jailbreak, leakage). */
export function buildPatternResult(input: {
  category: Category;
  findings: DetectedFinding[];
  noun: string;
  cleanExplanation: string;
  foundExplanation: string;
  details: Record<string, unknown>;
}): ScanOutput {
  const findings = sortFindings(input.findings);
  const score = categoryScoreFromFindings(findings);
  const actionable = findings.filter((f) => f.severity !== 'INFO');
  const detected = actionable.length > 0;
  return {
    category: input.category,
    score,
    riskLevel: riskLevelForScore(score),
    detected,
    findings,
    explanation: detected
      ? `${summarizeFindings(actionable, input.noun)} ${input.foundExplanation}`
      : input.cleanExplanation,
    recommendations: uniqueRecommendations(findings),
    details: { ...input.details, severityCounts: severityCounts(findings) },
  };
}
