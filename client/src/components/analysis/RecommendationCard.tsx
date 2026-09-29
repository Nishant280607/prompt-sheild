import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Recommendation } from '../../types/api';
import { CATEGORY_META } from '../../utils/risk';
import { RiskBadge } from '../ui/Badge';

export function RecommendationCard({ recommendation, footer }: { recommendation: Recommendation; footer?: ReactNode }) {
  return (
    <article className="glass rounded-2xl p-5">
      <header className="flex flex-wrap items-center gap-2">
        <RiskBadge level={recommendation.priority} kind="severity" />
        {recommendation.category && (
          <span className="text-[11px] tracking-wider text-slate-500 uppercase">{CATEGORY_META[recommendation.category].label}</span>
        )}
      </header>
      <h3 className="mt-3 text-base font-semibold">{recommendation.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{recommendation.description}</p>
      <ul className="mt-4 space-y-2">
        {recommendation.actions.map((action) => (
          <li key={action} className="flex gap-2.5 text-sm text-slate-300">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span>{action}</span>
          </li>
        ))}
      </ul>
      {recommendation.relatedRuleIds.length > 0 && (
        <p className="mt-4 flex flex-wrap gap-1.5">
          {recommendation.relatedRuleIds.map((rule) => (
            <span key={rule} className="rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
              {rule}
            </span>
          ))}
        </p>
      )}
      {footer && <div className="mt-4 border-t border-white/[0.06] pt-3">{footer}</div>}
    </article>
  );
}
