import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Wallet, Receipt, AlertTriangle, Monitor, ChevronRight } from 'lucide-react';
import { cn } from '@/utils';
import { useTranslation } from '@/i18n';
import type { KPIData } from '@/types';

const iconMap = {
  sales: Wallet,
  receipt: Receipt,
  alert: AlertTriangle,
  counter: Monitor,
};

const toneMap = {
  sales: 'bg-accent-soft text-accent',
  receipt: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  alert: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  counter: 'bg-brand-100 text-brand-600 dark:bg-brand-800 dark:text-brand-300',
};

interface KPICardProps extends KPIData {
  /** Secondary line under the value, e.g. average basket. */
  hint?: ReactNode;
  /** Makes the whole card a link to the page that explains the number. */
  to?: string;
  /** Status the number implies; colours the value when it needs attention. */
  attention?: boolean;
  className?: string;
}

export default function KPICard({ labelKey, value, change, trend, icon = 'sales', hint, to, attention, className }: KPICardProps) {
  const { t } = useTranslation();
  const Icon = iconMap[icon];
  const TrendIcon = trend === 'up' ? ArrowUpRight : ArrowDownRight;

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', toneMap[icon])}>
            <Icon className="h-4 w-4" />
          </span>
          <p className="text-sm font-medium text-brand-600 dark:text-brand-300">{t(labelKey)}</p>
        </div>
        {to && <ChevronRight className="h-4 w-4 text-brand-300 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 dark:text-brand-600" />}
      </div>
      <p
        className={cn(
          'num mt-4 text-[1.75rem] font-semibold leading-none',
          attention ? 'text-amber-700 dark:text-amber-300' : 'text-brand-900 dark:text-white',
        )}
      >
        {value}
      </p>
      <div className="mt-2.5 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-brand-500 dark:text-brand-400">
        {change !== 0 && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold tabular-nums',
              trend === 'up'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
            )}
          >
            <TrendIcon className="h-3 w-3" />
            {Math.abs(change)}%
          </span>
        )}
        {change !== 0 && <span>{t('common.vsYesterday')}</span>}
        {hint}
      </div>
    </>
  );

  const shell = cn(
    'group block rounded-xl border border-brand-200 bg-white p-5 shadow-card dark:border-brand-800 dark:bg-brand-900',
    to && 'transition-colors hover:border-brand-300 focus-ring dark:hover:border-brand-700',
    className,
  );

  return to ? (
    <Link to={to} className={shell}>{body}</Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
