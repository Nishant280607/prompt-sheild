import { CircleAlert, RefreshCw, ScanLine } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-shimmer rounded-lg bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.09)_50%,rgba(255,255,255,0.04)_100%)] bg-[length:800px_100%]',
        className,
      )}
    />
  );
}

/** Radar-style spinner used while data loads. */
export function LoadingState({ label = 'Loading', fullScreen = false }: { label?: string; fullScreen?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-4 text-slate-400', fullScreen ? 'min-h-screen' : 'py-16')}
    >
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 rounded-full border border-accent/20" />
        <div className="absolute inset-2 rounded-full border border-accent/10" />
        <div className="absolute inset-0 animate-sweep rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(34,211,238,0.45)_60deg,transparent_62deg)]" />
        <div className="absolute top-1/2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
      </div>
      <p className="text-xs font-medium tracking-[0.2em] uppercase">{label}</p>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center', className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
        {icon ?? <ScanLine className="h-5 w-5" />}
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm text-slate-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  className,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-500/[0.04] px-6 py-12 text-center', className)}>
      <CircleAlert className="mb-3 h-8 w-8 text-rose-300" aria-hidden="true" />
      <h3 className="text-base font-semibold text-rose-100">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-slate-400">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
