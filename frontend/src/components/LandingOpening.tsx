import { useEffect, useState } from 'react';
import { useLandingReducedMotion } from './landing-motion';

const SEEN_KEY = 'interview-ai.opening-seen';
const seen = () => { try { return window.sessionStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } };
// While the opening plays, the film holds its title reveal until the frame has parted.
let partsAt = 0;
export const openingDelay = (reduced: boolean) => (reduced ? 0 : Math.max(0, (partsAt - performance.now()) / 1000));

/**
 * The opening title: once per session, about 1.9 seconds. A teal line draws across the dark, the wordmark
 * rises out of it, then the frame parts like a letterbox to reveal the film. It never blocks the page: it
 * ignores the pointer, is hidden from assistive technology, and ends at once on any key, click or scroll.
 * Not shown at all under reduced motion.
 */
export function LandingOpening() {
  const reduced = !!useLandingReducedMotion();
  const [phase, setPhase] = useState<'play' | 'part' | 'done'>(() => {
    if (reduced || seen()) return 'done';
    partsAt = performance.now() + 1250;
    return 'play';
  });

  useEffect(() => {
    if (phase === 'done') return;
    try { window.sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* storage unavailable: it simply plays again next visit */ }
    const skip = () => { partsAt = 0; setPhase((value) => (value === 'play' ? 'part' : value)); };
    const part = window.setTimeout(skip, 1250);
    const done = window.setTimeout(() => setPhase('done'), 1950);
    window.addEventListener('keydown', skip); window.addEventListener('pointerdown', skip); window.addEventListener('wheel', skip, { passive: true }); window.addEventListener('touchmove', skip, { passive: true });
    return () => {
      window.clearTimeout(part); window.clearTimeout(done);
      window.removeEventListener('keydown', skip); window.removeEventListener('pointerdown', skip); window.removeEventListener('wheel', skip); window.removeEventListener('touchmove', skip);
    };
  }, [phase === 'done']); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (phase === 'part') { const end = window.setTimeout(() => setPhase('done'), 700); return () => window.clearTimeout(end); } }, [phase]);

  if (phase === 'done') return null;
  return <div className="c-opening" data-phase={phase} aria-hidden="true">
    <div className="c-opening-leaf c-opening-top" />
    <div className="c-opening-leaf c-opening-bottom" />
    <div className="c-opening-title">
      <span className="c-opening-word">interview<span>ai</span></span>
      <span className="c-opening-line" />
      <span className="c-opening-caption">A conversation, rehearsed.</span>
    </div>
  </div>;
}
