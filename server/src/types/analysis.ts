export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const RISK_LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'MINIMAL'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const CATEGORIES = [
  'prompt_injection',
  'jailbreak',
  'information_leakage',
  'consistency',
  'token_cost',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  prompt_injection: 'Prompt Injection',
  jailbreak: 'Jailbreak',
  information_leakage: 'Information Leakage',
  consistency: 'Consistency',
  token_cost: 'Token Cost',
};

/**
 * Categories that represent an actual security risk. Consistency and token cost
 * are quality signals: they lower the average but must never, on their own, make
 * a prompt look dangerous, and their findings are not counted as vulnerabilities.
 */
export const SECURITY_CATEGORIES = ['prompt_injection', 'jailbreak', 'information_leakage'] as const;
export type SecurityCategory = (typeof SECURITY_CATEGORIES)[number];
export const isSecurityCategory = (category: Category): category is SecurityCategory =>
  (SECURITY_CATEGORIES as readonly Category[]).includes(category);

export const ANALYSIS_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export type AnalysisMode = 'LOCAL' | 'AI_ENHANCED';
export type ProviderName = 'local' | 'openai' | 'gemini';

export const STAGES = [
  { key: 'INITIALIZING', label: 'Initializing scanner' },
  { key: 'INJECTION', label: 'Checking injection' },
  { key: 'JAILBREAK', label: 'Checking jailbreak' },
  { key: 'LEAKAGE', label: 'Checking leakage' },
  { key: 'CONSISTENCY', label: 'Checking consistency' },
  { key: 'TOKEN_COST', label: 'Analysing token cost' },
  { key: 'SCORING', label: 'Calculating security score' },
  { key: 'RECOMMENDATIONS', label: 'Generating recommendations' },
  { key: 'COMPLETE', label: 'Analysis complete' },
] as const;
export type StageKey = (typeof STAGES)[number]['key'];

export interface StageEvent {
  stage: StageKey;
  label: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  summary?: string;
}

/** A finding produced by a scanner, before it is persisted. Evidence is already masked. */
export interface DetectedFinding {
  ruleId: string;
  title: string;
  severity: Severity;
  evidence: string;
  explanation: string;
  line?: number;
  column?: number;
  startOffset?: number;
  endOffset?: number;
  source: 'LOCAL' | 'AI';
  recommendation?: RecommendationCode;
}

/** Structured output every scanner returns. */
export interface ScannerResult {
  category: Category;
  score: number;
  riskLevel: RiskLevel;
  detected: boolean;
  findings: DetectedFinding[];
  explanation: string;
  /** Recommendation codes suggested by this scanner (resolved by the recommendation engine). */
  recommendations: RecommendationCode[];
  details: Record<string, unknown>;
  durationMs: number;
}

export const RECOMMENDATION_CODES = [
  'REC_INSTRUCTION_HIERARCHY',
  'REC_PROTECT_SYSTEM_PROMPT',
  'REC_DELIMIT_UNTRUSTED_INPUT',
  'REC_REMOVE_HIDDEN_CONTENT',
  'REC_BLOCK_EXFILTRATION',
  'REC_REVIEW_ROLE_OVERRIDES',
  'REC_PRESERVE_REFUSALS',
  'REC_REMOVE_POLICY_BYPASS',
  'REC_REMOVE_SECRETS',
  'REC_MINIMISE_PII',
  'REC_SEPARATE_INTERNAL_INFO',
  'REC_DEFINE_OUTPUT_FORMAT',
  'REC_RESOLVE_CONFLICTS',
  'REC_DEFINE_BOUNDARIES',
  'REC_HANDLE_UNCERTAINTY',
  'REC_REDUCE_AMBIGUITY',
  'REC_REDUCE_CONTEXT',
  'REC_DEDUPLICATE_INSTRUCTIONS',
  'REC_EXTERNALISE_DATA',
  'REC_MAINTAIN_POSTURE',
] as const;
export type RecommendationCode = (typeof RECOMMENDATION_CODES)[number];

export interface GeneratedRecommendation {
  code: RecommendationCode;
  category: Category | null;
  priority: Severity;
  title: string;
  description: string;
  actions: string[];
  relatedRuleIds: string[];
}
