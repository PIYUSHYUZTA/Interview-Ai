import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { motion, useAnimationControls } from 'motion/react';
import { headingVariants, revealVariants, staggerVariants, useLandingReducedMotion } from './landing-motion';

/**
 * Once-only section entrance: rises 20px over 400ms, or, for section headings (`from="left"`), slides in
 * from 20px left. Keyboard focus immediately exposes the whole group.
 */
export function LandingReveal({ children, className = '', stagger = false, from = 'below' }: { children: ReactNode; className?: string; stagger?: boolean; from?: 'below' | 'left' }) {
  const reduced = !!useLandingReducedMotion();
  const controls = useAnimationControls();
  useEffect(() => {
    if (reduced) { controls.stop(); controls.set('visible'); }
  }, [reduced, controls]);
  return <motion.div
    className={className}
    data-reveal-group={stagger ? 'stagger' : 'single'}
    variants={stagger ? staggerVariants(reduced) : from === 'left' ? headingVariants(reduced) : revealVariants(reduced)}
    initial={reduced ? 'visible' : 'hidden'}
    animate={controls}
    onViewportEnter={() => { void controls.start('visible'); }}
    onFocusCapture={() => { controls.stop(); controls.set('visible'); }}
    viewport={{ once: true, amount: 0.12, margin: '0px 0px -24px 0px' }}
  >{children}</motion.div>;
}
