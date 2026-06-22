import { type HTMLAttributes } from 'react';
import { cn } from '@/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  glass?: boolean;
}

const paddingMap = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function Card({ className, padding = 'md', hover, glass, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border shadow-card',
        glass
          ? 'glass'
          : 'border-brand-200/60 bg-white dark:border-brand-800/60 dark:bg-brand-900/80',
        hover && 'transition-all duration-300 hover:shadow-elevated hover:-translate-y-0.5',
        paddingMap[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mb-5 flex items-center justify-between', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('font-display text-lg font-semibold tracking-tight text-brand-900 dark:text-brand-50', className)}
      {...props}
    >
      {children}
    </h3>
  );
}
