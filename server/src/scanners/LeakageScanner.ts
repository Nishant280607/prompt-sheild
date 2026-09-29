import type { DetectedFinding } from '../types/analysis.js';
import { aiFindingsFor } from './aiFindings.js';
import { detectorById, SENSITIVE_DETECTORS } from './patterns/leakage.patterns.js';
import { buildPatternResult } from './resultBuilder.js';
import { createFinding } from './ruleEngine.js';
import type { ScanContext, ScanOutput, Scanner } from './types.js';

const MAX_FINDINGS = 30;

export class LeakageScanner implements Scanner {
  readonly category = 'information_leakage' as const;
  readonly stage = 'LEAKAGE' as const;
  readonly label = 'Information Leakage';

  async scan(ctx: ScanContext): Promise<ScanOutput> {
    const findings: DetectedFinding[] = [];
    const typeCounts: Record<string, number> = {};

    for (const span of ctx.sensitiveSpans) {
      const detector = detectorById(span.detectorId);
      if (!detector) continue;
      typeCounts[detector.label] = (typeCounts[detector.label] ?? 0) + 1;
      if (findings.length >= MAX_FINDINGS) continue;
      findings.push(
        createFinding(ctx, {
          ruleId: detector.id,
          title: detector.label,
          severity: detector.severity,
          explanation: detector.explanation,
          recommendation: detector.recommendation,
          start: span.matchStart,
          end: span.matchEnd,
        }),
      );
    }

    const ai = await aiFindingsFor(ctx, this.category);
    findings.push(...ai.findings);

    const maskedValues = ctx.sensitiveSpans.filter((span) => span.mask !== 'none').length;
    return buildPatternResult({
      category: this.category,
      findings,
      noun: 'sensitive data exposure',
      cleanExplanation:
        'No secrets, credentials, personal data or confidential markers were detected in the prompt.',
      foundExplanation:
        'Anything placed in a prompt can be logged or extracted by users, so secrets and personal data should be removed. Values are masked in all views and reports.',
      details: {
        detectorsEvaluated: SENSITIVE_DETECTORS.length,
        sensitiveValues: ctx.sensitiveSpans.length,
        maskedValues,
        types: typeCounts,
        ...(ai.error ? { aiError: ai.error } : {}),
      },
    });
  }
}
