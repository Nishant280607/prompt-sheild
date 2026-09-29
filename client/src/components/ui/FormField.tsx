import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export const inputClasses =
  'w-full rounded-xl border border-white/10 bg-ink-900/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20 focus:outline-none disabled:opacity-60 aria-[invalid=true]:border-rose-400/60';

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-300">
        {label}
        {required && <span className="ml-0.5 text-accent" aria-hidden="true">*</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      ) : (
        hint && <p id={`${htmlFor}-hint`} className="text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}
