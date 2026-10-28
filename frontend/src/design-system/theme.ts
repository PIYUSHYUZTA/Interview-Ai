import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

/**
 * Dark and light themes. The inline script in each HTML page applies the theme before first paint (the
 * saved choice, otherwise the system preference), so there is never a flash of the wrong colours; this
 * module keeps it in step afterwards. Until the person chooses, the theme follows the system setting live.
 */
export type Theme = 'dark' | 'light';
export const THEME_KEY = 'interview-ai.theme';
const THEME_COLOR: Record<Theme, string> = { dark: '#0A0A0A', light: '#F3F1E9' }; // browser chrome only

const saved = (): Theme | null => { try { const value = window.localStorage.getItem(THEME_KEY); return value === 'light' || value === 'dark' ? value : null; } catch { return null; } };
const system = (): Theme => (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
const listeners = new Set<() => void>();
let theme: Theme = typeof document === 'undefined' ? 'dark' : (document.documentElement.dataset.theme as Theme | undefined) ?? saved() ?? system();

/**
 * Switches the theme. Animated switches use the View Transitions API: the browser snapshots the page before
 * and after and cross-fades the two (300ms ease, --duration-theme), a single composited animation however
 * many surfaces change. The toggle's icon, when given, gets its own layer so the moon turns into the sun.
 * Without the API, or with reduced motion, the theme changes at once.
 */
function apply(next: Theme, animate: boolean, icon?: HTMLElement | null) {
  const root = document.documentElement;
  const swap = () => flushSync(() => {
    root.dataset.theme = next;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[next]);
    theme = next;
    listeners.forEach((listener) => listener());
  });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate || reduced || typeof document.startViewTransition !== 'function') { swap(); return; }
  if (icon) icon.style.viewTransitionName = 'theme-icon';
  const transition = document.startViewTransition(swap);
  void transition.finished.finally(() => { if (icon) icon.style.viewTransitionName = ''; });
}

/** The person's explicit choice: applied with the transition and remembered. */
export function setTheme(next: Theme, icon?: HTMLElement | null) {
  try { window.localStorage.setItem(THEME_KEY, next); } catch { /* in-memory only */ }
  apply(next, true, icon);
}

if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (!saved()) apply(system(), true); });
  // Another tab changed the choice.
  window.addEventListener('storage', (event) => { if (event.key === THEME_KEY) apply(saved() ?? system(), true); });
}

export function useTheme() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => theme, () => 'dark' as Theme);
}
