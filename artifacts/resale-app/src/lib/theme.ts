import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';
const STORAGE_KEY = 'crosslinkos-theme';

export function readTheme(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    /* storage can be unavailable (private window); fall back to light */
  }
  return 'light';
}

export function applyTheme(choice: ThemeChoice): void {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const dark = choice === 'dark' || (choice === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0F0E13' : '#F6F5F2');
}

export function initTheme(): void {
  applyTheme(readTheme());
}

export function useTheme(): { theme: ThemeChoice; setTheme: (next: ThemeChoice) => void } {
  const [theme, setThemeState] = useState<ThemeChoice>(() => readTheme());

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => applyTheme('system');
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, [theme]);

  const setTheme = useCallback((next: ThemeChoice) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* non-fatal */
    }
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
