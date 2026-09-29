import type { AIProvider, AIReviewFinding } from './AIProvider.js';
import { AIProviderError } from './AIProvider.js';

/**
 * Local Analysis Mode provider.
 * All analysis is performed by the deterministic local scanners, so this provider adds
 * nothing and never makes network calls.
 */
export class LocalProvider implements AIProvider {
  readonly name = 'local' as const;
  readonly model = null;
  readonly isExternal = false;

  async reviewPrompt(): Promise<AIReviewFinding[]> {
    return [];
  }

  async sampleResponses(): Promise<string[]> {
    throw new AIProviderError('Response sampling requires an external AI provider.');
  }
}
