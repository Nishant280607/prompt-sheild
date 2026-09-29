import { CircleAlert, CircleCheck, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { Highlight, ValidationResult } from '../../types/api';
import { cn } from '../../utils/cn';
import { formatNumber } from '../../utils/format';
import { sizeClass, textStats } from '../../utils/helpers';
import { SEVERITY_TONES } from '../../utils/risk';

/** Live character/word/token statistics shown under the editor. */
export function PromptStats({ content }: { content: string }) {
  const stats = textStats(content);
  const size = sizeClass(stats.estimatedTokens);
  const items = [
    ['Characters', formatNumber(stats.characters)],
    ['Words', formatNumber(stats.words)],
    ['Lines', formatNumber(stats.lines)],
    ['Est. tokens', `~${formatNumber(stats.estimatedTokens)}`],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs text-slate-400">
      {items.map(([label, value]) => (
        <span key={label}>
          {label} <span className="text-slate-100">{value}</span>
        </span>
      ))}
      <span
        className={cn(
          'rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
          size === 'HIGH' ? 'border-orange-400/30 text-orange-300' : size === 'MEDIUM' ? 'border-amber-400/30 text-amber-300' : 'border-emerald-400/30 text-emerald-300',
        )}
        title="Prompt size class (estimate)"
      >
        {size} SIZE
      </span>
    </div>
  );
}

export function ValidationPanel({
  validation,
  checking,
  highlights = [],
}: {
  validation: ValidationResult | null;
  checking: boolean;
  highlights?: Highlight[];
}) {
  const status = checking ? 'checking' : !validation ? 'idle' : validation.valid ? 'valid' : 'invalid';
  const grouped = new Map<string, { label: string; severity: Highlight['severity']; count: number }>();
  for (const h of highlights) {
    const entry = grouped.get(h.ruleId) ?? { label: h.label, severity: h.severity, count: 0 };
    entry.count += 1;
    grouped.set(h.ruleId, entry);
  }

  return (
    <div className="glass space-y-4 rounded-2xl p-5" aria-live="polite">
      <div className="flex items-center gap-2.5">
        {status === 'checking' && <LoaderCircle className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />}
        {status === 'valid' && <CircleCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />}
        {status === 'invalid' && <CircleAlert className="h-4 w-4 text-rose-300" aria-hidden="true" />}
        {status === 'idle' && <span className="h-2 w-2 rounded-full bg-slate-600" aria-hidden="true" />}
        <p className="text-sm font-semibold">
          {status === 'checking' && 'Validating...'}
          {status === 'valid' && 'Prompt is valid'}
          {status === 'invalid' && 'Fix the errors below before analysing'}
          {status === 'idle' && 'Validation runs as you type'}
        </p>
      </div>

      {validation && validation.errors.length > 0 && (
        <ul className="space-y-1.5" role="alert">
          {validation.errors.map((issue, index) => (
            <li key={`${issue.code}-${index}`} className="flex gap-2 text-sm text-rose-200">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {issue.message}
                {issue.line && <span className="text-rose-300/70"> (line {issue.line})</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {validation && validation.warnings.length > 0 && (
        <ul className="space-y-1.5">
          {validation.warnings.map((issue, index) => (
            <li key={`${issue.code}-${index}`} className="flex gap-2 text-sm text-amber-200/90">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      )}

      {validation && validation.placeholders.length > 0 && (
        <div>
          <p className="text-[11px] tracking-wider text-slate-500 uppercase">Template placeholders</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {validation.placeholders.map((name) => (
              <code key={name} className="rounded-md border border-accent/20 bg-accent/10 px-1.5 py-0.5 text-xs text-cyan-200">
                {`{{${name}}}`}
              </code>
            ))}
          </div>
        </div>
      )}

      {grouped.size > 0 && (
        <div>
          <p className="text-[11px] tracking-wider text-slate-500 uppercase">Suspicious patterns (pre-scan)</p>
          <ul className="mt-2 space-y-1.5">
            {[...grouped.entries()].map(([ruleId, entry]) => (
              <li key={ruleId} className="flex items-center gap-2 text-xs">
                <span className={cn('h-2 w-2 rounded-full', SEVERITY_TONES[entry.severity].dot)} aria-hidden="true" />
                <span className="text-slate-300">{entry.label}</span>
                <span className="ml-auto font-mono text-slate-500">
                  {ruleId} ×{entry.count}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
