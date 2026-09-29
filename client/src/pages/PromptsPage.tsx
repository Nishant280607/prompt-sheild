import { FilePlus, GitCompare, Layers, Pencil, Search, Trash } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { RiskBadge } from '../components/ui/Badge';
import { Button, buttonClasses } from '../components/ui/Button';
import { Card, Eyebrow } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { inputClasses } from '../components/ui/FormField';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useToast } from '../context/ToastContext';
import { useAsync, useDebouncedValue, useDocumentTitle } from '../hooks/useAsync';
import { promptService } from '../services/promptService';
import type { PromptSummary } from '../types/api';
import { cn } from '../utils/cn';
import { formatCategory, formatNumber, formatRelative } from '../utils/format';
import { getErrorMessage } from '../utils/helpers';
import { scoreHex } from '../utils/risk';

export default function PromptsPage() {
  useDocumentTitle('Prompts & versions');
  const toast = useToast();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 350);
  const { data, error, loading, reload } = useAsync(() => promptService.list({ search: debounced || undefined }), [debounced]);
  const [toDelete, setToDelete] = useState<PromptSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await promptService.remove(toDelete.id);
      toast.success(`Deleted "${toDelete.title}".`);
      setToDelete(null);
      reload();
    } catch (deleteError) {
      toast.error(getErrorMessage(deleteError));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Epic 6 · Prompt version management</Eyebrow>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Prompts & Versions</h1>
        </div>
        <Link to="/analyze" className={buttonClasses('primary')}>
          <FilePlus className="h-4 w-4" aria-hidden="true" /> New prompt
        </Link>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
        <label htmlFor="prompt-search" className="sr-only">Search prompts</label>
        <input id="prompt-search" className={cn(inputClasses, 'pl-10')} placeholder="Search prompts" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {Boolean(error) && <ErrorState message={getErrorMessage(error)} onRetry={reload} />}
      {loading && !data && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      )}
      {data && data.length === 0 && (
        <EmptyState
          icon={<Layers className="h-5 w-5" />}
          title={debounced ? 'No prompts match your search' : 'No prompts yet'}
          description="Each prompt keeps a full version history with its own analyses."
          action={<Link to="/analyze" className={buttonClasses('primary')}>Create a prompt</Link>}
        />
      )}
      {data && data.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.map((prompt) => {
            const score = prompt.latestAnalysis?.overallScore ?? null;
            return (
              <Card key={prompt.id} className="flex flex-col p-5 transition hover:border-accent/25">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] tracking-wider text-slate-500 uppercase">{formatCategory(prompt.category)}</p>
                    <Link to={`/prompts/${prompt.id}`} className="mt-1 block truncate text-base font-semibold text-slate-50 hover:text-accent">
                      {prompt.title}
                    </Link>
                  </div>
                  <span className="font-display text-2xl font-semibold tabular-nums" style={{ color: score === null ? '#64748b' : scoreHex(score) }}>
                    {score ?? '-'}
                  </span>
                </div>
                {prompt.description && <p className="mt-2 line-clamp-2 text-sm text-slate-400">{prompt.description}</p>}
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <RiskBadge level={prompt.latestAnalysis?.riskLevel} />
                  <span>{prompt.versionCount} version{prompt.versionCount === 1 ? '' : 's'}</span>
                  <span>· ~{formatNumber(prompt.latestVersion?.stats.estimatedTokens)} tokens</span>
                  <span>· {formatRelative(prompt.updatedAt)}</span>
                </div>
                <div className="mt-auto flex flex-wrap gap-2 pt-5">
                  <Link to={`/prompts/${prompt.id}`} className={buttonClasses('secondary', 'sm')}>
                    <Layers className="h-3.5 w-3.5" aria-hidden="true" /> Versions
                  </Link>
                  <Link to={`/prompts/${prompt.id}/edit`} className={buttonClasses('secondary', 'sm')}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> New version
                  </Link>
                  {prompt.versionCount > 1 && (
                    <Link to={`/prompts/${prompt.id}/compare`} className={buttonClasses('secondary', 'sm')}>
                      <GitCompare className="h-3.5 w-3.5" aria-hidden="true" /> Compare
                    </Link>
                  )}
                  <Button variant="ghost" size="sm" className="ml-auto text-rose-300" onClick={() => setToDelete(prompt)} aria-label={`Delete ${prompt.title}`}>
                    <Trash className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete prompt?"
        description={`"${toDelete?.title}" and all of its versions and analyses will be permanently deleted.`}
        confirmLabel="Delete prompt"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
