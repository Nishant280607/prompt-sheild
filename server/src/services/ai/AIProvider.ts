import type { ProviderName } from '../../types/analysis.js';

export interface AIReviewFinding {
  category: 'prompt_injection' | 'jailbreak' | 'information_leakage';
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  evidence: string;
  explanation: string;
}

/**
 * Abstraction over optional AI providers.
 * The application always works with the LocalProvider; external providers only add
 * advisory findings and real response sampling on top of the local scanners.
 */
export interface AIProvider {
  readonly name: ProviderName;
  readonly model: string | null;
  /** True when the provider sends data to an external API. */
  readonly isExternal: boolean;
  /** Security review of an (already redacted) prompt. */
  reviewPrompt(redactedPrompt: string): Promise<AIReviewFinding[]>;
  /** Sample several responses to the same message, used for consistency testing. */
  sampleResponses(systemPrompt: string, userMessage: string, samples: number): Promise<string[]>;
}

export class AIProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIProviderError';
  }
}
