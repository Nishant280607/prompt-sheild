import { Check, CircleX, LoaderCircle } from 'lucide-react';
import type { StageKey } from '../../types/api';
import { cn } from '../../utils/cn';
import { formatDuration } from '../../utils/format';

export interface DisplayStage {
  key: StageKey;
  label: string;
  state: 'pending' | 'active' | 'done' | 'failed';
  summary?: string;
  durationMs?: number;
}

/** Vertical list of pipeline stages, driven by the stage log returned by the API. */
export function ScannerStatus({ stages }: { stages: DisplayStage[] }) {
  return (
    <ol className="space-y-1" aria-label="Analysis stages">
      {stages.map((stage, index) => (
        <li
          key={stage.key}
          className={cn(
            'relative flex gap-3 rounded-xl px-3 py-2.5 transition',
            stage.state === 'active' && 'bg-accent/[0.07]',
            stage.state === 'pending' && 'opacity-45',
          )}
          aria-current={stage.state === 'active' ? 'step' : undefined}
        >
          {index < stages.length - 1 && <span className="absolute top-9 bottom-[-6px] left-[23px] w-px bg-white/10" aria-hidden="true" />}
          <span
            className={cn(
              'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px]',
              stage.state === 'done' && 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300',
              stage.state === 'active' && 'border-accent/50 bg-accent/15 text-accent',
              stage.state === 'failed' && 'border-rose-400/40 bg-rose-400/15 text-rose-300',
              stage.state === 'pending' && 'border-white/15 text-slate-500',
            )}
          >
            {stage.state === 'done' && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            {stage.state === 'active' && <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {stage.state === 'failed' && <CircleX className="h-3.5 w-3.5" aria-hidden="true" />}
            {stage.state === 'pending' && index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className={cn('font-mono text-xs font-semibold tracking-[0.14em] uppercase', stage.state === 'active' ? 'text-accent' : 'text-slate-200')}>
                {stage.label}
              </p>
              {stage.state === 'done' && stage.durationMs !== undefined && (
                <span className="font-mono text-[11px] text-slate-500">{formatDuration(stage.durationMs)}</span>
              )}
            </div>
            {stage.summary && stage.state !== 'pending' && <p className="mt-0.5 text-xs text-slate-400">{stage.summary}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
