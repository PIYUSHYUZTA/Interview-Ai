import { Fragment, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, ReactNode, RefObject } from 'react';
import { motion } from 'motion/react';
import { motionTokens, usePrefersReducedMotion } from '../../design-system/motion';

/** True once the element has entered the viewport; never resets (entrances play once). */
export function useInViewOnce<T extends Element>(ref: RefObject<T | null>, rootMargin = '0px 0px -10% 0px') {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setSeen(true); observer.disconnect(); } }, { rootMargin });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootMargin, seen]);
  return seen;
}

/**
 * Reveals its `.ds-reveal` descendants once, as the group scrolls into view: each fades and rises 20px over
 * 400ms, staggered 80ms by its `--reveal-index`. Content is visible without JavaScript-driven motion
 * under reduced motion, and keyboard focus inside the group reveals it at once.
 */
export function RevealGroup({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInViewOnce(ref);
  return <div ref={ref} className={`ds-reveal-group ${seen ? 'is-revealed-group' : ''} ${className}`}>{children}</div>;
}
export const revealItem = (index: number, from: 'below' | 'left' = 'below') => ({
  className: 'ds-reveal',
  'data-reveal-from': from === 'left' ? 'left' : undefined,
  style: { '--reveal-index': index } as CSSProperties,
});

/** Counts from zero to `value` once it is in view. Assistive technology reads only the final value. */
export function CountUp({ value, decimals = 0, signed = false }: { value: number; decimals?: number; signed?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInViewOnce(ref);
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!seen || reduced) return;
    let frame = 0;
    const start = performance.now();
    const duration = motionTokens.duration.count * 1000;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setShown(value * (1 - (1 - progress) ** 3)); // ease-out cubic: fast start, gentle landing
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [seen, value, reduced]);
  const format = (n: number) => `${signed && n >= 0 ? '+' : ''}${n.toFixed(decimals)}`;
  return <><span ref={ref} className="ds-count" aria-hidden="true">{format(reduced ? value : shown)}</span><span className="ds-visually-hidden">{format(value)}</span></>;
}

/** A headline that arrives word by word, 60ms apart. The heading's accessible text is unchanged. */
export function WordReveal({ text, delay = 0, startIndex = 0 }: { text: string; delay?: number; startIndex?: number }) {
  const reduced = usePrefersReducedMotion();
  const words = text.split(' ');
  return <>{words.map((word, index) => <Fragment key={`${word}-${index}`}>
    {index > 0 && ' '}
    <motion.span
      className="ds-word"
      style={{ display: 'inline-block' }}
      initial={reduced ? false : { opacity: 0, y: motionTokens.distance.reveal }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : motionTokens.duration.reveal, delay: reduced ? 0 : delay + (startIndex + index) * motionTokens.stagger.word, ease: motionTokens.ease.out }}
    >{word}</motion.span>
  </Fragment>)}</>;
}

/** Types `text` one character at a time after `delay` seconds, then lets the caret fade. */
export function Typewriter({ text, delay = 0, perCharacter = 0.04 }: { text: string; delay?: number; perCharacter?: number }) {
  const reduced = usePrefersReducedMotion();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (reduced) return;
    let typed = 0, interval = 0;
    const start = window.setTimeout(() => {
      interval = window.setInterval(() => {
        typed += 1; setCount(typed);
        if (typed >= text.length) window.clearInterval(interval);
      }, perCharacter * 1000);
    }, delay * 1000);
    return () => { window.clearTimeout(start); window.clearInterval(interval); setCount(0); };
  }, [text, delay, perCharacter, reduced]);
  const typed = reduced ? text.length : count;
  const done = typed >= text.length;
  // The full text, invisible, holds the final size so typing never moves the layout.
  return <span className="ds-typewriter" data-done={done ? '' : undefined}>
    <span className="ds-typewriter-space" aria-hidden="true">{text}</span>
    <span className="ds-typewriter-typed" aria-hidden="true">{text.slice(0, typed)}<span className="ds-typewriter-caret" /></span>
    <span className="ds-visually-hidden">{text}</span>
  </span>;
}

/**
 * Magnetic pull for one primary action: the button leans up to 6px toward a mouse pointer over it and
 * springs back when the pointer leaves. Uses the `translate` property, so hover scale and press
 * transforms still apply. Off for touch, pen and reduced motion.
 */
export function magnetic(reduced: boolean) {
  if (reduced) return {};
  return {
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'mouse') return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const pull = (offset: number, size: number) => Math.max(-6, Math.min(6, (offset / size - 0.5) * 2 * 6));
      event.currentTarget.style.translate = `${pull(event.clientX - bounds.left, bounds.width)}px ${pull(event.clientY - bounds.top, bounds.height)}px`;
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => { event.currentTarget.style.translate = ''; },
  };
}
