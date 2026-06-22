import { useCallback } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { en } from './locales/en';
import { ur } from './locales/ur';

export type Language = 'en' | 'ur';

const locales = { en, ur } as const;

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      language: 'en',
      setLanguage: (language) => set({ language }),
      toggleLanguage: () => set({ language: get().language === 'en' ? 'ur' : 'en' }),
    }),
    { name: 'smartshop-language' },
  ),
);

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return path;
    }
  }
  return typeof current === 'string' ? current : path;
}

export function translate(
  language: Language,
  key: string,
  params?: Record<string, string | number>,
): string {
  let text = getNestedValue(locales[language] as unknown as Record<string, unknown>, key);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(`{{${k}}}`, String(v));
    });
  }
  return text;
}

export function useTranslation() {
  const { language, setLanguage, toggleLanguage } = useLanguageStore();

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(language, key, params),
    [language],
  );

  return { t, language, setLanguage, toggleLanguage };
}
