import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, id, ...props }, ref) => (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-2 block text-sm font-medium text-brand-700 dark:text-brand-300">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-400">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            'h-11 w-full rounded-xl border border-brand-200/80 bg-white/80 px-3.5 text-sm text-brand-900 shadow-soft placeholder:text-brand-400 transition-all focus:border-accent/40 focus:bg-white focus:shadow-card focus-ring dark:border-brand-700/80 dark:bg-brand-900/80 dark:text-brand-50 dark:placeholder:text-brand-500 dark:focus:bg-brand-900',
            icon && 'pl-11',
            error && 'border-red-500',
            className,
          )}
          {...props}
        />
      </div>
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </div>
  ),
);

Input.displayName = 'Input';
export default Input;
