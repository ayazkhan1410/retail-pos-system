import { useEffect, useState } from 'react';
import { cn } from '@/utils';
import { useTranslation } from '@/i18n';
import { usePOSStore } from '@/store';

/** Honest connection state for this device: online and synced, bills waiting to sync, or offline. */
export default function SyncPill({ className }: { className?: string }) {
  const { t } = useTranslation();
  const pending = usePOSStore((state) => state.pendingSales.length);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const state = !online ? 'offline' : pending > 0 ? 'pending' : 'synced';
  const styles = {
    synced: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    offline: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300',
  };
  const dots = { synced: 'bg-emerald-500', pending: 'bg-amber-500', offline: 'bg-red-500' };
  const label = state === 'synced' ? t('pg.shell.synced') : state === 'pending' ? t('pg.shell.pending', { count: pending }) : t('pg.shell.offline');

  return (
    <span role="status" className={cn('inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-medium', styles[state], className)}>
      <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', dots[state])} />
      {label}
    </span>
  );
}
