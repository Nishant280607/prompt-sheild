import {
  ChevronRight,
  Clock,
  FilePlus,
  GitCompare,
  LayoutDashboard,
  Lightbulb,
  Settings,
  Upload,
  X,
} from 'lucide-react';
import { NavLink } from 'react-router';
import type { AIStatus } from '../../types/api';
import { cn } from '../../utils/cn';
import { Logo } from '../brand/Logo';

const NAV = [
  {
    group: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    group: 'Analyze',
    items: [
      { to: '/analyze', label: 'New Analysis', icon: FilePlus, end: true },
      { to: '/analyze/upload', label: 'Upload Template', icon: Upload },
    ],
  },
  {
    group: 'Insights',
    items: [
      { to: '/history', label: 'Analysis History', icon: Clock },
      { to: '/prompts', label: 'Prompts & Versions', icon: GitCompare },
      { to: '/recommendations', label: 'Recommendations', icon: Lightbulb },
    ],
  },
  {
    group: 'Account',
    items: [{ to: '/settings', label: 'Settings', icon: Settings }],
  },
];

export function Sidebar({ open, onClose, aiStatus }: { open: boolean; onClose: () => void; aiStatus: AIStatus | null }) {
  return (
    <>
      <div
        className={cn('fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition lg:hidden', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-68 flex-col border-r border-white/[0.07] bg-ink-900/90 backdrop-blur-xl transition-transform duration-300 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-16 items-center justify-between px-5">
          <NavLink to="/dashboard" onClick={onClose} aria-label="Prompt Shield dashboard">
            <Logo />
          </NavLink>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 lg:hidden" aria-label="Close navigation">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {NAV.map((section) => (
            <div key={section.group}>
              <p className="px-3 pb-2 text-[10px] font-semibold tracking-[0.22em] text-slate-600 uppercase">{section.group}</p>
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={'end' in item ? item.end : false}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
                          isActive
                            ? 'bg-linear-to-r from-accent/15 to-transparent text-white'
                            : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-accent shadow-[0_0_10px_#22d3ee]" />}
                          <item.icon className={cn('h-4 w-4', isActive ? 'text-accent' : 'text-slate-500 group-hover:text-slate-300')} aria-hidden="true" />
                          <span className="flex-1">{item.label}</span>
                          {isActive && <ChevronRight className="h-3.5 w-3.5 text-accent/70" aria-hidden="true" />}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="m-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-500 uppercase">Analysis mode</p>
          <p className="mt-1.5 flex items-center gap-2 text-sm text-slate-200">
            <span className={cn('h-2 w-2 animate-pulse-soft rounded-full', aiStatus?.mode === 'AI_ENHANCED' ? 'bg-violet-glow' : 'bg-sev-safe')} />
            {aiStatus ? (aiStatus.mode === 'AI_ENHANCED' ? `AI Enhanced (${aiStatus.provider})` : 'Local') : 'Checking...'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {aiStatus?.mode === 'AI_ENHANCED' ? 'Local scanners plus AI review.' : 'Deterministic scanners, no data leaves your machine.'}
          </p>
        </div>
      </aside>
    </>
  );
}
