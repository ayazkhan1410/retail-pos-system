import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Kept for compatibility. Static cards no longer lift on hover; only clickable ones should respond. */
  hover?: boolean;
  glass?: boolean;
}

const paddingMap = {
  none: '',
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
};

export function Card({ className, padding = 'md', children, ...props }: CardProps) {
  // Accepted for compatibility, never forwarded to the DOM.
  const { hover, glass, ...rest } = props;
  void hover;
  void glass;
  return (
    <div
      className={cn(
        'rounded-xl border border-brand-200 bg-white shadow-card dark:border-brand-800 dark:bg-brand-900',
        paddingMap[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-3', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-[15px] font-semibold tracking-tight text-brand-900 dark:text-brand-50', className)}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardDescription({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn('mt-0.5 text-xs text-brand-500 dark:text-brand-400', className)}>{children}</p>;
}
