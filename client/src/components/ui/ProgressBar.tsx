import { cn } from '../../utils/cn';
import { scoreHex } from '../../utils/risk';

export function ProgressBar({
  value,
  max = 100,
  color,
  label,
  className,
  thin = false,
}: {
  value: number;
  max?: number;
  color?: string;
  label?: string;
  className?: string;
  thin?: boolean;
}) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  const fill = color ?? scoreHex(percent);
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn('w-full overflow-hidden rounded-full bg-white/[0.07]', thin ? 'h-1' : 'h-1.5', className)}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${percent}%`, background: fill, boxShadow: `0 0 12px ${fill}66` }}
      />
    </div>
  );
}
