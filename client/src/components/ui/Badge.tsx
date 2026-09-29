import type { ReactNode } from 'react';
import type { RiskLevel, Severity } from '../../types/api';
import { cn } from '../../utils/cn';
import { RISK_TONES, SEVERITY_TONES } from '../../utils/risk';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'violet';

const TONES: Record<Tone, string> = {
  neutral: 'border-white/10 bg-white/[0.05] text-slate-300',
  accent: 'border-accent/30 bg-accent/10 text-accent',
  success: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  warning: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  danger: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
  violet: 'border-violet-400/30 bg-violet-400/10 text-violet-300',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', TONES[tone], className)}>
      {children}
    </span>
  );
}

/** Colour-coded badge for a risk level (MINIMAL...CRITICAL) or finding severity (INFO...CRITICAL). */
export function RiskBadge({
  level,
  kind = 'risk',
  className,
}: {
  level: RiskLevel | Severity | null | undefined;
  kind?: 'risk' | 'severity';
  className?: string;
}) {
  if (!level) return <Badge className={className}>Not analysed</Badge>;
  const tone =
    kind === 'severity'
      ? SEVERITY_TONES[level as Severity]
      : (RISK_TONES[level as RiskLevel] ?? SEVERITY_TONES[level as Severity]);
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', tone.bg, tone.border, tone.text, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} aria-hidden="true" />
      {tone.label}
    </span>
  );
}
