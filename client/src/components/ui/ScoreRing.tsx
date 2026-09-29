import { useEffect, useId, useState } from 'react';
import { ratingFor, scoreHex } from '../../utils/risk';

interface ScoreRingProps {
  score: number;
  size?: number;
  stroke?: number;
  label?: string;
  animate?: boolean;
}

/** Circular security score indicator with a count-up animation. */
export function ScoreRing({ score, size = 168, stroke = 12, label, animate = true }: ScoreRingProps) {
  const id = useId();
  const [display, setDisplay] = useState(animate ? 0 : score);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = scoreHex(score);
  const { rating } = ratingFor(score);

  useEffect(() => {
    if (!animate || typeof requestAnimationFrame !== 'function') {
      setDisplay(score);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 1100);
      setDisplay(Math.round(score * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score, animate]);

  const ticks = Array.from({ length: 40 }, (_, i) => i);

  return (
    <div
      role="img"
      aria-label={`Security score ${score} out of 100: ${rating}`}
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <defs>
          <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {ticks.map((tick) => {
          const angle = (tick / ticks.length) * Math.PI * 2;
          const inner = radius - stroke;
          const outer = radius - stroke + 4;
          const c = size / 2;
          return (
            <line
              key={tick}
              x1={c + inner * Math.cos(angle)}
              y1={c + inner * Math.sin(angle)}
              x2={c + outer * Math.cos(angle)}
              y2={c + outer * Math.sin(angle)}
              stroke="rgba(148,163,184,0.18)"
              strokeWidth="1"
            />
          );
        })}
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - display / 100)}
          filter={`url(#${id}-glow)`}
          style={{ transition: 'stroke 0.4s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-semibold text-slate-50 tabular-nums" style={{ fontSize: size * 0.26 }}>
          {display}
        </span>
        <span className="mt-0.5 text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color }}>
          {label ?? rating}
        </span>
      </div>
    </div>
  );
}
