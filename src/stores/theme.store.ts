import { create } from 'zustand';

type Theme = 'light' | 'dark';

const THEME_KEY = 'kroma_theme';

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  // Legacy key compat
  const legacy = localStorage.getItem('theme');
  if (legacy === 'light' || legacy === 'dark') return legacy;
  return 'dark';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  // Legacy compat: keep class-based for old components
  root.classList.remove('theme-light', 'theme-dark');
  root.classList.add(`theme-${theme}`);
  localStorage.setItem(THEME_KEY, theme);
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  set: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const initial = typeof window !== 'undefined' ? getInitialTheme() : 'dark';
  if (typeof window !== 'undefined') applyTheme(initial);

  return {
    theme: initial,
    toggle: () => {
      const next = get().theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      set({ theme: next });
    },
    set: (theme: Theme) => {
      applyTheme(theme);
      set({ theme });
    },
  };
});
