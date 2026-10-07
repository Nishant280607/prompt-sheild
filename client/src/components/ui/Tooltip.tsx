import { useId, type ReactNode } from 'react';
import { cn } from '../../utils/cn';

/**
 * Hover/focus tooltip. The trigger should be focusable for keyboard users.
 * The bubble is not rendered into the layout until it is shown, so tooltips near the screen
 * edge cannot make the page scroll sideways. Use align="end" for triggers at the right edge.
 */
export function Tooltip({
  content,
  children,
  className,
  align = 'center',
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  align?: 'center' | 'end';
}) {
  const id = useId();
  return (
    <span className={cn('group relative inline-flex', className)} aria-describedby={id}>
      {children}
      <span
        role="tooltip"
        id={id}
        className={cn(
          'pointer-events-none absolute bottom-full z-40 mb-2 hidden w-max max-w-64 rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1.5 text-xs leading-snug font-normal text-slate-200 shadow-xl group-focus-within:block group-hover:block',
          align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2',
        )}
      >
        {content}
      </span>
    </span>
  );
}
