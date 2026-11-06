import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'accent';
type Size = 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  // Neutral emphasis: page-level actions that aren't money moving.
  primary:
    'bg-brand-900 text-white hover:bg-brand-800 dark:bg-brand-50 dark:text-brand-900 dark:hover:bg-white',
  secondary:
    'bg-brand-100 text-brand-800 hover:bg-brand-200 dark:bg-brand-800 dark:text-brand-100 dark:hover:bg-brand-700',
  ghost:
    'bg-transparent text-brand-600 hover:bg-brand-100 hover:text-brand-900 dark:text-brand-300 dark:hover:bg-brand-800 dark:hover:text-white',
  danger:
    'bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500',
  outline:
    'border border-brand-200 bg-white text-brand-800 shadow-soft hover:border-brand-300 hover:bg-brand-50 dark:border-brand-700 dark:bg-brand-900 dark:text-brand-100 dark:hover:bg-brand-800',
  // Brand green: the action that completes the job on screen (sell, save, confirm).
  accent:
    'bg-accent text-white shadow-glow hover:bg-accent-light',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-md gap-1.5',
  md: 'h-10 px-4 text-sm rounded-lg gap-2',
  lg: 'h-12 px-5 text-sm rounded-lg gap-2',
  xl: 'h-14 px-6 text-base rounded-xl gap-2.5',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.98] focus-ring disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:active:scale-100',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  ),
);

Button.displayName = 'Button';
export default Button;
