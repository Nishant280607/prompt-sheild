import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-linear-to-r from-cyan-400 to-sky-500 text-ink-950 font-semibold shadow-[0_0_28px_-8px_rgba(34,211,238,0.7)] hover:from-cyan-300 hover:to-sky-400',
  secondary: 'border border-white/10 bg-white/[0.06] text-slate-100 hover:border-white/20 hover:bg-white/[0.1]',
  outline: 'border border-accent/40 text-accent hover:bg-accent/10',
  ghost: 'text-slate-300 hover:bg-white/[0.06] hover:text-white',
  danger: 'border border-rose-500/30 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-xs',
  md: 'h-10 gap-2 rounded-xl px-4 text-sm',
  lg: 'h-12 gap-2.5 rounded-xl px-6 text-[15px]',
};

export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant, size, loading = false, icon, children, className, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}
