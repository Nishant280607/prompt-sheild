import { Eye, GitCompare, Pencil, Play, Trash } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { RiskBadge } from '../components/ui/Badge';
import { Button, buttonClasses } from '../components/ui/Button';
import { Card, CardHeader, Eyebrow } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { inputClasses } from '../components/ui/FormField';
import { ErrorState, LoadingState } from '../components/ui/States';
import { useToast } from '../context/ToastContext';
import { useAsync, useDocumentTitle } from '../hooks/useAsync';
import { promptService } from '../services/promptService';
import { cn } from '../utils/cn';
import { formatCategory, formatDateTime, formatNumber } from '../utils/format';
import { getErrorMessage } from '../utils/helpers';
import { scoreHex } from '../utils/risk';

export default function PromptVersionsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: prompt, error, loading, reload } = useAsync(() => promptService.get(id), [id]);
  useDocumentTitle(prompt ? `${prompt.title} · versions` : 'Prompt versions');
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (loading && !prompt) return <LoadingState label="Loading versions" />;
  if (error) return <ErrorState message={getErrorMessage(error)} onRetry={reload} />;
  if (!prompt) return null;

  const latest = prompt.versions[0];
  const fromValue = from ?? prompt.versions[1]?.versionNumber ?? 1;
  const toValue = to ?? latest?.versionNumber ?? 1;

  const analyzeVersion = async (versionId: string) => {
    setAnalyzing(versionId);
    try {
      const started = await promptService.analyze(prompt.id, { versionId });
      navigate(`/analyses/${started.analysisId}/progress`);
    } catch (analyzeError) {
      toast.error(getErrorMessage(analyzeError));
      setAnalyzing(null);
    }
  };

  const deletePrompt = async () => {
    setDeleting(true);
    try {
      await promptService.remove(prompt.id);
      toast.success('Prompt deleted.');
      navigate('/prompts');
    } catch (deleteError) {
      toast.error(getErrorMessage(deleteError));
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Epic 6 · {formatCategory(prompt.category)}</Eyebrow>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{prompt.title}</h1>
          {prompt.description && <p className="mt-1 text-sm text-slate-400">{prompt.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/prompts/${prompt.id}/edit`} className={buttonClasses('primary')}>
            <Pencil className="h-4 w-4" aria-hidden="true" /> Create new version
          </Link>
          <Button variant="danger" icon={<Trash className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        </div>
      </div>

      {prompt.versions.length > 1 && (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="compare-from" className="text-xs text-slate-400">Compare version</label>
            <select id="compare-from" className={cn(inputClasses, 'mt-1')} value={fromValue} onChange={(e) => setFrom(Number(e.target.value))}>
              {prompt.versions.map((v) => (
                <option key={v.id} value={v.versionNumber}>v{v.versionNumber} - {v.changeNote ?? 'no note'}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label htmlFor="compare-to" className="text-xs text-slate-400">with version</label>
            <select id="compare-to" className={cn(inputClasses, 'mt-1')} value={toValue} onChange={(e) => setTo(Number(e.target.value))}>
              {prompt.versions.map((v) => (
                <option key={v.id} value={v.versionNumber}>v{v.versionNumber} - {v.changeNote ?? 'no note'}</option>
              ))}
            </select>
          </div>
          <Button
            icon={<GitCompare className="h-4 w-4" />}
            disabled={fromValue === toValue}
            onClick={() => navigate(`/prompts/${prompt.id}/compare?from=${fromValue}&to=${toValue}`)}
          >
            Compare versions
          </Button>
        </Card>
      )}

      <Card className="p-5">
        <CardHeader title="Version history" subtitle={`${prompt.versions.length} version${prompt.versions.length === 1 ? '' : 's'} · newest first`} />
        <ol className="relative mt-5 space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[19px] before:w-px before:bg-white/10">
          {prompt.versions.map((version) => {
            const analysis = version.latestAnalysis;
            return (
              <li key={version.id} className="relative flex gap-4">
                <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-ink-900 font-mono text-xs font-semibold text-accent">
                  v{version.versionNumber}
                </span>
                <div className="min-w-0 flex-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm font-medium text-slate-100">{version.changeNote ?? 'No change note'}</p>
                    {version.versionNumber === latest?.versionNumber && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">LATEST</span>}
                    <span className="ml-auto text-xs text-slate-500">{formatDateTime(version.createdAt)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    {analysis ? (
                      <>
                        <span className="font-display text-lg font-semibold tabular-nums" style={{ color: scoreHex(analysis.overallScore ?? 0) }}>
                          {analysis.overallScore}
                        </span>
                        <RiskBadge level={analysis.riskLevel} />
                        <span>{analysis.vulnerabilityCount} vulnerabilities</span>
                      </>
                    ) : (
                      <span className="text-amber-300">Not analysed yet</span>
                    )}
                    <span>· {formatNumber(version.stats.words)} words · ~{formatNumber(version.stats.estimatedTokens)} tokens</span>
                    <span>· {version.analyses.length} analysis run{version.analyses.length === 1 ? '' : 's'}</span>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">Show prompt (sensitive values masked)</summary>
                    <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-black/30 p-3 font-mono text-[11px] leading-5 whitespace-pre-wrap text-slate-400">{version.maskedContent}</pre>
                  </details>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {analysis && (
                      <Link to={`/analyses/${analysis.id}`} className={buttonClasses('secondary', 'sm')}>
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" /> View analysis
                      </Link>
                    )}
                    <Button variant="outline" size="sm" icon={<Play className="h-3.5 w-3.5" />} loading={analyzing === version.id} onClick={() => analyzeVersion(version.id)}>
                      {analysis ? 'Re-analyze' : 'Analyze'}
                    </Button>
                    {version.versionNumber > 1 && (
                      <Link to={`/prompts/${prompt.id}/compare?from=${version.versionNumber - 1}&to=${version.versionNumber}`} className={buttonClasses('ghost', 'sm')}>
                        <GitCompare className="h-3.5 w-3.5" aria-hidden="true" /> vs v{version.versionNumber - 1}
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this prompt?"
        description="All versions and analyses of this prompt will be permanently deleted."
        confirmLabel="Delete prompt"
        loading={deleting}
        onConfirm={deletePrompt}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
