import { cn } from '@/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  default: 'bg-brand-100 text-brand-700 ring-brand-200 dark:bg-brand-800 dark:text-brand-200 dark:ring-brand-700',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25',
  danger: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  info: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/25',
};

const dots: Record<BadgeVariant, string> = {
  default: 'bg-brand-400',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-sky-500',
};

export default function Badge({ children, variant = 'default', dot, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ring-1 ring-inset',
        variants[variant],
        className,
      )}
    >
      {dot && <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', dots[variant])} />}
      {children}
    </span>
  );
}

export function StockBadge({ status }: { status: 'in_stock' | 'low_stock' | 'out_of_stock' }) {
  const map = {
    in_stock: { label: 'In Stock', variant: 'success' as const },
    low_stock: { label: 'Low Stock', variant: 'warning' as const },
    out_of_stock: { label: 'Out of Stock', variant: 'danger' as const },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant} dot>{label}</Badge>;
}
