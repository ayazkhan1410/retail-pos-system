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
  primary:
    'bg-brand-900 text-white shadow-card hover:bg-brand-800 hover:shadow-elevated dark:bg-white dark:text-brand-900 dark:hover:bg-brand-100',
  secondary:
    'bg-brand-100 text-brand-900 hover:bg-brand-200 dark:bg-brand-800 dark:text-brand-50 dark:hover:bg-brand-700',
  ghost:
    'bg-transparent hover:bg-brand-100/80 dark:hover:bg-brand-800/80 text-brand-600 dark:text-brand-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-card',
  outline:
    'border border-brand-300/80 bg-white/50 hover:bg-white dark:border-brand-700 dark:bg-brand-900/50 dark:hover:bg-brand-800',
  accent:
    'bg-accent text-white shadow-glow hover:bg-accent-light',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-5 text-sm rounded-xl gap-2',
  xl: 'h-14 px-6 text-base rounded-2xl gap-2.5 font-semibold',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-200 active:scale-[0.98] focus-ring disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  ),
);

Button.displayName = 'Button';
export default Button;
