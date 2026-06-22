import { cn } from '@/utils';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export default function Select({ label, options, className, id, ...props }: SelectProps) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-2 block text-sm font-medium text-brand-700 dark:text-brand-300">
          {label}
        </label>
      )}
      <select
        id={id}
        className={cn(
          'h-11 w-full rounded-xl border border-brand-200 bg-white px-3 text-sm text-brand-900 focus-ring dark:border-brand-700 dark:bg-brand-800 dark:text-brand-50',
          className,
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
