interface ProgressPanelProps {
  percent: number;
  label: string;
  sublabel?: string;
  className?: string;
}

export default function ProgressPanel({
  percent,
  label,
  sublabel,
  className = '',
}: ProgressPanelProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)));

  return (
    <div className={`flex flex-col items-center gap-5 py-2 text-center ${className}`}>
      <div className="relative flex h-24 w-24 items-center justify-center">
        <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100" aria-hidden>
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-brand-200 dark:text-brand-800"
          />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(clamped / 100) * 264} 264`}
            className="text-accent transition-[stroke-dasharray] duration-500 ease-out"
          />
        </svg>
        <span className="absolute text-xl font-bold tabular-nums text-brand-900 dark:text-brand-50">
          {clamped}%
        </span>
      </div>
      <div className="w-full max-w-xs space-y-2">
        <p className="text-sm font-medium text-brand-800 dark:text-brand-100">{label}</p>
        {sublabel && (
          <p className="text-xs text-brand-500 dark:text-brand-400">{sublabel}</p>
        )}
        <div className="h-2 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-800">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${clamped}%` }}
          />
        </div>
      </div>
    </div>
  );
}
