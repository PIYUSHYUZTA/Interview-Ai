import { useEffect } from 'react';
import { loadGsap } from '../components/landing-gsap';

/**
 * Scroll state shared with the WebGL layer without React re-renders. `chapter` is continuous:
 * 2.5 means halfway through the third chapter, measured at the middle of the viewport.
 */
export const scrollState = { chapter: 0, velocity: 0, listeners: new Set<() => void>() };

type Options = { smooth: boolean; onChapter: (index: number) => void };

/**
 * Lenis smooth scrolling (when motion is allowed) synced with GSAP ScrollTrigger, plus the measurement of
 * where each `[data-chapter]` section sits. Native scrolling, keyboard and assistive-technology scrolling
 * still work: Lenis only smooths wheel input and follows the real scroll position.
 */
export function useExperienceScroll({ smooth, onChapter }: Options) {
  useEffect(() => {
    let sections: { top: number; height: number }[] = [];
    let current = -1, frame = 0, disposed = false;
    let destroyLenis: (() => void) | undefined;
    const measure = () => {
      sections = [...document.querySelectorAll<HTMLElement>('[data-chapter]')].map((element) => ({ top: element.offsetTop, height: element.offsetHeight }));
    };
    const update = () => {
      frame = 0;
      if (!sections.length) return;
      const middle = window.scrollY + window.innerHeight / 2;
      let index = sections.findIndex((section) => middle < section.top + section.height);
      if (index < 0) index = sections.length - 1;
      const { top, height } = sections[index];
      const chapter = index + Math.min(1, Math.max(0, (middle - top) / height));
      scrollState.velocity = chapter - scrollState.chapter;
      scrollState.chapter = chapter;
      scrollState.listeners.forEach((listener) => listener());
      if (index !== current) { current = index; onChapter(index); }
    };
    const request = () => { if (!frame) frame = requestAnimationFrame(update); };
    const resize = new ResizeObserver(() => { measure(); request(); });
    resize.observe(document.body);
    measure(); update();
    window.addEventListener('scroll', request, { passive: true });

    if (smooth) {
      void Promise.all([import('lenis'), loadGsap()]).then(([{ default: Lenis }, { gsap, ScrollTrigger }]) => {
        if (disposed) return;
        const lenis = new Lenis({ lerp: .085, wheelMultiplier: .9, anchors: true });
        lenis.on('scroll', ScrollTrigger.update);
        const tick = (time: number) => lenis.raf(time * 1000);
        gsap.ticker.add(tick);
        gsap.ticker.lagSmoothing(0);
        destroyLenis = () => { gsap.ticker.remove(tick); lenis.destroy(); };
      });
    }
    return () => {
      disposed = true; cancelAnimationFrame(frame); resize.disconnect();
      window.removeEventListener('scroll', request); destroyLenis?.();
    };
  }, [smooth, onChapter]);
}
