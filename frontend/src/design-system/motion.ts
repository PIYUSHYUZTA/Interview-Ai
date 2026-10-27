import { useSyncExternalStore } from 'react';

/**
 * The motion system for code that animates from JavaScript (the Motion library, rAF counters, timers).
 * Mirrors the motion tokens in tokens.css in seconds; src/api/motionSystem.test.ts keeps the two in step.
 * Motion is purposeful: it orders information, confirms an action or explains a change of state.
 */
export const motionTokens = {
  ease: { out: [0.22, 1, 0.36, 1], in: [0.4, 0, 1, 1] },
  duration: {
    fast: 0.12, normal: 0.2, slow: 0.35,
    press: 0.15, dropdown: 0.18, modalIn: 0.2, modalOut: 0.15, pageIn: 0.2, pageOut: 0.15,
    nav: 0.25, media: 0.3, reveal: 0.4, shake: 0.4, count: 1, shimmer: 1.5,
  },
  stagger: { word: 0.06, item: 0.08 },
  distance: { reveal: 20, lift: -4, shake: 8 },
  /** Physics for things that settle (bento cards, magnetic buttons): a light overshoot, no wobble. */
  spring: { type: 'spring', stiffness: 260, damping: 24, mass: 0.9 },
  toastLifetime: 5,
  /** A confirmed submit keeps its checkmark this long before moving on. */
  successHold: 0.45,
} as const;

let preference: MediaQueryList | undefined;
function motionPreference() {
  if (typeof window === 'undefined') return undefined;
  return preference ??= window.matchMedia('(prefers-reduced-motion: reduce)');
}
function subscribe(notify: () => void) {
  const media = motionPreference();
  media?.addEventListener('change', notify);
  return () => media?.removeEventListener('change', notify);
}
const read = () => motionPreference()?.matches ?? true;
const readOnServer = () => true;

/** Live prefers-reduced-motion: follows changes made while the page is open. */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, read, readOnServer);
}
export const prefersReducedMotion = read;
