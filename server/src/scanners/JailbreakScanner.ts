import { aiFindingsFor } from './aiFindings.js';
import { JAILBREAK_PROTECTIONS, JAILBREAK_RULES } from './patterns/jailbreak.patterns.js';
import { buildPatternResult } from './resultBuilder.js';
import { detectProtections, runPatternRules } from './ruleEngine.js';
import type { ScanContext, ScanOutput, Scanner } from './types.js';

export class JailbreakScanner implements Scanner {
  readonly category = 'jailbreak' as const;
  readonly stage = 'JAILBREAK' as const;
  readonly label = 'Jailbreak';

  async scan(ctx: ScanContext): Promise<ScanOutput> {
    const ai = await aiFindingsFor(ctx, this.category);
    const findings = [...runPatternRules(JAILBREAK_RULES, ctx), ...ai.findings];
    return buildPatternResult({
      category: this.category,
      findings,
      noun: 'jailbreak indicator',
      cleanExplanation:
        'No jailbreak patterns were detected: no unrestricted modes, known jailbreak personas, policy overrides or refusal suppression.',
      foundExplanation:
        'These phrases try to make the model abandon its safety constraints and should not appear in production prompts.',
      details: {
        rulesEvaluated: JAILBREAK_RULES.length,
        protections: detectProtections(JAILBREAK_PROTECTIONS, ctx.content),
        ...(ai.error ? { aiError: ai.error } : {}),
      },
    });
  }
}
