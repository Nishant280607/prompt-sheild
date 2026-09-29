export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL';
export type Category = 'prompt_injection' | 'jailbreak' | 'information_leakage' | 'consistency' | 'token_cost';
export type AnalysisStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type Rating = 'Excellent' | 'Good' | 'Moderate' | 'High Risk' | 'Critical Risk';
export type StageKey =
  | 'INITIALIZING'
  | 'INJECTION'
  | 'JAILBREAK'
  | 'LEAKAGE'
  | 'CONSISTENCY'
  | 'TOKEN_COST'
  | 'SCORING'
  | 'RECOMMENDATIONS'
  | 'COMPLETE';

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}
export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}
export interface AuthResponse {
  user: User;
  token: string;
  expiresAt: string;
}

export interface TextStats {
  characters: number;
  words: number;
  lines: number;
  estimatedTokens: number;
}

export interface ValidationIssue {
  code: string;
  message: string;
  line?: number;
}
export interface Highlight {
  start: number;
  end: number;
  severity: Severity;
  ruleId: string;
  label: string;
  category: 'prompt_injection' | 'jailbreak' | 'information_leakage';
}
export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: TextStats;
  placeholders: string[];
  highlights?: Highlight[];
}

export interface StageEvent {
  stage: StageKey;
  label: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  summary?: string;
}

export interface Finding {
  id: string;
  ruleId: string;
  category: Category;
  categoryLabel: string;
  title: string;
  severity: Severity;
  evidence: string;
  explanation: string;
  line: number | null;
  column: number | null;
  startOffset: number | null;
  endOffset: number | null;
  source: 'LOCAL' | 'AI';
}

export interface ConsistencyProbe {
  id: string;
  label: string;
  question: string;
  status: 'DEFINED' | 'UNDEFINED' | 'CONFLICTING';
  detail: string;
  outcomes: string[];
  agreement: number;
}

export interface CategoryResult {
  category: Category;
  label: string;
  score: number;
  riskLevel: RiskLevel;
  rating: Rating;
  detected: boolean;
  weight: number;
  explanation: string;
  durationMs: number;
  details: Record<string, unknown>;
  findings: Finding[];
}

export interface Recommendation {
  id: string;
  code: string;
  category: Category | null;
  priority: Severity;
  title: string;
  description: string;
  actions: string[];
  relatedRuleIds: string[];
}

export type SeverityCounts = Record<Severity, number>;

export interface AnalysisSummary {
  id: string;
  status: AnalysisStatus;
  mode: 'LOCAL' | 'AI_ENHANCED';
  provider: string;
  overallScore: number | null;
  riskLevel: RiskLevel | null;
  rating: Rating | null;
  createdAt: string;
  completedAt: string | null;
  durationMs: number | null;
  prompt: { id: string; title: string; category: string };
  version: { id: string; versionNumber: number };
  categoryScores: Partial<Record<Category, number>>;
  estimatedTokens: number | null;
  severityCounts: SeverityCounts;
  vulnerabilityCount: number;
  recommendationCount: number;
}

export interface AnalysisDetail {
  id: string;
  status: AnalysisStatus;
  mode: 'LOCAL' | 'AI_ENHANCED';
  provider: string;
  overallScore: number | null;
  riskLevel: RiskLevel | null;
  rating: Rating | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  currentStage: StageKey | null;
  stages: StageEvent[];
  notice: string | null;
  prompt: { id: string; title: string; category: string; description: string | null };
  version: { id: string; versionNumber: number; changeNote: string | null; createdAt: string; maskedContent: string; stats: TextStats };
  scoreBreakdown: { weightedAverage: number; cap: number | null; capReason: string | null; weights: Record<Category, number> } | null;
  severityCounts: SeverityCounts;
  vulnerabilityCount: number;
  categories: CategoryResult[];
  recommendations: Recommendation[];
}

