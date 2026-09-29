import { Bot, MapPin } from 'lucide-react';
import type { Finding } from '../../types/api';
import { RiskBadge } from '../ui/Badge';

export function FindingCard({ finding, showCategory = false }: { finding: Finding; showCategory?: boolean }) {
  return (
    <article className="rounded-xl border border-white/[0.07] bg-ink-900/60 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <RiskBadge level={finding.severity} kind="severity" />
        <h4 className="min-w-0 flex-1 text-sm font-semibold text-slate-100">{finding.title}</h4>
        <span className="font-mono text-[11px] text-slate-500">{finding.ruleId}</span>
      </header>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        {showCategory && <span>{finding.categoryLabel}</span>}
        {finding.line !== null && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" aria-hidden="true" /> Line {finding.line}
            {finding.column !== null && `, col ${finding.column}`}
          </span>
        )}
        {finding.source === 'AI' && (
          <span className="inline-flex items-center gap-1 text-violet-300">
            <Bot className="h-3 w-3" aria-hidden="true" /> AI review
          </span>
        )}
      </div>
      {finding.evidence && (
        <pre className="mt-3 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-cyan-100/90">
          <span className="sr-only">Evidence: </span>
          {finding.evidence}
        </pre>
      )}
      <p className="mt-2.5 text-sm leading-relaxed text-slate-400">{finding.explanation}</p>
    </article>
  );
}
