import { type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { cn } from '@/utils';
import Button from './Button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

/** An empty screen says what will appear here and offers the action that fills it. */
export function EmptyState({ icon: Icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      {Icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-brand-200 bg-brand-50 text-brand-400 dark:border-brand-700 dark:bg-brand-800/60">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <p className="text-sm font-semibold text-brand-800 dark:text-brand-100">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-brand-500 dark:text-brand-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, retryLabel, onRetry, className }: { message: string; retryLabel?: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p role="alert" className="max-w-sm text-sm font-medium text-brand-800 dark:text-brand-100">{message}</p>
      {onRetry && retryLabel && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RotateCw className="h-3.5 w-3.5" /> {retryLabel}
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton h-4', className)} />;
}

/** Placeholder rows shaped like the table that is loading, so the page doesn't jump when data arrives. */
export function SkeletonRows({ rows = 6, columns = 5, label }: { rows?: number; columns?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="divide-y divide-brand-100 dark:divide-brand-800">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-4 px-4 py-3.5 sm:px-6">
          {Array.from({ length: columns }, (__, col) => (
            <Skeleton key={col} className={cn('h-3.5', col === 0 ? 'w-2/5' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}
