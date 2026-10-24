import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { motion, useAnimationControls } from 'motion/react';
import { revealVariants, staggerVariants, useLandingReducedMotion } from './landing-motion';

/** Once-only section entrance. Keyboard focus immediately exposes the whole group. */
export function LandingReveal({ children, className = '', stagger = false }: { children: ReactNode; className?: string; stagger?: boolean }) {
  const reduced = !!useLandingReducedMotion();
  const controls = useAnimationControls();
  useEffect(() => {
    if (reduced) { controls.stop(); controls.set('visible'); }
  }, [reduced, controls]);
  return <motion.div
    className={className}
    data-reveal-group={stagger ? 'stagger' : 'single'}
    variants={stagger ? staggerVariants(reduced) : revealVariants(reduced)}
    initial={reduced ? 'visible' : 'hidden'}
    animate={controls}
    onViewportEnter={() => { void controls.start('visible'); }}
    onFocusCapture={() => { controls.stop(); controls.set('visible'); }}
    viewport={{ once: true, amount: 0.12, margin: '0px 0px -24px 0px' }}
  >{children}</motion.div>;
}
