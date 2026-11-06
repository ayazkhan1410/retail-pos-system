import { type ReactNode } from 'react';
import { cn } from '@/utils';

export interface StatItem {
  key: string;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Colours the value when the number needs attention. */
  tone?: 'default' | 'warn' | 'danger';
  /** Makes the cell a button, e.g. to apply a quick filter. */
  onClick?: () => void;
  active?: boolean;
}

const toneClass = {
  default: 'text-brand-900 dark:text-white',
  warn: 'text-amber-600 dark:text-amber-300',
  danger: 'text-red-600 dark:text-red-400',
};

/** One bordered panel of numbers, split by hairlines. Matches the dashboard strip. */
export default function StatStrip({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <div
      className={cn(
        'grid overflow-hidden rounded-xl border border-brand-200 bg-white dark:border-brand-800 dark:bg-brand-900',
        'grid-cols-2 gap-px bg-brand-200 dark:bg-brand-800',
        items.length >= 6 ? 'lg:grid-cols-6' : items.length >= 5 ? 'lg:grid-cols-5' : items.length === 4 ? 'lg:grid-cols-4' : 'sm:grid-cols-3',
        className,
      )}
    >
      {items.map((item) => {
        const body = (
          <>
            <p className="text-[13px] font-medium text-brand-500 dark:text-brand-400">{item.label}</p>
            <p className={cn('num mt-1.5 text-[26px] font-semibold leading-tight', toneClass[item.tone ?? 'default'])}>{item.value}</p>
            {item.hint && <p className="mt-1 text-xs text-brand-500 dark:text-brand-400">{item.hint}</p>}
          </>
        );
        const cell = cn(
          'relative bg-white px-5 py-4 text-start dark:bg-brand-900',
          item.onClick && 'transition-colors hover:bg-brand-50 focus-ring dark:hover:bg-brand-800/60',
          item.active && 'bg-accent-soft/60 dark:bg-accent-soft/60',
        );
        return item.onClick ? (
          <button key={item.key} type="button" onClick={item.onClick} aria-pressed={item.active} className={cell}>
            {item.active && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
            {body}
          </button>
        ) : (
          <div key={item.key} className={cell}>{body}</div>
        );
      })}
    </div>
  );
}
