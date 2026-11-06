import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: ReactNode;
}

export const fieldClass =
  'h-10 w-full rounded-lg border border-brand-200 bg-white px-3 text-sm text-brand-900 shadow-soft transition-[border-color,box-shadow] placeholder:text-brand-400 hover:border-brand-300 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:cursor-not-allowed disabled:bg-brand-50 disabled:text-brand-500 dark:border-brand-700 dark:bg-brand-900 dark:text-brand-50 dark:placeholder:text-brand-500 dark:hover:border-brand-600 dark:disabled:bg-brand-800/50';

export const labelClass = 'mb-1.5 block text-sm font-medium text-brand-700 dark:text-brand-300';

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, icon, id, ...props }, ref) => {
    const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className={labelClass}>
            {label}
            {props.required && <span aria-hidden className="ms-0.5 text-red-500">*</span>}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-brand-400 [&>svg]:h-4 [&>svg]:w-4">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={id}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              fieldClass,
              icon && 'ps-9',
              error && 'border-red-400 focus:border-red-500 focus:ring-red-500/15 dark:border-red-500/70',
              className,
            )}
            {...props}
          />
        </div>
        {error ? (
          <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
        ) : hint ? (
          <p id={`${id}-hint`} className="mt-1.5 text-xs text-brand-500">{hint}</p>
        ) : null}
      </div>
    );
  },
);

Input.displayName = 'Input';
export default Input;
