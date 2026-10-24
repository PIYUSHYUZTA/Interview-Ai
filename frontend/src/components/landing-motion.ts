import type { CSSProperties } from 'react';
import { useSyncExternalStore } from 'react';
import type { Variants } from 'motion/react';

let preference: MediaQueryList | undefined;
function motionPreference() {
  if (typeof window === 'undefined') return undefined;
  return preference ??= window.matchMedia('(prefers-reduced-motion: reduce)');
}
function subscribePreference(notify: () => void) {
  const media = motionPreference();
  media?.addEventListener('change', notify);
  return () => media?.removeEventListener('change', notify);
}
const readPreference = () => motionPreference()?.matches ?? true;
const serverPreference = () => true;

/** The installed Motion hook snapshots on mount; subscribe to runtime changes too. */
export function useLandingReducedMotion() {
  return useSyncExternalStore(subscribePreference, readPreference, serverPreference);
}

/** Shared motion language for the landing page. Durations are seconds. */
export const landingMotion = {
  ease: [0.22, 1, 0.36, 1] as const,
  interactionEase: [0.2, 0.8, 0.2, 1] as const,
  duration: { press: 0.1, fast: 0.16, swap: 0.24, reveal: 0.64, atmosphere: 1.2, scene: 1.3 },
  stagger: 0.08,
  distance: { reveal: 18, swap: 8, heroDrift: 48 },
  pointerSpring: { stiffness: 90, damping: 26, mass: 0.8 },
  pointerResponse: 10,
  frameInterval: 1000 / 30,
  maxFrameDelta: 0.08,
  entrance: { eyebrow: 0.04, headline: 0.12, headlineEnd: 0.2, copy: 0.28, action: 0.28, descriptor: 0.4, scene: 0.08, panel: 0.44, followUp: 0.56 },
} as const;

export const landingMotionStyles = {
  '--c-motion-ease': `cubic-bezier(${landingMotion.ease.join(',')})`,
  '--c-motion-interaction': `cubic-bezier(${landingMotion.interactionEase.join(',')})`,
  '--c-motion-fast': `${landingMotion.duration.fast}s`,
  '--c-motion-swap': `${landingMotion.duration.swap}s`,
  '--c-motion-reveal': `${landingMotion.duration.reveal}s`,
  '--c-motion-press': `${landingMotion.duration.press}s`,
} as CSSProperties;

export function revealVariants(reduced: boolean): Variants {
  return {
    hidden: { opacity: reduced ? 1 : 0, y: reduced ? 0 : landingMotion.distance.reveal },
    visible: { opacity: 1, y: 0, transition: { duration: reduced ? 0 : landingMotion.duration.reveal, ease: landingMotion.ease } },
  };
}

export function staggerVariants(reduced: boolean): Variants {
  return { hidden: {}, visible: { transition: { staggerChildren: reduced ? 0 : landingMotion.stagger } } };
}
