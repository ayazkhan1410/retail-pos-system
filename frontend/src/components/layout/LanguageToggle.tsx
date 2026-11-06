import { Languages } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { cn } from '@/utils';
import Button from '@/components/ui/Button';

/** Segmented EN / Urdu switch. `tone="dark"` for the till's header. */
export default function LanguageToggle({ compact = false, tone = 'light' }: { compact?: boolean; tone?: 'light' | 'dark' }) {
  const { language, setLanguage } = useTranslation();
  const dark = tone === 'dark';

  const option = (value: 'en' | 'ur', label: string) => (
    <button
      type="button"
      onClick={() => setLanguage(value)}
      aria-pressed={language === value}
      lang={value}
      className={cn(
        'h-7 rounded-md px-2.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        language === value
          ? dark
            ? 'bg-white text-ink'
            : 'bg-white text-brand-900 shadow-soft ring-1 ring-brand-200 dark:bg-brand-700 dark:text-white dark:ring-brand-600'
          : dark
            ? 'text-white/60 hover:text-white'
            : 'text-brand-500 hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-100',
      )}
    >
      {label}
    </button>
  );

  return (
    <div
      role="group"
      aria-label="Language"
      className={cn(
        'flex h-9 items-center gap-0.5 rounded-lg p-1',
        dark ? 'bg-white/10' : 'border border-brand-200 bg-brand-100/70 dark:border-brand-700 dark:bg-brand-800/60',
      )}
    >
      {!compact && <Languages aria-hidden className="mx-1.5 h-3.5 w-3.5 text-brand-400" />}
      {option('en', 'EN')}
      {option('ur', 'اردو')}
    </div>
  );
}

export function LanguageToggleButton() {
  const { language, toggleLanguage } = useTranslation();

  return (
    <Button variant="outline" size="sm" onClick={toggleLanguage} className="gap-1.5 !px-2.5">
      <Languages className="h-4 w-4" />
      <span className="text-xs font-semibold">{language === 'en' ? 'EN' : 'اردو'}</span>
    </Button>
  );
}
