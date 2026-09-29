import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { cn } from '../../utils/cn';

export type ToastTone = 'success' | 'error' | 'info';
export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };
const STYLES: Record<ToastTone, string> = {
  success: 'border-emerald-400/30 text-emerald-200',
  error: 'border-rose-400/30 text-rose-200',
  info: 'border-accent/30 text-cyan-100',
};

export function ToastViewport({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.tone];
        return (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={cn('glass pointer-events-auto flex animate-fade-up items-start gap-3 rounded-xl bg-ink-900/95 px-4 py-3 text-sm', STYLES[toast.tone])}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="flex-1 text-slate-100">{toast.message}</p>
            <button type="button" onClick={() => onDismiss(toast.id)} className="rounded p-0.5 text-slate-400 hover:text-white" aria-label="Dismiss notification">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
