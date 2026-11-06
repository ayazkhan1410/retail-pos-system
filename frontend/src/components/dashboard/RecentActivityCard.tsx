import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { Card, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { auditApi, type ActivityItem } from '@/services/endpoints';
import { useTranslation } from '@/i18n';
import { cn, formatCurrency, formatTime, localDate, localDayKey } from '@/utils';

const PAGE_SIZE = 8;

function dayLabel(
  dayKey: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const today = localDate();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = localDate(yesterdayDate);
  if (dayKey === today) return t('dashboard.activityToday');
  if (dayKey === yesterday) return t('dashboard.activityYesterday');
  const [year, month, day] = dayKey.split('-').map(Number);
  const value = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('en-PK', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(value);
}

function groupByDay(items: ActivityItem[]) {
  const groups: { key: string; items: ActivityItem[] }[] = [];
  for (const item of items) {
    const key = localDayKey(item.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  }
  return groups;
}

function detailText(details: Record<string, unknown> | undefined, key: string): string {
  const value = details?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function detailCount(details: Record<string, unknown> | undefined, key: string): number | null {
  const value = details?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Sale lines: counter + what sold; other actions keep target as-is. */
function activityHeadline(
  item: ActivityItem,
  t: (key: string, params?: Record<string, string | number>) => string,
): { primary: string; secondary: string[] } {
  const label = t(`dashboard.activity.${item.action}`);
  const isSale = item.action === 'sale_completed' || item.action === 'offline_sale';
  if (!isSale) {
    return { primary: label, secondary: item.target ? [item.target] : [] };
  }
  const terminal = detailText(item.details, 'terminal');
  const summary = detailText(item.details, 'summary');
  const items = detailCount(item.details, 'items');
  const bits: string[] = [];
  if (terminal) bits.push(terminal);
  if (summary) bits.push(summary);
  else if (items != null && items > 0) bits.push(t('dashboard.activityItemCount', { count: items }));
  else if (item.target) bits.push(item.target);
  return { primary: label, secondary: bits };
}

export default function RecentActivityCard() {
  const { t } = useTranslation();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  const hasMore = items.length < count;

  const loadPage = useCallback(async (pageNumber: number, mode: 'replace' | 'append' | 'soft') => {
    if (mode === 'append') setLoadingMore(true);
    else if (mode !== 'soft') {
      setLoading(true);
      setFailed(false);
    }
    try {
      const { data } = await auditApi.activity({ page: pageNumber, page_size: PAGE_SIZE });
      setCount(data.count);
      setPage(pageNumber);
      setItems((current) => {
        if (mode === 'replace') return data.results;
        if (mode === 'soft') {
          const known = new Set(current.map((row) => row.id));
          const fresh = data.results.filter((row) => !known.has(row.id));
          return fresh.length ? [...fresh, ...current] : current;
        }
        const known = new Set(current.map((row) => row.id));
        return [...current, ...data.results.filter((row) => !known.has(row.id))];
      });
    } catch {
      if (mode !== 'soft') setFailed(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadPage(1, 'replace');
  }, [loadPage]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      if (scrollEl && scrollEl.scrollTop > 48) return;
      void loadPage(1, 'soft');
    };
    const id = window.setInterval(tick, 8000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [loadPage, scrollEl]);

  const onLoadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading || page < 1) return;
    return loadPage(page + 1, 'append');
  }, [hasMore, loading, loadingMore, loadPage, page]);

  const sentinelRef = useInfiniteScroll(hasMore && !loading && !loadingMore && !!scrollEl, onLoadMore, {
    root: scrollEl,
    rootMargin: '100px',
  });

  const groups = useMemo(() => groupByDay(items), [items]);

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden" padding="none">
      <div className="border-b border-brand-100 px-5 pb-3 pt-5 dark:border-brand-800 sm:px-6 sm:pt-6">
        <CardHeader className="mb-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-brand-400" />
              {t('dashboard.recentActivity')}
            </CardTitle>
            <p className="mt-0.5 text-xs text-brand-500">{t('dashboard.activityHint')}</p>
          </div>
        </CardHeader>
      </div>

      <div
        ref={setScrollEl}
        className="h-[22rem] overflow-y-auto overscroll-contain px-5 py-3 sm:px-6"
      >
        {failed && (
          <p role="alert" className="py-6 text-center text-sm text-red-600 dark:text-red-400">
            {t('dashboard.activityLoadError')}
          </p>
        )}
        {!failed && loading && items.length === 0 && (
          <p className="py-6 text-center text-sm text-brand-400">{t('common.loading')}</p>
        )}
        {!failed && !loading && items.length === 0 && (
          <EmptyState title={t('dashboard.noData')} compact />
        )}
        {!failed && items.length > 0 && (
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.key} aria-label={dayLabel(group.key, t)}>
                <h4 className="sticky top-0 z-10 -mx-1 mb-2 bg-white/95 px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-500 backdrop-blur dark:bg-brand-900/95">
                  {dayLabel(group.key, t)}
                </h4>
                <ol className="relative space-y-3 before:absolute before:inset-y-1 before:start-[5px] before:w-px before:bg-brand-200 dark:before:bg-brand-800">
                  {group.items.map((item) => {
                    const total = item.details?.total != null ? Number(item.details.total) : null;
                    const isSale = item.action === 'sale_completed' || item.action === 'offline_sale';
                    const { primary, secondary } = activityHeadline(item, t);
                    const invoice = isSale ? item.target : '';
                    return (
                      <li key={item.id} className="relative flex gap-3 ps-5">
                        <span
                          aria-hidden
                          className={cn(
                            'absolute start-0 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-white dark:border-brand-900',
                            isSale ? 'bg-emerald-500' : 'bg-brand-300 dark:bg-brand-600',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {primary}
                            {secondary.map((bit) => (
                              <span key={bit} className="font-normal text-brand-500"> · {bit}</span>
                            ))}
                            {total != null && Number.isFinite(total) && (
                              <span className="font-semibold text-brand-800 dark:text-brand-100"> · {formatCurrency(total)}</span>
                            )}
                          </p>
                          <p className="truncate text-xs text-brand-500">
                            {item.user || t('dashboard.activitySystem')}
                            {' · '}
                            <span className="tabular-nums">{formatTime(item.created_at)}</span>
                            {invoice && (
                              <>
                                {' · '}
                                <span className="font-mono text-[11px]">{invoice}</span>
                              </>
                            )}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
            <div ref={sentinelRef} className="h-4" aria-hidden />
            {loadingMore && (
              <p className="pb-2 text-center text-xs text-brand-400">{t('common.loading')}</p>
            )}
            {!hasMore && items.length > 0 && (
              <p className="pb-1 text-center text-[11px] text-brand-400">{t('dashboard.activityEnd')}</p>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-brand-100 px-4 py-2.5 dark:border-brand-800 sm:px-5">
        <p className="text-[11px] text-brand-500">
          {t('dashboard.activityShowing', { shown: items.length, count })}
        </p>
      </div>
    </Card>
  );
}
