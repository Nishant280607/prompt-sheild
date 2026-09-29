import { useId, type ReactNode } from 'react';
import { cn } from '../../utils/cn';

/** Hover/focus tooltip. The trigger should be focusable for keyboard users. */
export function Tooltip({ content, children, className }: { content: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <span className={cn('group relative inline-flex', className)} aria-describedby={id}>
      {children}
      <span
        role="tooltip"
        id={id}
        className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-max max-w-64 -translate-x-1/2 rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1.5 text-xs leading-snug font-normal text-slate-200 opacity-0 shadow-xl transition duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}
