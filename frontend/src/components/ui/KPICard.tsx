import { TrendingUp, TrendingDown, Minus, Wallet, Receipt, AlertTriangle, Monitor } from 'lucide-react';
import { cn } from '@/utils';
import { useTranslation } from '@/i18n';
import type { KPIData } from '@/types';

const iconMap = {
  sales: Wallet,
  receipt: Receipt,
  alert: AlertTriangle,
  counter: Monitor,
};

const accentMap = {
  sales: 'from-emerald-500/10 to-transparent text-emerald-600 dark:text-emerald-400',
  receipt: 'from-blue-500/10 to-transparent text-blue-600 dark:text-blue-400',
  alert: 'from-amber-500/10 to-transparent text-amber-600 dark:text-amber-400',
  counter: 'from-brand-500/10 to-transparent text-brand-600 dark:text-brand-400',
};

export default function KPICard({ labelKey, value, change, trend, icon = 'sales' }: KPIData) {
  const { t } = useTranslation();
  const Icon = iconMap[icon];
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-brand-200/60 bg-white p-6 shadow-card transition-all duration-300 hover:shadow-elevated dark:border-brand-800/60 dark:bg-brand-900/80">
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-60', accentMap[icon])} />
      <div className="relative">
        <div className="flex items-start justify-between">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100/80 dark:bg-brand-800/80">
            <Icon className={cn('h-5 w-5', accentMap[icon].split(' ').slice(2).join(' '))} />
          </div>
          {change !== 0 && (
            <div
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                trend === 'up' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
                trend === 'down' && 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400',
              )}
            >
              <TrendIcon className="h-3 w-3" />
              {Math.abs(change)}%
            </div>
          )}
        </div>
        <p className="mt-4 text-sm font-medium text-brand-500 dark:text-brand-400">{t(labelKey)}</p>
        <p className="mt-1 font-display text-3xl font-bold tracking-tight">{value}</p>
        {change !== 0 && (
          <p className="mt-2 text-xs text-brand-400">{t('common.vsYesterday')}</p>
        )}
      </div>
    </div>
  );
}
