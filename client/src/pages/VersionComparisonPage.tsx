import { GitCompare, Pencil } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import { buttonClasses } from '../components/ui/Button';
import { Card, Eyebrow } from '../components/ui/Card';
import { inputClasses } from '../components/ui/FormField';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States';
import { VersionComparison } from '../components/versions/VersionComparison';
import { useAsync, useDocumentTitle } from '../hooks/useAsync';
import { promptService } from '../services/promptService';
import { cn } from '../utils/cn';
import { getErrorCode, getErrorMessage } from '../utils/helpers';

export default function VersionComparisonPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const from = params.get('from') ? Number(params.get('from')) : undefined;
  const to = params.get('to') ? Number(params.get('to')) : undefined;
  const { data, error, loading, reload } = useAsync(() => promptService.compare(id, from, to), [id, from, to]);
  useDocumentTitle('Compare versions');

  if (loading && !data) return <LoadingState label="Comparing versions" />;
  if (error && getErrorCode(error) === 'NOT_ENOUGH_VERSIONS') {
    return (
      <EmptyState
        icon={<GitCompare className="h-5 w-5" />}
        title="Only one version so far"
        description="Save a second version of this prompt to compare security scores and changes."
        action={
          <Link to={`/prompts/${id}/edit`} className={buttonClasses('primary')}>
            <Pencil className="h-4 w-4" aria-hidden="true" /> Create new version
          </Link>
        }
      />
    );
  }
  if (error) return <ErrorState message={getErrorMessage(error)} onRetry={reload} />;
  if (!data) return null;

  const update = (key: 'from' | 'to', value: string) => {
    const next = new URLSearchParams(params);
    next.set('from', String(key === 'from' ? value : data.from.versionNumber));
    next.set('to', String(key === 'to' ? value : data.to.versionNumber));
    setParams(next);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Epic 6 · Version comparison</Eyebrow>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{data.prompt.title}</h1>
          <p className="mt-1 text-sm text-slate-400">
            <Link to={`/prompts/${data.prompt.id}`} className="text-accent hover:underline">All versions</Link>
          </p>
        </div>
        <Card className="flex items-end gap-3 p-3">
          {(['from', 'to'] as const).map((key) => (
            <div key={key}>
              <label htmlFor={`cmp-${key}`} className="text-[11px] tracking-wider text-slate-500 uppercase">{key === 'from' ? 'Base' : 'Compare'}</label>
              <select id={`cmp-${key}`} className={cn(inputClasses, 'mt-1 h-9 w-32 py-0 text-sm')} value={data[key].versionNumber} onChange={(e) => update(key, e.target.value)}>
                {data.versions.map((v) => (
                  <option key={v.id} value={v.versionNumber}>
                    v{v.versionNumber}
                    {v.score !== null ? ` · ${v.score}` : ' · not analysed'}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </Card>
      </div>

      {data.verdict === 'NOT_ANALYZED' && (
        <p className="text-sm text-slate-400">
          Tip: open the{' '}
          <Link to={`/prompts/${data.prompt.id}`} className="text-accent hover:underline">version history</Link> and analyse both versions to compare their security scores.
        </p>
      )}

      <VersionComparison result={data} />
    </div>
  );
}
