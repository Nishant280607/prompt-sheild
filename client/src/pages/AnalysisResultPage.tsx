import { Copy, FileText, GitCompare, Pencil, ScrollText, TriangleAlert } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router';
import { RecommendationCard } from '../components/analysis/RecommendationCard';
import { SecurityCategoryCard } from '../components/analysis/SecurityCategoryCard';
import { RiskBadge } from '../components/ui/Badge';
import { buttonClasses } from '../components/ui/Button';
import { Card, CardHeader, Eyebrow } from '../components/ui/Card';
import { ScoreRing } from '../components/ui/ScoreRing';
import { ErrorState, LoadingState } from '../components/ui/States';
import { useToast } from '../context/ToastContext';
import { useAsync, useDocumentTitle } from '../hooks/useAsync';
import { analysisService } from '../services/analysisService';
import { formatDateTime, formatDuration, formatNumber } from '../utils/format';
import { getErrorMessage } from '../utils/helpers';
import { SEVERITY_ORDER, SEVERITY_TONES } from '../utils/risk';

export default function AnalysisResultPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { data: analysis, error, loading, reload } = useAsync(() => analysisService.get(id), [id]);
  useDocumentTitle(analysis ? `Results · ${analysis.prompt.title}` : 'Analysis results');

  if (loading && !analysis) return <LoadingState label="Loading analysis" />;
  if (error) return <ErrorState message={getErrorMessage(error)} onRetry={reload} />;
  if (!analysis) return null;
  if (analysis.status === 'RUNNING' || analysis.status === 'PENDING') return <Navigate to={`/analyses/${id}/progress`} replace />;
  if (analysis.status === 'FAILED') return <ErrorState title="Analysis failed" message={analysis.notice ?? 'The analysis could not be completed.'} />;

  const score = analysis.overallScore ?? 0;
  const versionNumber = analysis.version.versionNumber;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(analysis.id);
      toast.success('Analysis ID copied.');
    } catch {
      toast.error('Could not copy to the clipboard.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Epic 3 · Security analysis & scoring</Eyebrow>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Security Analysis Complete</h1>
          <p className="mt-1 text-sm text-slate-400">
            <Link to={`/prompts/${analysis.prompt.id}`} className="text-slate-200 hover:text-accent">
              {analysis.prompt.title}
            </Link>{' '}
            · version {versionNumber}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/analyses/${id}/pdf`} className={buttonClasses('primary')}>
            <FileText className="h-4 w-4" aria-hidden="true" /> Generate PDF Report
          </Link>
          <Link to={`/analyses/${id}/report`} className={buttonClasses('secondary')}>
            <ScrollText className="h-4 w-4" aria-hidden="true" /> Vulnerability report
          </Link>
          <Link to={`/prompts/${analysis.prompt.id}/edit`} className={buttonClasses('secondary')}>
            <Pencil className="h-4 w-4" aria-hidden="true" /> New version
          </Link>
          {versionNumber > 1 && (
            <Link to={`/prompts/${analysis.prompt.id}/compare?from=${versionNumber - 1}&to=${versionNumber}`} className={buttonClasses('secondary')}>
              <GitCompare className="h-4 w-4" aria-hidden="true" /> Compare v{versionNumber - 1}
            </Link>
          )}
        </div>
      </div>

      {analysis.notice && (
        <div role="status" className="flex gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" /> {analysis.notice}
        </div>
      )}

      <Card className="grid gap-8 p-6 lg:grid-cols-[auto_1fr_auto] lg:items-center">
        <div className="flex justify-center">
          <ScoreRing score={score} size={196} />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge level={analysis.riskLevel} />
            <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-slate-300">
              {analysis.mode === 'LOCAL' ? 'Analysis Mode: Local' : `Analysis Mode: AI Enhanced (${analysis.provider})`}
            </span>
          </div>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
            Weighted average of five security dimensions
            {analysis.scoreBreakdown?.cap !== null && analysis.scoreBreakdown?.cap !== undefined
              ? `: ${analysis.scoreBreakdown.weightedAverage}, capped at ${analysis.scoreBreakdown.cap} because ${analysis.scoreBreakdown.capReason}.`
              : ` (${analysis.scoreBreakdown?.weightedAverage ?? score}).`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {SEVERITY_ORDER.map((severity) => (
              <span key={severity} className={`rounded-lg border px-2.5 py-1 text-xs ${SEVERITY_TONES[severity].border} ${SEVERITY_TONES[severity].text}`}>
                {SEVERITY_TONES[severity].label}: <span className="font-semibold">{analysis.severityCounts[severity]}</span>
              </span>
            ))}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm lg:grid-cols-1">
          <div>
            <dt className="text-[11px] tracking-wider text-slate-500 uppercase">Analysis ID</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-slate-300">
              {analysis.id.slice(0, 14)}…
              <button type="button" onClick={copyId} className="rounded p-0.5 text-slate-500 hover:text-accent" aria-label="Copy analysis ID">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-wider text-slate-500 uppercase">Timestamp</dt>
            <dd className="mt-0.5 text-slate-300">{formatDateTime(analysis.completedAt ?? analysis.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-wider text-slate-500 uppercase">Duration</dt>
            <dd className="mt-0.5 text-slate-300">{formatDuration(analysis.durationMs)}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-wider text-slate-500 uppercase">Vulnerabilities</dt>
            <dd className="mt-0.5 text-slate-300">{analysis.vulnerabilityCount}</dd>
          </div>
        </dl>
      </Card>

      <section aria-labelledby="categories-title">
        <h2 id="categories-title" className="mb-4 text-lg font-semibold">
          Security dimensions
        </h2>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {analysis.categories.map((category) => (
            <SecurityCategoryCard key={category.category} result={category} defaultOpen={category.findings.some((f) => f.severity === 'CRITICAL')} />
          ))}
        </div>
      </section>

      <section aria-labelledby="recs-title">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="recs-title" className="text-lg font-semibold">
            Recommendations
          </h2>
          <Link to="/recommendations" className="text-sm text-accent hover:underline">
            All recommendations
          </Link>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {analysis.recommendations.map((recommendation) => (
            <RecommendationCard key={recommendation.id} recommendation={recommendation} />
          ))}
        </div>
      </section>

      <Card className="p-5">
        <CardHeader
          title="Prompt summary"
          subtitle={`${formatNumber(analysis.version.stats.characters)} characters · ${formatNumber(analysis.version.stats.words)} words · ~${formatNumber(analysis.version.stats.estimatedTokens)} tokens (estimate) · sensitive values masked`}
        />
        <pre className="mt-4 max-h-80 overflow-auto rounded-xl border border-white/[0.07] bg-black/30 p-4 font-mono text-xs leading-6 whitespace-pre-wrap text-slate-300">
          {analysis.version.maskedContent}
        </pre>
      </Card>
    </div>
  );
}
