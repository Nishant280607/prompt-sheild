import { useId } from 'react';
import { cn } from '../../utils/cn';

/** Prompt Shield mark: a shield containing a prompt chevron and cursor. */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-edge`} x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
        <radialGradient id={`${id}-core`} cx="0" cy="0" r="1" gradientTransform="translate(16 14) scale(12)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" stopOpacity="0.25" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d="M16 2.5 27 6.6v8.3c0 7.2-4.6 12.3-11 14.6C9.6 27.2 5 22.1 5 14.9V6.6L16 2.5Z" fill="#070a12" />
      <path d="M16 2.5 27 6.6v8.3c0 7.2-4.6 12.3-11 14.6C9.6 27.2 5 22.1 5 14.9V6.6L16 2.5Z" fill={`url(#${id}-core)`} stroke={`url(#${id}-edge)`} strokeWidth="1.8" />
      <path d="m11 12.5 4 3.5-4 3.5" stroke="#22d3ee" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 19.5h4.5" stroke="#a78bfa" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className="h-8 w-8 drop-shadow-[0_0_12px_rgba(34,211,238,0.35)]" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[17px] font-semibold tracking-tight text-slate-50">
          Prompt<span className="text-accent">Shield</span>
        </span>
        {!compact && <span className="mt-1 text-[9px] font-medium tracking-[0.28em] text-slate-500">LLM SECURITY</span>}
      </span>
    </span>
  );
}
