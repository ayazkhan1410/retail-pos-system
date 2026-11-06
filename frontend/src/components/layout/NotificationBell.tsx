import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Clock3,
  PackageMinus,
  PackageX,
  Radio,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';
import { cn } from '@/utils';
import type { AppNotification, NotificationKind } from '@/types';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function kindMeta(kind: NotificationKind): {
  icon: typeof Bell;
  accent: string;
  chip: string;
  labelKey: string;
} {
  switch (kind) {
    case 'out_of_stock':
      return {
        icon: PackageX,
        accent: 'bg-red-500/15 text-red-500 ring-red-500/20',
        chip: 'bg-red-500/10 text-red-600 dark:text-red-400',
        labelKey: 'notifications.kinds.outOfStock',
      };
    case 'low_stock':
      return {
        icon: PackageMinus,
        accent: 'bg-amber-500/15 text-amber-600 ring-amber-500/20 dark:text-amber-400',
        chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
        labelKey: 'notifications.kinds.lowStock',
      };
    case 'expired':
      return {
        icon: ShieldAlert,
        accent: 'bg-red-500/15 text-red-500 ring-red-500/20',
        chip: 'bg-red-500/10 text-red-600 dark:text-red-400',
        labelKey: 'notifications.kinds.expired',
      };
    case 'expiry_soon':
      return {
        icon: Clock3,
        accent: 'bg-orange-500/15 text-orange-600 ring-orange-500/20 dark:text-orange-400',
        chip: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
        labelKey: 'notifications.kinds.expirySoon',
      };
    default:
      return {
        icon: AlertTriangle,
        accent: 'bg-accent/15 text-accent ring-accent/20',
        chip: 'bg-accent/10 text-accent',
        labelKey: 'notifications.kinds.system',
      };
  }
}

function alertCopy(
  item: AppNotification,
  t: (key: string, params?: Record<string, string | number>) => string,
): { headline: string; detail: string } {
  const key = typeof item.payload?.i18n_key === 'string' ? item.payload.i18n_key : '';
  const params =
    item.payload?.i18n_params && typeof item.payload.i18n_params === 'object'
      ? (item.payload.i18n_params as Record<string, string | number>)
      : undefined;
  if (key) {
    const translated = t(key, params);
    if (translated !== key) {
      const name = typeof params?.name === 'string' ? params.name : '';
      return {
        headline: name || translated,
        detail: name ? translated : item.body,
      };
    }
  }
  return { headline: item.title, detail: item.body };
}

export default function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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

  const openItem = (item: AppNotification) => {
    if (!item.read_at) void markRead([item.id]);
    const name =
      typeof item.payload?.product_name === 'string'
        ? item.payload.product_name
        : typeof item.payload?.i18n_params === 'object'
          && item.payload.i18n_params
          && 'name' in item.payload.i18n_params
          ? String((item.payload.i18n_params as Record<string, unknown>).name ?? '')
          : '';
    if (name) {
      setOpen(false);
      navigate(`/inventory?q=${encodeURIComponent(name)}`);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-xl border transition-all',
          open
            ? 'border-accent/40 bg-accent/10 text-accent shadow-soft'
            : 'border-brand-200/80 text-brand-600 hover:bg-brand-100 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-800',
        )}
        aria-label={t('notifications.title')}
        aria-expanded={open}
      >
        <Bell className={cn('h-4 w-4', unreadCount > 0 && 'animate-[pulse_2s_ease-in-out_infinite]')} />
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-rose-600 px-1 text-[10px] font-bold text-white shadow-md ring-2 ring-white dark:ring-brand-950">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-1.5rem))] origin-top-right overflow-hidden rounded-2xl border border-brand-200/80 bg-white/95 shadow-elevated backdrop-blur-xl dark:border-brand-700/80 dark:bg-brand-900/95">
          <div className="relative overflow-hidden border-b border-brand-100/80 px-4 py-3 dark:border-brand-800/80">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-transparent" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-display text-base font-semibold tracking-tight">{t('notifications.title')}</p>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
                      {t('notifications.unreadCount', { count: unreadCount })}
                    </span>
                  )}
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-brand-500">
                  <span
                    className={cn(
                      'inline-flex h-1.5 w-1.5 rounded-full',
                      connected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-amber-400 animate-pulse',
                    )}
                  />
                  {connected ? (
                    <>
                      <Radio className="h-3 w-3 text-emerald-500" />
                      {t('notifications.live')}
                    </>
                  ) : (
                    t('notifications.reconnecting')
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void markAllRead()}
                disabled={unreadCount === 0}
                className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-brand-200/70 bg-white/60 px-2.5 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/10 disabled:opacity-35 dark:border-brand-700 dark:bg-brand-950/40"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t('notifications.markAllRead')}
              </button>
            </div>
          </div>

          <div className="max-h-[min(26rem,60vh)] space-y-1.5 overflow-y-auto p-2">
            {loading && (
              <div className="flex flex-col items-center gap-2 px-3 py-10 text-brand-500">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-accent" />
                <p className="text-sm">{t('notifications.loading')}</p>
              </div>
            )}

            {!loading && items.length === 0 && (
              <div className="flex flex-col items-center px-4 py-12 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-400 dark:bg-brand-800">
                  <Sparkles className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-brand-700 dark:text-brand-200">{t('notifications.empty')}</p>
                <p className="mt-1 text-xs text-brand-500">{t('notifications.emptyHint')}</p>
              </div>
            )}

            {items.map((item) => {
              const meta = kindMeta(item.kind);
              const Icon = meta.icon;
              const copy = alertCopy(item, t);
              const unread = !item.read_at;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item)}
                  className={cn(
                    'group relative flex w-full gap-3 rounded-xl px-3 py-3 text-left transition-all',
                    'hover:bg-brand-50/90 dark:hover:bg-brand-800/50',
                    unread
                      ? 'bg-gradient-to-r from-accent/[0.07] to-transparent ring-1 ring-accent/15'
                      : 'bg-transparent',
                  )}
                >
                  <div
                    className={cn(
                      'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1',
                      meta.accent,
                    )}
                  >
                    <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', meta.chip)}>
                        {t(meta.labelKey)}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] tabular-nums text-brand-400">
                        {relativeTime(item.created_at)}
                      </span>
                    </div>
                    <p className={cn('mt-1 truncate text-sm leading-snug', unread ? 'font-semibold text-brand-900 dark:text-brand-50' : 'font-medium text-brand-800 dark:text-brand-100')}>
                      {copy.headline}
                    </p>
                    {copy.detail && (
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-brand-500 dark:text-brand-400">
                        {copy.detail}
                      </p>
                    )}
                  </div>
                  {unread && (
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent shadow-[0_0_6px_rgba(1,65,28,0.5)]" />
                  )}
                </button>
              );
            })}
          </div>

          {items.length > 0 && (
            <div className="border-t border-brand-100/80 bg-brand-50/50 px-3 py-2 text-center dark:border-brand-800/80 dark:bg-brand-950/40">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate('/inventory');
                }}
                className="text-xs font-medium text-accent hover:underline"
              >
                {t('notifications.openInventory')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
