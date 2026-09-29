import { Lightbulb } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { RecommendationCard } from '../components/analysis/RecommendationCard';
import { buttonClasses } from '../components/ui/Button';
import { Eyebrow } from '../components/ui/Card';
import { inputClasses } from '../components/ui/FormField';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useAsync, useDocumentTitle } from '../hooks/useAsync';
import { dashboardService } from '../services/analysisService';
import type { Severity } from '../types/api';
import { cn } from '../utils/cn';
import { getErrorMessage } from '../utils/helpers';
import { CATEGORY_META, CATEGORY_ORDER, SEVERITY_ORDER, SEVERITY_TONES } from '../utils/risk';

export default function RecommendationsPage() {
  useDocumentTitle('Recommendations');
  const { data, error, loading, reload } = useAsync(() => dashboardService.recommendations(), []);
  const [priority, setPriority] = useState<Severity | 'all'>('all');
  const [category, setCategory] = useState('all');
  const [promptId, setPromptId] = useState('all');

  const prompts = useMemo(() => {
    const map = new Map<string, string>();
    data?.items.forEach((item) => map.set(item.prompt.id, item.prompt.title));
    return [...map.entries()];
  }, [data]);

  const items = (data?.items ?? []).filter(
    (item) =>
      (priority === 'all' || item.priority === priority) &&
      (category === 'all' || item.category === category) &&
      (promptId === 'all' || item.prompt.id === promptId),
  );

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Epic 4 · Recommendations</Eyebrow>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Recommendations</h1>
        <p className="mt-1 text-sm text-slate-400">Generated from the findings of the latest analysis of each prompt.</p>
      </div>

      {Boolean(error) && <ErrorState message={getErrorMessage(error)} onRetry={reload} />}
      {loading && !data && (
        <div className="grid gap-5 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-60 rounded-2xl" />
          ))}
        </div>
      )}

      {data && data.total === 0 && (
        <EmptyState
          icon={<Lightbulb className="h-5 w-5" />}
          title="No recommendations yet"
          description="Run an analysis and recommendations based on its findings will appear here."
          action={<Link to="/analyze" className={buttonClasses('primary')}>Analyze a prompt</Link>}
        />
      )}

      {data && data.total > 0 && (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by priority">
              <button type="button" onClick={() => setPriority('all')} aria-pressed={priority === 'all'} className={cn('rounded-full border px-3 py-1 text-xs', priority === 'all' ? 'border-accent/40 bg-accent/10 text-accent' : 'border-white/10 text-slate-400')}>
                All ({data.total})
              </button>
              {SEVERITY_ORDER.filter((s) => data.byPriority[s] > 0).map((severity) => (
                <button
                  key={severity}
                  type="button"
                  aria-pressed={priority === severity}
                  onClick={() => setPriority(severity)}
                  className={cn('rounded-full border px-3 py-1 text-xs', priority === severity ? cn(SEVERITY_TONES[severity].border, SEVERITY_TONES[severity].bg, SEVERITY_TONES[severity].text) : 'border-white/10 text-slate-400')}
                >
                  {SEVERITY_TONES[severity].label} ({data.byPriority[severity]})
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <label htmlFor="rec-category" className="sr-only">Category</label>
              <select id="rec-category" className={cn(inputClasses, 'h-9 w-auto py-0 text-xs')} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="all">All categories</option>
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>{CATEGORY_META[c].label}</option>
                ))}
              </select>
              <label htmlFor="rec-prompt" className="sr-only">Prompt</label>
              <select id="rec-prompt" className={cn(inputClasses, 'h-9 w-auto py-0 text-xs')} value={promptId} onChange={(e) => setPromptId(e.target.value)}>
                <option value="all">All prompts</option>
                {prompts.map(([id, title]) => (
                  <option key={id} value={id}>{title}</option>
                ))}
              </select>
            </div>
          </div>

          {items.length === 0 ? (
            <EmptyState title="No recommendations match these filters" />
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {items.map((item) => (
                <RecommendationCard
                  key={`${item.analysisId}-${item.id}`}
                  recommendation={item}
                  footer={
                    <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                      <span>
                        {item.prompt.title} · v{item.versionNumber} · score {item.analysisScore ?? '-'}
                      </span>
                      <Link to={`/analyses/${item.analysisId}`} className="text-accent hover:underline">
                        View analysis
                      </Link>
                    </p>
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
