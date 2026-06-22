import { useEffect } from 'react';
import { useLanguageStore } from '@/i18n';

export function useLanguage() {
  const { language } = useLanguageStore();

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ur' ? 'rtl' : 'ltr';
  }, [language]);

  return useLanguageStore();
}
