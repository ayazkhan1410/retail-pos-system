/** Small building blocks shared by the back-office pages, matching the Tijori design mockups. */
import { type ReactNode } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '@/utils';
import { useTranslation } from '@/i18n';

/* ---------------------------------------------------------------- Avatar */

const TINTS = [
  'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
  'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  'bg-lime-100 text-lime-800 dark:bg-lime-500/15 dark:text-lime-300',
  'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
  'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200',
];

/** First letters of the first two words, skipping sizes like "1L" or "10kg": "Ashrafi Atta 10kg" → "AA". */
export function initialsOf(name?: string | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const alpha = words.filter((word) => !/\d/.test(word));
  const parts = alpha.length > 0 ? alpha : words;
  if (parts.length === 0) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[1][0] : parts[0][1] ?? '')).toUpperCase();
}

function tintFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

/** Two-letter chip in a colour picked from the name, so the same product or person always looks the same. */
export function Avatar({ name, size = 'md', round, muted, className }: {
  name: string; size?: 'sm' | 'md' | 'lg'; round?: boolean; muted?: boolean; className?: string;
}) {
  const sizes = { sm: 'h-6 w-6 text-[10px]', md: 'h-7 w-7 text-[11px]', lg: 'h-10 w-10 text-sm' };
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-semibold',
        round ? 'rounded-full' : 'rounded-md',
        sizes[size],
        muted ? 'bg-brand-100 text-brand-400 dark:bg-brand-800 dark:text-brand-500' : tintFor(name),
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/* ---------------------------------------------------------------- Segmented */

export function Segmented<T extends string>({ value, options, onChange, label, className }: {
  value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string; className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-lg bg-brand-100 p-0.5 dark:bg-brand-800/70', className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-8 whitespace-nowrap rounded-md px-3 text-sm transition-colors focus-ring',
              active
                ? 'bg-white font-medium text-brand-900 shadow-soft ring-1 ring-brand-200 dark:bg-brand-950 dark:text-white dark:ring-brand-700'
                : 'text-brand-600 hover:text-brand-900 dark:text-brand-400 dark:hover:text-white',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- Tabs */

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number | null;
}

/** Underlined tabs with optional counts ("Low stock 7"). */
export function Tabs<T extends string>({ value, items, onChange, label, className }: {
  value: T; items: TabItem<T>[]; onChange: (value: T) => void; label: string; className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-5 overflow-x-auto border-b border-brand-200 scrollbar-none dark:border-brand-800', className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 pb-2.5 pt-1 text-sm transition-colors focus-ring',
              active
                ? 'border-brand-900 font-medium text-brand-900 dark:border-white dark:text-white'
                : 'border-transparent text-brand-500 hover:text-brand-900 dark:text-brand-400 dark:hover:text-white',
            )}
          >
            {item.label}
            {item.count != null && <span className="ms-1 tabular-nums">{item.count.toLocaleString()}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- Pager */

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const { t } = useTranslation();
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-brand-200 px-4 py-3 text-sm text-brand-500 dark:border-brand-800 dark:text-brand-400">
      <span className="tabular-nums">{t('pg.common.showing', { first, last, total: total.toLocaleString() })}</span>
      <div className="flex gap-2">
        <PagerButton disabled={page <= 1} onClick={() => onPage(page - 1)}>{t('pg.common.previous')}</PagerButton>
        <PagerButton disabled={last >= total} onClick={() => onPage(page + 1)}>{t('pg.common.next')}</PagerButton>
      </div>
    </div>
  );
}

function PagerButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-8 rounded-md border border-brand-200 bg-white px-3 text-[13px] font-medium text-brand-800 shadow-soft transition-colors hover:bg-brand-50 focus-ring disabled:cursor-not-allowed disabled:opacity-40 dark:border-brand-700 dark:bg-brand-900 dark:text-brand-100 dark:hover:bg-brand-800"
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- Toggle */

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-60',
        checked ? 'bg-accent' : 'bg-brand-200 dark:bg-brand-700',
      )}
    >
      <span className={cn('h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px] rtl:-translate-x-[18px]' : 'translate-x-0.5 rtl:-translate-x-0.5')} />
    </button>
  );
}

/* ---------------------------------------------------------------- Bars */

export function ProgressBar({ value, tone = 'accent', className }: { value: number; tone?: 'accent' | 'warn' | 'danger' | 'muted'; className?: string }) {
  const tones = { accent: 'bg-accent', warn: 'bg-amber-500', danger: 'bg-red-500', muted: 'bg-brand-300 dark:bg-brand-600' };
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-brand-100 dark:bg-brand-800', className)}>
      <div className={cn('h-full rounded-full', tones[tone])} style={{ width: `${width}%` }} />
    </div>
  );
}

