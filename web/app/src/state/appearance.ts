import { create } from 'zustand';

/**
 * Light, dark or the computer's own setting. The resolved theme is written to
 * <html data-theme>, which tokens.css keys the dark colours on; index.html
 * writes it once before the page paints, so there is no flash of the wrong one.
 */
export type ThemePref = 'system' | 'light' | 'dark';

const THEME_KEY = 'etify:theme';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function readPref(): ThemePref {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    // Storage refused: follow the system.
  }
  return 'system';
}

function apply(pref: ThemePref) {
  const theme = pref === 'system' ? (darkQuery.matches ? 'dark' : 'light') : pref;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  // One theme-color for the browser's own chrome and the installed app's title bar.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.removeAttribute('media');
    meta.content = theme === 'dark' ? '#000000' : '#e9e5f4';
  }
}

interface AppearanceState {
  theme: ThemePref;
  setTheme: (theme: ThemePref) => void;
}

export const useAppearance = create<AppearanceState>()((set) => ({
  theme: readPref(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // The choice then lasts for this tab.
    }
    apply(theme);
    set({ theme });
  },
}));

apply(useAppearance.getState().theme);
darkQuery.addEventListener('change', () => {
  if (useAppearance.getState().theme === 'system') apply('system');
});
