import { Braces, ChevronDown, Coins, KeyRound, ShieldAlert, Workflow } from 'lucide-react';
import { useState } from 'react';
import type { Category, CategoryResult, ConsistencyProbe } from '../../types/api';
import { cn } from '../../utils/cn';
import { formatNumber } from '../../utils/format';
import { CATEGORY_META, scoreHex } from '../../utils/risk';
import { RiskBadge } from '../ui/Badge';
import { ProgressBar } from '../ui/ProgressBar';
import { ConsistencyRuns } from './ConsistencyRuns';
import { FindingCard } from './FindingCard';

export const CATEGORY_ICONS: Record<Category, typeof ShieldAlert> = {
  prompt_injection: Braces,
  jailbreak: ShieldAlert,
  information_leakage: KeyRound,
  consistency: Workflow,
  token_cost: Coins,
};

/** Card for one security dimension: score, severity, detection status, explanation and findings. */
export function SecurityCategoryCard({ result, defaultOpen = false }: { result: CategoryResult; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = CATEGORY_ICONS[result.category];
  const actionable = result.findings.filter((f) => f.severity !== 'INFO');
  const protections = (result.details.protections as string[] | undefined) ?? [];
  const probes = result.details.probes as ConsistencyProbe[] | undefined;
  const color = scoreHex(result.score);

  return (
    <section className="glass flex flex-col rounded-2xl p-5" aria-labelledby={`cat-${result.category}`}>
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]" style={{ color }}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={`cat-${result.category}`} className="text-sm font-semibold">
            {result.label}
          </h3>
          <p className="text-xs text-slate-500">{CATEGORY_META[result.category].description}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl leading-none font-semibold tabular-nums" style={{ color }}>
            {result.score}
          </p>
          <p className="mt-1 text-[10px] tracking-widest text-slate-500 uppercase">/ 100</p>
        </div>
      </header>

      <ProgressBar value={result.score} className="mt-4" label={`${result.label} score`} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <RiskBadge level={result.riskLevel} />
        <span
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-xs font-medium',
            result.detected ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
          )}
        >
          {result.detected ? 'Issues detected' : 'Not detected'}
        </span>
        <span className="text-xs text-slate-500">Weight {Math.round(result.weight * 100)}%</span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-slate-400">{result.explanation}</p>

      {result.category === 'token_cost' && (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            ['Est. tokens', formatNumber(result.details.estimatedTokens as number)],
            ['Size class', String(result.details.sizeClass ?? '-')],
            ['Relative cost', `${String(result.details.relativeCost ?? '-')}x`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2">
              <dt className="text-[10px] tracking-wider text-slate-500 uppercase">{label}</dt>
              <dd className="mt-0.5 font-mono text-sm text-slate-100">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {protections.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {protections.map((protection) => (
            <span key={protection} className="rounded-md border border-emerald-400/20 bg-emerald-400/[0.07] px-2 py-0.5 text-[11px] text-emerald-200">
              ✓ {protection}
            </span>
          ))}
        </div>
      )}

      {(result.findings.length > 0 || probes) && (
        <div className="mt-4 border-t border-white/[0.06] pt-3">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex w-full items-center justify-between rounded-lg py-1 text-left text-sm font-medium text-slate-200 hover:text-white"
            aria-expanded={open}
          >
            {actionable.length > 0 ? `${actionable.length} finding${actionable.length > 1 ? 's' : ''}` : 'Details'}
            {result.findings.length > actionable.length && ` · ${result.findings.length - actionable.length} informational`}
            <ChevronDown className={cn('h-4 w-4 transition', open && 'rotate-180')} aria-hidden="true" />
          </button>
          {open && (
            <div className="mt-3 space-y-3">
              {probes && <ConsistencyRuns probes={probes} />}
              {result.findings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
