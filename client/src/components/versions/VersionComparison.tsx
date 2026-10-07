import { ArrowDownRight, ArrowUpRight, Minus, ShieldCheck, ShieldX, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ComparedVulnerability, ComparisonResult, DiffRow } from '../../types/api';
import { cn } from '../../utils/cn';
import { formatNumber } from '../../utils/format';
import { CATEGORY_META, CATEGORY_ORDER, scoreHex } from '../../utils/risk';
import { RiskBadge } from '../ui/Badge';
import { Card, CardHeader } from '../ui/Card';
import { CategoryRadarChart } from '../analysis/AnalysisChart';

function Delta({ value, invert = false, suffix = '' }: { value: number | null; invert?: boolean; suffix?: string }) {
  if (value === null) return <span className="text-xs text-slate-500">n/a</span>;
  const good = invert ? value < 0 : value > 0;
  const bad = invert ? value > 0 : value < 0;
  const Icon = value === 0 ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-mono text-xs font-semibold', good && 'text-emerald-300', bad && 'text-rose-300', !good && !bad && 'text-slate-400')}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {value > 0 ? '+' : ''}
      {formatNumber(value)}
      {suffix}
    </span>
  );
}

const VERDICTS = {
  IMPROVED: { title: 'Security improved', tone: 'border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-200', icon: ShieldCheck },
  WORSENED: { title: 'Security got worse', tone: 'border-rose-400/30 bg-rose-400/[0.07] text-rose-200', icon: ShieldX },
  UNCHANGED: { title: 'No significant change', tone: 'border-white/10 bg-white/[0.03] text-slate-200', icon: Minus },
  NOT_ANALYZED: { title: 'Analysis required', tone: 'border-amber-400/30 bg-amber-400/[0.07] text-amber-200', icon: TriangleAlert },
};

