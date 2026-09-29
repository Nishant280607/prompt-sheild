import type { ConsistencyProbe } from '../../types/api';
import { cn } from '../../utils/cn';

const STATUS_STYLE = {
  DEFINED: 'text-emerald-300',
  UNDEFINED: 'text-amber-300',
  CONFLICTING: 'text-rose-300',
};

/** Probe x simulated-run matrix: divergent runs are highlighted. */
export function ConsistencyRuns({ probes }: { probes: ConsistencyProbe[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-xs">
        <caption className="sr-only">Simulated consistency runs per behaviour probe</caption>
        <thead>
          <tr className="text-[10px] tracking-[0.14em] text-slate-500 uppercase">
            <th scope="col" className="py-2 pr-3 font-medium">Probe</th>
            {[1, 2, 3, 4, 5].map((run) => (
              <th key={run} scope="col" className="px-1.5 py-2 text-center font-medium">
                Run {run}
              </th>
            ))}
            <th scope="col" className="py-2 pl-2 text-right font-medium">Agreement</th>
          </tr>
        </thead>
        <tbody>
          {probes.map((probe) => {
            const counts = new Map<string, number>();
            probe.outcomes.forEach((o) => counts.set(o, (counts.get(o) ?? 0) + 1));
            const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
            return (
              <tr key={probe.id} className="border-t border-white/[0.05]">
                <th scope="row" className="py-2 pr-3 font-normal">
                  <span className="block text-slate-200">{probe.label}</span>
                  <span className={cn('text-[10px] font-semibold tracking-wider', STATUS_STYLE[probe.status])}>{probe.status}</span>
                </th>
                {probe.outcomes.map((outcome, index) => (
                  <td key={index} className="px-1 py-2">
                    <span
                      title={outcome}
                      className={cn(
                        'block truncate rounded-md px-1.5 py-1 text-center text-[10px]',
                        outcome === majority ? 'bg-white/[0.04] text-slate-400' : 'bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/30',
                      )}
                    >
                      {outcome}
                    </span>
                  </td>
                ))}
                <td className="py-2 pl-2 text-right font-mono text-slate-300">{Math.round(probe.agreement * 100)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
