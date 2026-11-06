import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils';
import { fieldClass, labelClass } from './Input';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
  /** Width or layout for the label + field wrapper; `className` styles the select itself. */
  containerClassName?: string;
}

export default function Select({ label, options, className, containerClassName, id, ...props }: SelectProps) {
  return (
    <div className={cn('w-full', containerClassName)}>
      {label && (
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          className={cn(fieldClass, 'cursor-pointer appearance-none pe-9', className)}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
      </div>
    </div>
  );
}
