import { ChevronLeft, ChevronRight, Download, Eye, GitCompare, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { RiskBadge } from '../components/ui/Badge';
import { Button, buttonClasses } from '../components/ui/Button';
import { Card, Eyebrow } from '../components/ui/Card';
import { DataTable, type Column } from '../components/ui/DataTable';
import { inputClasses } from '../components/ui/FormField';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { Tooltip } from '../components/ui/Tooltip';
import { useToast } from '../context/ToastContext';
import { useAsync, useDebouncedValue, useDocumentTitle } from '../hooks/useAsync';
import { analysisService } from '../services/analysisService';
import type { AnalysisSummary } from '../types/api';
import { cn } from '../utils/cn';
import { formatDateTime } from '../utils/format';
import { downloadBlob, getErrorMessage } from '../utils/helpers';
import { scoreHex } from '../utils/risk';

const STATUS_STYLE: Record<string, string> = {
  COMPLETED: 'text-emerald-300',
  RUNNING: 'text-accent',
  PENDING: 'text-slate-400',
  FAILED: 'text-rose-300',
};

export default function HistoryPage() {
  useDocumentTitle('Analysis history');
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [riskLevel, setRiskLevel] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 350);

  const { data, error, loading, reload } = useAsync(
    () =>
      analysisService.list({
        search: debouncedSearch || undefined,
        riskLevel: riskLevel || undefined,
        status: status || undefined,
        sort,
        page,
        pageSize: 10,
      }),
    [debouncedSearch, riskLevel, status, sort, page],
  );

  const downloadPdf = async (row: AnalysisSummary) => {
    setDownloading(row.id);
    try {
      const { blob, filename } = await analysisService.pdf(row.id);
      downloadBlob(blob, filename);
    } catch (downloadError) {
      toast.error(getErrorMessage(downloadError));
    } finally {
      setDownloading(null);
    }
  };

  const columns: Column<AnalysisSummary>[] = [
    {
      key: 'prompt',
      header: 'Prompt',
      render: (row) => (
        <Link to={`/prompts/${row.prompt.id}`} className="font-medium text-slate-100 hover:text-accent" onClick={(e) => e.stopPropagation()}>
          {row.prompt.title}
        </Link>
      ),
    },
    { key: 'version', header: 'Version', render: (row) => <span className="font-mono text-slate-300">v{row.version.versionNumber}</span> },
    { key: 'date', header: 'Date', render: (row) => <span className="text-slate-400">{formatDateTime(row.createdAt)}</span> },
    {
      key: 'score',
      header: 'Score',
      render: (row) => (
        <span className="font-display text-lg font-semibold tabular-nums" style={{ color: scoreHex(row.overallScore ?? 0) }}>
          {row.overallScore ?? '-'}
        </span>
      ),
    },
    { key: 'risk', header: 'Risk level', render: (row) => <RiskBadge level={row.riskLevel} /> },
    { key: 'vulns', header: 'Vulnerabilities', render: (row) => <span className="text-slate-300">{row.vulnerabilityCount}</span> },
    { key: 'status', header: 'Status', render: (row) => <span className={cn('text-xs font-semibold', STATUS_STYLE[row.status])}>{row.status}</span> },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (row) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Tooltip content="View results">
            <Link to={`/analyses/${row.id}`} className={buttonClasses('ghost', 'sm')} aria-label={`View analysis of ${row.prompt.title}`}>
              <Eye className="h-4 w-4" />
            </Link>
          </Tooltip>
          <Tooltip content={row.version.versionNumber > 1 ? 'Compare with previous version' : 'Only one version'}>
            <button
              type="button"
              disabled={row.version.versionNumber <= 1}
              onClick={() => navigate(`/prompts/${row.prompt.id}/compare?from=${row.version.versionNumber - 1}&to=${row.version.versionNumber}`)}
              className={buttonClasses('ghost', 'sm')}
              aria-label="Compare with previous version"
            >
              <GitCompare className="h-4 w-4" />
            </button>
          </Tooltip>
          <Tooltip content="Download PDF report">
            <Button variant="ghost" size="sm" loading={downloading === row.id} disabled={row.status !== 'COMPLETED'} onClick={() => downloadPdf(row)} aria-label="Download PDF report">
              {downloading === row.id ? null : <Download className="h-4 w-4" />}
            </Button>
          </Tooltip>
        </div>
      ),
    },
  ];

  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Epic 4 · Analysis history</Eyebrow>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Analysis History</h1>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <label htmlFor="history-search" className="sr-only">Search by prompt name</label>
            <input id="history-search" className={cn(inputClasses, 'pl-10')} placeholder="Search by prompt name" value={search} onChange={(e) => resetPage(setSearch)(e.target.value)} />
          </div>
          <label htmlFor="history-risk" className="sr-only">Risk level</label>
          <select id="history-risk" className={cn(inputClasses, 'md:w-44')} value={riskLevel} onChange={(e) => resetPage(setRiskLevel)(e.target.value)}>
            <option value="">All risk levels</option>
            {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'MINIMAL'].map((level) => (
              <option key={level} value={level}>{level.charAt(0) + level.slice(1).toLowerCase()}</option>
            ))}
          </select>
          <label htmlFor="history-status" className="sr-only">Status</label>
          <select id="history-status" className={cn(inputClasses, 'md:w-40')} value={status} onChange={(e) => resetPage(setStatus)(e.target.value)}>
            <option value="">All statuses</option>
            {['COMPLETED', 'RUNNING', 'FAILED'].map((s) => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
          <label htmlFor="history-sort" className="sr-only">Sort</label>
          <select id="history-sort" className={cn(inputClasses, 'md:w-44')} value={sort} onChange={(e) => resetPage(setSort)(e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="score_desc">Highest score</option>
            <option value="score_asc">Lowest score</option>
          </select>
        </div>
      </Card>

      {Boolean(error) && <ErrorState message={getErrorMessage(error)} onRetry={reload} />}
      {loading && !data && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      )}
      {data && data.total === 0 && (
        <EmptyState
          title={debouncedSearch || riskLevel || status ? 'No analyses match your filters' : 'No analyses yet'}
          description="Analyses appear here after you run a security scan."
          action={<Link to="/analyze" className={buttonClasses('primary')}>New analysis</Link>}
        />
      )}
      {data && data.total > 0 && (
        <Card className={cn('p-2 md:p-3', loading && 'opacity-60')}>
          <DataTable columns={columns} rows={data.items} rowKey={(row) => row.id} caption="Analysis history" onRowClick={(row) => navigate(`/analyses/${row.id}`)} />
          <div className="flex items-center justify-between px-3 py-3 text-sm text-slate-400">
            <span>
              Page {data.page} of {data.totalPages} · {data.total} analyses
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} icon={<ChevronLeft className="h-4 w-4" />} aria-label="Previous page">
                Prev
              </Button>
              <Button variant="secondary" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
