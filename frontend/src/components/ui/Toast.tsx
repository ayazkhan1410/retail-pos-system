import { create } from 'zustand';
import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/utils';

type Tone = 'success' | 'info' | 'warning';

interface ToastItem {
  id: number;
  title: string;
  body?: string;
  tone: Tone;
}

interface ToastState {
  items: ToastItem[];
  push: (toast: Omit<ToastItem, 'id' | 'tone'> & { tone?: Tone }) => void;
  dismiss: (id: number) => void;
}

const MAX_TOASTS = 3;
const TOAST_MS = 4000;
let nextId = 1;
const timers = new Map<number, number>();

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  push: ({ tone = 'success', ...toast }) => {
    const id = nextId++;
    const items = [...get().items, { id, tone, ...toast }];
    // Bounded: the oldest goes when a fourth arrives.
    items.slice(0, Math.max(0, items.length - MAX_TOASTS)).forEach((old) => get().dismiss(old.id));
    set({ items: items.slice(-MAX_TOASTS) });
    timers.set(id, window.setTimeout(() => get().dismiss(id), TOAST_MS));
  },
  dismiss: (id) => {
    const timer = timers.get(id);
    if (timer) window.clearTimeout(timer);
    timers.delete(id);
    set({ items: get().items.filter((item) => item.id !== id) });
  },
}));

export const toast = (title: string, options: { body?: string; tone?: Tone } = {}) =>
  useToastStore.getState().push({ title, ...options });

const icons = { success: CheckCircle2, info: Info, warning: AlertTriangle };
const tones = {
  success: 'text-emerald-600 dark:text-emerald-400',
  info: 'text-sky-600 dark:text-sky-400',
  warning: 'text-amber-600 dark:text-amber-400',
};

/** Confirmations of finished actions. role=status so they never compete with on-screen errors. */
export function ToastHost() {
  const items = useToastStore((state) => state.items);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-end"
    >
      {items.map((item) => {
        const Icon = icons[item.tone];
        return (
          <div
            key={item.id}
            className="pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl border border-brand-200 bg-white p-3.5 text-brand-900 shadow-elevated dark:border-brand-700 dark:bg-brand-800 dark:text-brand-50"
          >
            <Icon className={cn('mt-0.5 h-[18px] w-[18px] shrink-0', tones[item.tone])} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{item.title}</p>
              {item.body && <p className="mt-0.5 text-xs text-brand-500 dark:text-brand-300">{item.body}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss"
              className="-m-1 rounded-md p-1 text-brand-400 hover:bg-brand-100 hover:text-brand-700 dark:hover:bg-brand-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
