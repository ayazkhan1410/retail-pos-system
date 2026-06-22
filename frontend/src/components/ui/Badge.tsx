import { cn } from '@/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  default: 'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  danger: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
  info: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
};

export default function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      )}
    >
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
  return <Badge variant={variant}>{label}</Badge>;
}
