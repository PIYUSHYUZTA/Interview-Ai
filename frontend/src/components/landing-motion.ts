import type { CSSProperties } from 'react';
import type { Variants } from 'motion/react';
import { motionTokens, usePrefersReducedMotion } from '../design-system/motion';

/** The installed Motion hook snapshots on mount; this one follows runtime changes too. */
export const useLandingReducedMotion = usePrefersReducedMotion;

/**
 * Shared motion language for the landing page, built on the product motion tokens. Durations are seconds.
 * Hero entrance, in order: navigation slides down; headline word by word (60ms apart); supporting copy
 * 200ms after the last word; the call to action 300ms later (scale 0.95 -> 1); the background last.
 */
const headline = 0.1;
const headlineWords = 5; // "Interview practice that feels real."
const lastWord = headline + (headlineWords - 1) * motionTokens.stagger.word;
const copy = lastWord + 0.2;
const action = copy + 0.3;
export const landingMotion = {
  ease: motionTokens.ease.out,
  interactionEase: [0.2, 0.8, 0.2, 1] as const,
  duration: { press: 0.1, fast: 0.16, swap: 0.24, reveal: motionTokens.duration.reveal, atmosphere: 1.2, scene: 1.3 },
  stagger: motionTokens.stagger.item,
  wordStagger: motionTokens.stagger.word,
  distance: { reveal: motionTokens.distance.reveal, swap: 8, heroDrift: 48 },
  /** Background layers move at 0.3x the scroll speed. */
  parallax: 0.3,
  pointerSpring: { stiffness: 90, damping: 26, mass: 0.8 },
  pointerResponse: 10,
  frameInterval: 1000 / 30,
  maxFrameDelta: 0.08,
  entrance: { eyebrow: 0.04, headline, copy, action, descriptor: action + 0.08, background: 0.4, scene: 0.4, panel: 0.9, followUp: 1.1 },
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

/** Section headings arrive from the left: they lead the eye into the section. */
export function headingVariants(reduced: boolean): Variants {
  return {
    hidden: { opacity: reduced ? 1 : 0, x: reduced ? 0 : -landingMotion.distance.reveal },
    visible: { opacity: 1, x: 0, transition: { duration: reduced ? 0 : landingMotion.duration.reveal, ease: landingMotion.ease } },
  };
}

/** Bento cards tilt by one degree, alternating, and settle flat on a spring. */
export function bentoVariants(reduced: boolean): Variants {
  return {
    hidden: (index: number) => (reduced ? { opacity: 1 } : { opacity: 0, y: landingMotion.distance.reveal, rotate: index % 2 ? 1 : -1 }),
    visible: { opacity: 1, y: 0, rotate: 0, transition: reduced ? { duration: 0 } : motionTokens.spring },
  };
}
