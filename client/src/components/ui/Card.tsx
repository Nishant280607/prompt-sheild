import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

/**
 * Glass panel. `min-w-0` lets a card shrink inside grid and flex layouts instead of being
 * stretched by wide content (tables, code, long words), which would push the page sideways.
 */
export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('glass min-w-0 rounded-2xl', className)} {...props}>
      {children}
    </div>
  );
}

/** Card title row. When space runs out, the action moves below the title instead of squeezing it. */
export function CardHeader({
  title,
  subtitle,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-3', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-50">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="ml-auto max-w-full shrink-0">{action}</div>}
    </div>
  );
}

/** Small uppercase label used above values, e.g. "ANALYSIS ID". */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[11px] font-medium tracking-[0.18em] text-slate-500 uppercase', className)}>{children}</p>;
}