function VulnerabilityList({ title, items, tone }: { title: string; items: ComparedVulnerability[]; tone: 'added' | 'removed' | 'same' }) {
  return (
    <div className="min-w-0">
      <p className={cn('text-xs font-semibold tracking-wider uppercase', tone === 'added' ? 'text-rose-300' : tone === 'removed' ? 'text-emerald-300' : 'text-slate-400')}>
        {title} ({items.length})
      </p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">None</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item, index) => (
            <li key={`${item.ruleId}-${index}`} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <RiskBadge level={item.severity} kind="severity" />
                <span className="text-sm text-slate-200">{item.title}</span>
              </div>
              <p className="mt-1 truncate font-mono text-[11px] text-slate-500" title={item.evidence}>
                {item.evidence}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DiffLine({ row }: { row: DiffRow }) {
  const base = 'grid grid-cols-[2.5rem_2.5rem_1.25rem_1fr] font-mono text-[12px] leading-6';
  if (row.type === 'modified') {
    return (
      <div className={cn(base, 'bg-amber-400/[0.05]')}>
        <span className="pr-2 text-right text-slate-600">{row.oldNumber}</span>
        <span className="pr-2 text-right text-slate-600">{row.newNumber}</span>
        <span className="text-amber-300">~</span>
        <span className="pr-3 break-words whitespace-pre-wrap text-slate-300">
          {row.segments?.map((segment, index) => (
            <span
              key={index}
              className={cn(segment.type === 'added' && 'rounded bg-emerald-400/20 text-emerald-200', segment.type === 'removed' && 'rounded bg-rose-400/20 text-rose-200 line-through')}
            >
              {segment.text}
            </span>
          ))}
        </span>
      </div>
    );
  }
  const styles = {
    added: { bg: 'bg-emerald-400/[0.07]', sign: '+', color: 'text-emerald-200' },
    removed: { bg: 'bg-rose-400/[0.07]', sign: '-', color: 'text-rose-200' },
    unchanged: { bg: '', sign: ' ', color: 'text-slate-400' },
  }[row.type];
  return (
    <div className={cn(base, styles.bg)}>
      <span className="pr-2 text-right text-slate-600">{row.oldNumber ?? ''}</span>
      <span className="pr-2 text-right text-slate-600">{row.newNumber ?? ''}</span>
      <span className={styles.color}>{styles.sign}</span>
      <span className={cn('pr-3 break-words whitespace-pre-wrap', styles.color)}>{row.text || ' '}</span>
    </div>
  );
}

/** Collapse long runs of unchanged lines so the changes stand out. */
function DiffView({ rows }: { rows: DiffRow[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const blocks = useMemo(() => {
    const result: Array<{ type: 'rows'; rows: DiffRow[] } | { type: 'collapsed'; id: number; rows: DiffRow[] }> = [];
    let run: DiffRow[] = [];
    const flush = () => {
      if (run.length > 6) {
        result.push({ type: 'rows', rows: run.slice(0, 2) });
        result.push({ type: 'collapsed', id: result.length, rows: run.slice(2, -2) });
        result.push({ type: 'rows', rows: run.slice(-2) });
      } else if (run.length) result.push({ type: 'rows', rows: run });
      run = [];
    };
    for (const row of rows) {
      if (row.type === 'unchanged') run.push(row);
      else {
        flush();
        result.push({ type: 'rows', rows: [row] });
      }
    }
    flush();
    return result;
  }, [rows]);

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-ink-900/70 py-2">
      {blocks.map((block, index) =>
        block.type === 'collapsed' && !expanded.has(block.id) ? (
          <button
            key={index}
            type="button"
            onClick={() => setExpanded((set) => new Set(set).add(block.id))}
            className="my-1 w-full bg-white/[0.02] py-1 text-center text-xs text-slate-500 hover:text-accent"
          >
            Show {block.rows.length} unchanged lines
          </button>
        ) : (
          block.rows.map((row, rowIndex) => <DiffLine key={`${index}-${rowIndex}`} row={row} />)
        ),
      )}
    </div>
  );
}

export function VersionComparison({ result }: { result: ComparisonResult }) {
  const verdict = VERDICTS[result.verdict];
  const VerdictIcon = verdict.icon;
  const overall = result.metrics.find((m) => m.key === 'overall');
  const radarData = CATEGORY_ORDER.map((category) => {
    const metric = result.metrics.find((m) => m.key === category);
    return { label: CATEGORY_META[category].short, from: metric?.from ?? null, to: metric?.to ?? null };
  });
  const analysed = result.verdict !== 'NOT_ANALYZED';

  return (
    <div className="space-y-6">
      <div className={cn('flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center', verdict.tone)} role="status">
        <VerdictIcon className="h-8 w-8 shrink-0" aria-hidden="true" />
        <div className="flex-1">
          <p className="font-display text-lg font-semibold">{verdict.title}</p>
          <p className="text-sm opacity-90">{result.summary}</p>
        </div>
        {overall && overall.from !== null && overall.to !== null && (
          <div className="flex items-center gap-3 font-display text-3xl font-semibold tabular-nums">
            <span style={{ color: scoreHex(overall.from) }}>{overall.from}</span>
            <span className="text-base text-slate-500">→</span>
            <span style={{ color: scoreHex(overall.to) }}>{overall.to}</span>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card className="p-5">
          <CardHeader title="Metric changes" subtitle={`Version ${result.from.versionNumber} → version ${result.to.versionNumber}`} />
          <div className="mt-4 divide-y divide-white/[0.05]">
            {result.metrics.map((metric) => (
              <div key={metric.key} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 py-2.5 text-sm">
                <span className={cn(metric.key === 'overall' ? 'font-semibold text-slate-100' : 'text-slate-300')}>{metric.label}</span>
                <span className="w-10 text-right font-mono text-slate-400">{metric.from ?? '-'}</span>
                <span className="w-10 text-right font-mono text-slate-100">{metric.to ?? '-'}</span>
                <span className="w-16 text-right">
                  <Delta value={metric.delta} />
                </span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 py-2.5 text-sm">
              <span className="text-slate-300">Estimated tokens</span>
              <span className="w-10 text-right font-mono text-slate-400">{formatNumber(result.tokens.from)}</span>
              <span className="w-10 text-right font-mono text-slate-100">{formatNumber(result.tokens.to)}</span>
              <span className="w-16 text-right">
                <Delta value={result.tokens.delta} invert />
              </span>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <CardHeader title="Risk profile" subtitle="Category safety scores (higher is safer)" />
          {analysed ? (
            <CategoryRadarChart
              data={radarData}
              series={[
                { key: 'from', name: `v${result.from.versionNumber}`, color: '#94a3b8' },
                { key: 'to', name: `v${result.to.versionNumber}`, color: '#22d3ee' },
              ]}
            />
          ) : (
            <p className="mt-6 text-sm text-slate-400">Analyse both versions to compare their risk profiles.</p>
          )}
        </Card>
      </div>

      {analysed && (
        <Card className="grid gap-6 p-5 md:grid-cols-3">
          <VulnerabilityList title="Introduced" items={result.vulnerabilities.introduced} tone="added" />
          <VulnerabilityList title="Resolved" items={result.vulnerabilities.removed} tone="removed" />
          <VulnerabilityList title="Still present" items={result.vulnerabilities.persisting} tone="same" />
        </Card>
      )}

      <Card className="p-5">
        <CardHeader
          title="Text changes"
          subtitle="Sensitive values are masked in both versions"
          action={
            <div className="flex gap-3 font-mono text-xs">
              <span className="text-emerald-300">+{result.diff.stats.added} added</span>
              <span className="text-rose-300">-{result.diff.stats.removed} removed</span>
              <span className="text-amber-300">~{result.diff.stats.modified} changed</span>
            </div>
          }
        />
        <div className="mt-4">
          <DiffView rows={result.diff.rows} />
        </div>
      </Card>
    </div>
  );
}