export interface AnalysisStatusResponse {
  id: string;
  status: AnalysisStatus;
  mode: string;
  provider: string;
  currentStage: StageKey | null;
  stages: StageEvent[];
  overallScore: number | null;
  riskLevel: RiskLevel | null;
  errorMessage: string | null;
  prompt: { id: string; title: string };
  versionNumber: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PromptVersion {
  id: string;
  versionNumber: number;
  changeNote: string | null;
  source: string;
  createdAt: string;
  content: string;
  maskedContent: string;
  stats: TextStats;
  analyses: AnalysisSummary[];
  latestAnalysis: AnalysisSummary | null;
}

export interface PromptDetail {
  id: string;
  title: string;
  category: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  versions: PromptVersion[];
}

export interface PromptSummary {
  id: string;
  title: string;
  category: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  versionCount: number;
  latestVersion: { id: string; versionNumber: number; createdAt: string; stats: TextStats } | null;
  latestAnalysis: AnalysisSummary | null;
}

export interface UploadResult {
  title: string;
  category: string;
  description: string | null;
  content: string;
  format: 'text' | 'markdown' | 'json';
  file: { name: string; size: number };
  validation: ValidationResult;
}

export interface SamplePrompt {
  id: string;
  title: string;
  category: string;
  description: string;
  content: string;
}

export interface DiffSegment {
  type: 'same' | 'added' | 'removed';
  text: string;
}
export interface DiffRow {
  type: 'unchanged' | 'added' | 'removed' | 'modified';
  oldNumber?: number;
  newNumber?: number;
  text?: string;
  oldText?: string;
  newText?: string;
  segments?: DiffSegment[];
}
export interface ComparedVulnerability {
  ruleId: string;
  title: string;
  severity: Severity;
  category: Category;
  categoryLabel: string;
  evidence: string;
}
export interface VersionRef {
  id: string;
  versionNumber: number;
  changeNote: string | null;
  createdAt: string;
  analysisId: string | null;
  score: number | null;
  riskLevel: RiskLevel | null;
}
export interface ComparisonResult {
  prompt: { id: string; title: string };
  versions: VersionRef[];
  from: VersionRef;
  to: VersionRef;
  verdict: 'IMPROVED' | 'WORSENED' | 'UNCHANGED' | 'NOT_ANALYZED';
  scoreDelta: number | null;
  summary: string;
  metrics: Array<{ key: string; label: string; from: number | null; to: number | null; delta: number | null }>;
  tokens: { from: number; to: number; delta: number };
  diff: { rows: DiffRow[]; stats: { added: number; removed: number; modified: number; unchanged: number } };
  vulnerabilities: { introduced: ComparedVulnerability[]; removed: ComparedVulnerability[]; persisting: ComparedVulnerability[] };
}

export interface AIStatus {
  mode: 'LOCAL' | 'AI_ENHANCED';
  label: string;
  provider: string;
  model: string | null;
  providers: { openai: { configured: boolean; model: string }; gemini: { configured: boolean; model: string } };
  setting: string;
}

export interface DashboardSummary {
  totals: { prompts: number; versions: number; analyses: number; completedAnalyses: number };
  posture: { score: number; rating: Rating; riskLevel: RiskLevel; promptsAnalyzed: number } | null;
  categories: Array<{ category: Category; label: string; averageScore: number | null; riskLevel: RiskLevel | null }>;
  vulnerabilities: { total: number; bySeverity: SeverityCounts };
  recommendations: { total: number };
  tokenUsage: { averageTokens: number | null; maxTokens: number | null; sizeClasses: { LOW: number; MEDIUM: number; HIGH: number } };
  trend: Array<{ id: string; date: string; score: number; label: string }>;
  activity: Array<{ date: string; count: number }>;
  recentAnalyses: AnalysisSummary[];
  analysisMode: AIStatus;
}

export interface RecommendationOverviewItem extends Recommendation {
  prompt: { id: string; title: string };
  versionNumber: number;
  analysisId: string;
  analysisScore: number | null;
}
export interface RecommendationsOverview {
  items: RecommendationOverviewItem[];
  total: number;
  byPriority: SeverityCounts;
}

export interface VulnerabilityReport {
  generatedAt: string;
  analysis: { id: string; createdAt: string; completedAt: string | null; durationMs: number | null; mode: string; provider: string; notice: string | null };
  prompt: { id: string; title: string; category: string; description: string | null; versionNumber: number; versionId: string };
  promptExcerpt: string;
  promptStats: TextStats;
  executiveSummary: string;
  score: {
    overall: number;
    rating: Rating;
    riskLevel: RiskLevel;
    projectedIfCriticalAndHighFixed: number;
    breakdown: AnalysisDetail['scoreBreakdown'];
  };
  severityCounts: SeverityCounts;
  categories: Array<Omit<CategoryResult, 'findings' | 'details'> & { findingCount: number }>;
  vulnerabilities: Finding[];
  recommendations: Recommendation[];
  tokenAnalysis: (Record<string, unknown> & { score: number; explanation: string }) | null;
  consistencyAnalysis: (Record<string, unknown> & { score: number; explanation: string; probes?: ConsistencyProbe[] }) | null;
  disclaimer: string;
}

export interface SystemStatus {
  analysisMode: AIStatus;
  scanners: Array<{ category: Category; label: string; stage: StageKey }>;
  scoring: { weights: Record<Category, number>; bands: Array<{ min: number; rating: Rating; riskLevel: RiskLevel }> };
  version: string;
}
