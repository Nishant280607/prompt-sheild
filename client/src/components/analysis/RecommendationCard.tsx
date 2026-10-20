import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Recommendation } from '../../types/api';
import { CATEGORY_META } from '../../utils/risk';
import { RiskBadge } from '../ui/Badge';

const MAX_ACTIONS = 3;

export function RecommendationCard({ recommendation, footer }: { recommendation: Recommendation; footer?: ReactNode }) {
  const shownActions = recommendation.actions.slice(0, MAX_ACTIONS);
  const hiddenActions = recommendation.actions.length - shownActions.length;

  return (
    <article className="glass rounded-2xl p-5">
      <header className="flex flex-wrap items-center gap-2">
        <RiskBadge level={recommendation.priority} kind="severity" />
        {recommendation.category && (
          <span className="text-[11px] tracking-wider text-slate-500 uppercase">{CATEGORY_META[recommendation.category].label}</span>
        )}
      </header>
      <h3 className="mt-3 text-base font-semibold">{recommendation.title}</h3>
      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-400">{recommendation.description}</p>
      <ul className="mt-4 space-y-2">
        {shownActions.map((action) => (
          <li key={action} className="flex gap-2.5 text-sm text-slate-300">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span className="line-clamp-2">{action}</span>
          </li>
        ))}
      </ul>
      {hiddenActions > 0 && (
        <p className="mt-2 pl-[26px] text-xs text-slate-500">+{hiddenActions} more step{hiddenActions === 1 ? '' : 's'}</p>
      )}
      {footer && <div className="mt-4 border-t border-white/[0.06] pt-3">{footer}</div>}
    </article>
  );
}