/** A single bar split into coloured parts, e.g. payment mix or where the money went. */
export function StackedBar({ parts, className }: { parts: { key: string; value: number; color: string }[]; className?: string }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  return (
    <div className={cn('flex h-2 w-full gap-0.5 overflow-hidden rounded-full', className)}>
      {total > 0
        ? parts.filter((part) => part.value > 0).map((part) => (
            <div key={part.key} className={cn('h-full first:rounded-s-full last:rounded-e-full', part.color)} style={{ width: `${(part.value / total) * 100}%` }} />
          ))
        : <div className="h-full w-full rounded-full bg-brand-100 dark:bg-brand-800" />}
    </div>
  );
}

/* ---------------------------------------------------------------- Fields */

export function SearchField({ value, onChange, placeholder, className, inputRef }: {
  value: string; onChange: (value: string) => void; placeholder: string; className?: string; inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <label className={cn('relative block', className)}>
      <span className="sr-only">{placeholder}</span>
      <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-brand-200 bg-white ps-9 pe-3 text-sm text-brand-900 shadow-soft placeholder:text-brand-400 hover:border-brand-300 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 dark:border-brand-700 dark:bg-brand-900 dark:text-brand-50 dark:placeholder:text-brand-500"
      />
    </label>
  );
}

/** Compact select that looks like the design's filter pills ("Category ⌄"). */
export function FilterSelect({ value, onChange, options, label, className }: {
  value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; label: string; className?: string;
}) {
  return (
    <label className={cn('relative inline-block', className)}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full cursor-pointer appearance-none rounded-lg border border-brand-200 bg-white ps-3 pe-8 text-sm font-medium text-brand-800 shadow-soft hover:border-brand-300 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 dark:border-brand-700 dark:bg-brand-900 dark:text-brand-100"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute end-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-500" />
    </label>
  );
}

/* ---------------------------------------------------------------- Numbers */

/** "+18.4%" in green, "−Rs 120" in red. `good` says which direction is good news. */
export function Delta({ value, suffix = '%', good = 'up', format, className }: {
  value: number | null | undefined; suffix?: string; good?: 'up' | 'down'; format?: (value: number) => string; className?: string;
}) {
  if (value == null || Number.isNaN(value)) return null;
  const positive = value > 0;
  const tone = value === 0 ? 'text-brand-500' : positive === (good === 'up') ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
  const body = format ? format(Math.abs(value)) : `${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;
  return <span className={cn('text-sm font-medium tabular-nums', tone, className)}>{value > 0 ? '+' : value < 0 ? '−' : ''}{body}</span>;
}

export interface KpiItem {
  key: string;
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  hint?: ReactNode;
}

/** One bordered strip of numbers split by hairlines, with an inline delta after each value. */
export function KpiStrip({ items, className }: { items: KpiItem[]; className?: string }) {
  const cols = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4', 5: 'sm:grid-cols-3 lg:grid-cols-5' } as Record<number, string>;
  return (
    <div className={cn('grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-brand-200 bg-brand-200 dark:border-brand-800 dark:bg-brand-800', cols[items.length] ?? 'sm:grid-cols-4', className)}>
      {items.map((item) => (
        <div key={item.key} className="min-w-0 bg-white px-5 py-4 dark:bg-brand-900">
          <p className="text-[13px] text-brand-600 dark:text-brand-400">{item.label}</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="num truncate text-2xl font-semibold leading-tight text-brand-900 dark:text-white">{item.value}</span>
            {item.delta}
          </p>
          {item.hint && <p className="mt-1.5 truncate text-[13px] text-brand-500 dark:text-brand-400">{item.hint}</p>}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Layout */

export function Panel({ title, subtitle, action, children, className, bodyClassName }: {
  title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string;
}) {
  return (
    <section className={cn('min-w-0 overflow-hidden rounded-xl border border-brand-200 bg-white dark:border-brand-800 dark:bg-brand-900', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-brand-900 dark:text-white">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-brand-500 dark:text-brand-400">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0 text-[13px]">{action}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Big page title with a subtitle on the left and the page's actions on the right. */
export function PageHeading({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-brand-900 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-brand-500 dark:text-brand-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A status pill with the design's soft fills. */
export function Pill({ tone = 'default', children, className }: { tone?: 'default' | 'success' | 'warn' | 'danger' | 'accent' | 'muted'; children: ReactNode; className?: string }) {
  const tones = {
    default: 'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200',
    muted: 'bg-brand-100 text-brand-600 dark:bg-brand-800 dark:text-brand-300',
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    warn: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    danger: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300',
    accent: 'bg-accent-soft text-accent dark:text-accent-light',
  };
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

/** Text-style link button used in panel headers ("View shifts", "See all"). */
export function LinkButton({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('text-[13px] text-brand-500 transition-colors hover:text-brand-900 focus-ring dark:text-brand-400 dark:hover:text-white', className)}>
      {children}
    </button>
  );
}
