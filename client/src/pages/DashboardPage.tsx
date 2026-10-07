import { Activity, FilePlus, Gauge, Lightbulb, ShieldAlert, Upload } from 'lucide-react';
import { Link } from 'react-router';
import { ActivityChart, CategoryRadarChart, ScoreTrendChart, SeverityChart } from '../components/analysis/AnalysisChart';
import { CATEGORY_ICONS } from '../components/analysis/SecurityCategoryCard';
import { RiskBadge } from '../components/ui/Badge';
import { buttonClasses } from '../components/ui/Button';
import { Card, CardHeader, Eyebrow } from '../components/ui/Card';
import { ProgressBar } from '../components/ui/ProgressBar';
import { ScoreRing } from '../components/ui/ScoreRing';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useAuth } from '../context/AuthContext';
import { useAsync, useDocumentTitle } from '../hooks/useAsync';
import { dashboardService } from '../services/analysisService';
import { formatNumber, formatRelative } from '../utils/format';
import { getErrorMessage } from '../utils/helpers';
import { scoreHex } from '../utils/risk';

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => dashboardService.summary(), []);

  if (loading && !data) return <DashboardSkeleton />;
  if (error) return <ErrorState message={getErrorMessage(error)} onRetry={reload} />;
  if (!data) return null;

  const firstName = user?.name.split(' ')[0] ?? 'there';

  if (!data.posture) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Welcome, {firstName}</h1>
        <EmptyState
          title="No analyses yet"
          description="Analyse your first prompt to populate the security command center. You can start from a sample prompt in the editor."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/analyze" className={buttonClasses('primary')}>
                <FilePlus className="h-4 w-4" aria-hidden="true" /> New analysis
              </Link>
              <Link to="/analyze/upload" className={buttonClasses('secondary')}>
                <Upload className="h-4 w-4" aria-hidden="true" /> Upload template
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  const kpis = [
    { label: 'Analyses run', value: formatNumber(data.totals.analyses), icon: Activity, hint: `${data.totals.prompts} prompts · ${data.totals.versions} versions` },
    { label: 'Open vulnerabilities', value: formatNumber(data.vulnerabilities.total), icon: ShieldAlert, hint: `${data.vulnerabilities.bySeverity.CRITICAL} critical · ${data.vulnerabilities.bySeverity.HIGH} high` },
    { label: 'Recommendations', value: formatNumber(data.recommendations.total), icon: Lightbulb, hint: 'From latest analyses' },
    { label: 'Avg. prompt size', value: `~${formatNumber(data.tokenUsage.averageTokens)}`, icon: Gauge, hint: `estimated tokens · max ${formatNumber(data.tokenUsage.maxTokens)}` },
  ];
  const radar = data.categories.map((c) => ({ label: c.label.replace('Information ', ''), score: c.averageScore ?? 0 }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Security command center</Eyebrow>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Good to see you, {firstName}</h1>
        </div>
        <Link to="/analyze" className={buttonClasses('primary')}>
          <FilePlus className="h-4 w-4" aria-hidden="true" /> New analysis
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="relative flex flex-col items-center justify-center overflow-hidden p-6 text-center">
          <div className="absolute -top-16 h-40 w-40 rounded-full blur-3xl" style={{ background: `${scoreHex(data.posture.score)}33` }} aria-hidden="true" />
          <Eyebrow>Overall security score</Eyebrow>
          <div className="mt-4">
            <ScoreRing score={data.posture.score} size={188} />
          </div>
          <RiskBadge level={data.posture.riskLevel} className="mt-4" />
          <p className="mt-3 text-sm text-slate-400">
            Average of the latest analysis of {data.posture.promptsAnalyzed} prompt{data.posture.promptsAnalyzed === 1 ? '' : 's'}.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Analysis mode: <span className="text-slate-300">{data.analysisMode.label}</span>
          </p>
        </Card>

        <div className="grid gap-6">
          <div className="grid grid-cols-2 gap-4 2xl:grid-cols-4">
            {kpis.map((kpi) => (
              <Card key={kpi.label} className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">{kpi.label}</p>
                  <kpi.icon className="h-4 w-4 text-accent" aria-hidden="true" />
                </div>
                <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{kpi.value}</p>
                <p className="mt-1 truncate text-[11px] text-slate-500">{kpi.hint}</p>
              </Card>
            ))}
          </div>
          <Card className="p-5">
            <CardHeader title="Risk breakdown" subtitle="Average category safety score across current prompts" />
            <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {data.categories.map((category) => {
                const Icon = CATEGORY_ICONS[category.category];
                return (
                  <div key={category.category}>
                    <div className="mb-1.5 flex items-center gap-2 text-sm">
                      <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
                      <span className="flex-1 text-slate-300">{category.label}</span>
                      <span className="font-mono font-semibold" style={{ color: scoreHex(category.averageScore ?? 0) }}>
                        {category.averageScore ?? '-'}
                      </span>
                    </div>
                    <ProgressBar value={category.averageScore ?? 0} label={`${category.label} average score`} />
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <CardHeader title="Security score trend" subtitle="Most recent completed analyses" />
          <div className="mt-4">
            <ScoreTrendChart data={data.trend} />
          </div>
        </Card>
        <Card className="p-5">
          <CardHeader title="Risk map" subtitle="Category scores (higher is safer)" />
          <CategoryRadarChart data={radar} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader title="Analysis activity" subtitle="Analyses per day, last 14 days" />
          <div className="mt-4">
            <ActivityChart data={data.activity} />
          </div>
        </Card>
        <Card className="p-5">
          <CardHeader title="Vulnerability distribution" subtitle="Open findings by severity" />
          <div className="mt-4">
            <SeverityChart counts={data.vulnerabilities.bySeverity} />
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <CardHeader
          title="Recent analyses"
          action={
            <Link to="/history" className="text-sm text-accent hover:underline">
              View history
            </Link>
          }
        />
        <ul className="mt-4 divide-y divide-white/[0.05]">
          {data.recentAnalyses.map((analysis) => (
            <li key={analysis.id}>
              <Link to={`/analyses/${analysis.id}`} className="flex items-center gap-4 rounded-lg px-2 py-3 transition hover:bg-white/[0.03]">
                <span className="w-10 text-center font-display text-xl font-semibold tabular-nums" style={{ color: scoreHex(analysis.overallScore ?? 0) }}>
                  {analysis.overallScore ?? '-'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">
                    {analysis.prompt.title} <span className="text-slate-500">v{analysis.version.versionNumber}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatRelative(analysis.createdAt)} · {analysis.vulnerabilityCount} vulnerabilities · {analysis.mode === 'LOCAL' ? 'Local' : 'AI Enhanced'}
                  </p>
                </div>
                <RiskBadge level={analysis.riskLevel} className="hidden sm:inline-flex" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
