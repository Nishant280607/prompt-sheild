import { LogOut, Menu, Plus, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import type { AIStatus } from '../../types/api';
import { cn } from '../../utils/cn';
import { buttonClasses } from '../ui/Button';

export function Topbar({ onMenu, aiStatus }: { onMenu: () => void; aiStatus: AIStatus | null }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const initials = (user?.name ?? '?')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-white/[0.06] bg-ink-950/70 px-4 backdrop-blur-xl sm:px-6">
      <button type="button" onClick={onMenu} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 lg:hidden" aria-label="Open navigation">
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-slate-400 sm:flex">
        <span className={cn('h-1.5 w-1.5 rounded-full', aiStatus?.mode === 'AI_ENHANCED' ? 'bg-violet-glow' : 'bg-sev-safe')} />
        Analysis Mode: <span className="font-medium text-slate-200">{aiStatus?.label ?? '...'}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Link to="/analyze" className={buttonClasses('primary', 'sm', 'hidden sm:inline-flex')}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New analysis
        </Link>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.03] py-1 pr-3 pl-1 text-sm text-slate-200 hover:bg-white/[0.07]"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-linear-to-br from-cyan-400/80 to-violet-500/80 text-xs font-semibold text-ink-950">
              {initials}
            </span>
            <span className="hidden max-w-32 truncate md:inline">{user?.name}</span>
          </button>
          {menuOpen && (
            <div role="menu" className="glass absolute right-0 z-30 mt-2 w-56 animate-fade-up rounded-xl bg-ink-900 p-1.5 shadow-2xl shadow-black/60">
              <div className="border-b border-white/[0.06] px-3 py-2">
                <p className="truncate text-sm font-medium text-slate-100">{user?.name}</p>
                <p className="truncate text-xs text-slate-500">{user?.email}</p>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/settings');
                }}
                className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.06]"
              >
                <Settings className="h-4 w-4" aria-hidden="true" /> Profile & settings
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => logout()}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/10"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
