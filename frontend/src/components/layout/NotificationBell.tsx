import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';
import { cn } from '@/utils';
import type { AppNotification } from '@/types';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function severityClass(severity: AppNotification['severity']): string {
  if (severity === 'critical') return 'border-l-red-500';
  if (severity === 'warning') return 'border-l-amber-500';
  return 'border-l-brand-400';
}

function alertText(
  item: AppNotification,
  t: (key: string, params?: Record<string, string | number>) => string,
): { title: string; body: string } {
  const key = typeof item.payload?.i18n_key === 'string' ? item.payload.i18n_key : '';
  const params =
    item.payload?.i18n_params && typeof item.payload.i18n_params === 'object'
      ? (item.payload.i18n_params as Record<string, string | number>)
      : undefined;
  if (key) {
    const translated = t(key, params);
    if (translated !== key) {
      return { title: translated, body: '' };
    }
  }
  return { title: item.title, body: item.body };
}

export default function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { items, unreadCount, connected, loading, markRead, markAllRead } = useNotifications(true);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-brand-200/80 text-brand-600 hover:bg-brand-100 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-800"
        aria-label={t('notifications.title')}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-elevated dark:border-brand-700 dark:bg-brand-900">
          <div className="flex items-center justify-between border-b border-brand-100 px-3 py-2 dark:border-brand-800">
            <div>
              <p className="text-sm font-semibold">{t('notifications.title')}</p>
              <p className="text-[11px] text-brand-500">
                {connected ? t('notifications.live') : t('notifications.reconnecting')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={unreadCount === 0}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {t('notifications.markAllRead')}
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && (
              <p className="px-3 py-6 text-center text-sm text-brand-500">{t('notifications.loading')}</p>
            )}
            {!loading && items.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-brand-500">{t('notifications.empty')}</p>
            )}
            {items.map((item) => {
              const text = alertText(item, t);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (!item.read_at) void markRead([item.id]);
                  }}
                  className={cn(
                    'block w-full border-b border-brand-50 px-3 py-2.5 text-left border-l-4 transition-colors hover:bg-brand-50/80 dark:border-brand-800/50 dark:hover:bg-brand-800/40',
                    severityClass(item.severity),
                    !item.read_at && 'bg-accent/5',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold leading-snug">{text.title}</p>
                    <span className="shrink-0 text-[10px] text-brand-400">{relativeTime(item.created_at)}</span>
                  </div>
                  {text.body && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-brand-500">{text.body}</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
