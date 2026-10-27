import { useSyncExternalStore } from 'react';

/**
 * Dark and light themes. The inline script in each HTML page applies the theme before first paint (the
 * saved choice, otherwise the system preference), so there is never a flash of the wrong colours; this
 * module keeps it in step afterwards. Until the person chooses, the theme follows the system setting live.
 */
export type Theme = 'dark' | 'light';
export const THEME_KEY = 'interview-ai.theme';
/** Every surface's colour change takes this long when the theme switches (tokens: --duration-theme). */
const SWITCH_MS = 300;
const THEME_COLOR: Record<Theme, string> = { dark: '#0A0A0A', light: '#F3F1E9' }; // browser chrome only

const saved = (): Theme | null => { try { const value = window.localStorage.getItem(THEME_KEY); return value === 'light' || value === 'dark' ? value : null; } catch { return null; } };
const system = (): Theme => (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
const listeners = new Set<() => void>();
let theme: Theme = typeof document === 'undefined' ? 'dark' : (document.documentElement.dataset.theme as Theme | undefined) ?? saved() ?? system();
let switchTimer = 0;

function apply(next: Theme, animate: boolean) {
  const root = document.documentElement;
  if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Only while switching: every surface eases its colours together, then normal transitions return.
    root.dataset.themeSwitching = '';
    window.clearTimeout(switchTimer);
    switchTimer = window.setTimeout(() => { delete root.dataset.themeSwitching; }, SWITCH_MS + 50);
  }
  root.dataset.theme = next;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[next]);
  theme = next;
  listeners.forEach((listener) => listener());
}

/** The person's explicit choice: applied with the transition and remembered. */
export function setTheme(next: Theme) {
  try { window.localStorage.setItem(THEME_KEY, next); } catch { /* in-memory only */ }
  apply(next, true);
}

if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (!saved()) apply(system(), true); });
  // Another tab changed the choice.
  window.addEventListener('storage', (event) => { if (event.key === THEME_KEY) apply(saved() ?? system(), true); });
}

export function useTheme() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => theme, () => 'dark' as Theme);
}
