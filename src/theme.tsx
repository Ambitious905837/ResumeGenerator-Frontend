import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'ru_theme';

interface ThemeContextValue {
  /** What the user picked — including "follow the OS". */
  theme: Theme;
  /** What is actually on screen right now, with "system" already resolved. */
  resolved: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  /** Flip between light and dark, leaving "system" behind. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // Private mode, or site data blocked — fall back to following the OS.
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Light/dark for the whole app.
 *
 * The class is put on <html> rather than a wrapper div so that portalled content —
 * every Radix dialog, tooltip and select menu renders into document.body, outside the
 * React tree — is themed too. `public/index.html` applies the same class before first
 * paint, so a dark-mode user never sees a white flash on load; this provider only has
 * to keep it in sync afterwards.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStored);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  // Only relevant while the choice is "system", but the listener is cheap and keeping
  // it mounted means switching back to "system" is already correct.
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    // Tells the browser to paint its own chrome — form controls, scrollbar corners —
    // in the matching scheme.
    root.style.colorScheme = resolved;
  }, [resolved]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference just won't survive the reload.
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setTheme]);

  const value = useMemo(() => ({ theme, resolved, setTheme, toggle }), [theme, resolved, setTheme, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
