import { useEffect } from 'react';
import { useThemeStore } from '@/store';

export function useTheme() {
  const { theme, setTheme } = useThemeStore();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    const stored = localStorage.getItem('smartshop-theme');
    if (!stored) {
      setTheme(prefersDark.matches ? 'dark' : 'light');
    }
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('smartshop-theme')) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    prefersDark.addEventListener('change', handler);
    return () => prefersDark.removeEventListener('change', handler);
  }, [setTheme]);

  return useThemeStore();
}
