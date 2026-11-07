import { useTranslation } from '@/i18n';
import { cn } from '@/utils';

const STEPS = [
  'bg-brand-100 dark:bg-brand-800/60',
  'bg-accent/15',
  'bg-accent/30',
  'bg-accent/50',
  'bg-accent/70',
  'bg-accent',
];
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function hourLabel(hour: number) {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return String(h);
}

/** Weekday × hour grid (Mon first). Shows the shop's open hours: 9 to 9 unless sales fall outside them. */
export default function Heatmap({ grid, className }: { grid: number[][]; className?: string }) {
  const { t } = useTranslation();
  let first = 9;
  let last = 21;
  grid.forEach((row) => row.forEach((count, hour) => {
    if (count > 0) {
      first = Math.min(first, hour);
      last = Math.max(last, hour);
    }
  }));
  const hours = Array.from({ length: last - first + 1 }, (_, index) => first + index);
  const max = Math.max(1, ...grid.flat());

  return (
    <div className={cn('w-full', className)}>
      <div className="grid gap-1" style={{ gridTemplateColumns: `2.25rem repeat(${hours.length}, minmax(0, 1fr))` }}>
        <span />
        {hours.map((hour) => (
          <span key={hour} className="text-center text-[11px] text-brand-400">{(hour - first) % 2 === 0 ? hourLabel(hour) : ''}</span>
        ))}
        {grid.map((row, day) => (
          <div key={day} className="contents">
            <span className="self-center text-[11px] text-brand-500">{t(`pg.days.${DAY_KEYS[day]}`)}</span>
            {hours.map((hour) => {
              const count = row[hour] ?? 0;
              const step = count === 0 ? 0 : Math.min(STEPS.length - 1, Math.ceil((count / max) * (STEPS.length - 1)));
              return (
                <span
                  key={hour}
                  title={`${t(`pg.days.${DAY_KEYS[day]}`)} ${hourLabel(hour)}${hour < 12 ? 'am' : 'pm'} · ${count}`}
                  className={cn('h-5 rounded-[3px]', STEPS[step])}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
