import { Languages } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { cn } from '@/utils';
import Button from '@/components/ui/Button';

export default function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useTranslation();

  return (
    <div className="flex items-center gap-1 rounded-xl border border-brand-200/80 bg-brand-50/80 p-1 dark:border-brand-700 dark:bg-brand-800/50">
      {!compact && <Languages className="ml-2 h-3.5 w-3.5 text-brand-400" />}
      <button
        onClick={() => setLanguage('en')}
        className={cn(
          'rounded-lg px-2.5 py-1 text-xs font-semibold transition-all',
          language === 'en'
            ? 'bg-white text-brand-900 shadow-sm dark:bg-brand-900 dark:text-white'
            : 'text-brand-500 hover:text-brand-700 dark:hover:text-brand-300',
        )}
      >
        EN
      </button>
      <button
        onClick={() => setLanguage('ur')}
        className={cn(
          'rounded-lg px-2.5 py-1 text-xs font-semibold transition-all',
          language === 'ur'
            ? 'bg-white text-brand-900 shadow-sm dark:bg-brand-900 dark:text-white'
            : 'text-brand-500 hover:text-brand-700 dark:hover:text-brand-300',
        )}
      >
        اردو
      </button>
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
