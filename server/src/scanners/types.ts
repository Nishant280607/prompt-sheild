import type { Category, DetectedFinding, ScannerResult, StageKey } from '../types/analysis.js';
import type { AIProvider, AIReviewFinding } from '../services/ai/AIProvider.js';
import type { FoldedText } from '../utils/text.js';
import type { SensitiveSpan } from './patterns/leakage.patterns.js';

/** Everything a scanner needs, prepared once per analysis. */
export interface ScanContext {
  /** Original prompt text. */
  content: string;
  /** Same length as `content`, with secrets and personal data masked. Used for all evidence. */
  redacted: string;
  /** De-obfuscated copy used to catch hidden/look-alike text. */
  folded: FoldedText;
  lineStarts: number[];
  sensitiveSpans: SensitiveSpan[];
  provider: AIProvider;
  /** Lazily performed AI review (AI-enhanced mode only), shared by all scanners. */
  getAIReview: () => Promise<AIReviewFinding[]>;
}

export type ScanOutput = Omit<ScannerResult, 'durationMs'>;

/**
 * Contract for every scanner. To add a new security check, implement this interface
 * and register the scanner in scanners/SecurityScanner.ts.
 */
export interface Scanner {
  readonly category: Category;
  readonly stage: StageKey;
  readonly label: string;
  scan(ctx: ScanContext): Promise<ScanOutput>;
}

export type { DetectedFinding };
