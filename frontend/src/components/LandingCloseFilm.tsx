import { useEffect, useRef, useState } from 'react';
import { useLandingReducedMotion } from './landing-motion';

const prefersData = () => !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;

/**
 * Behind the final call to action: a seamless 6 s Cycles loop of the instrument (scripts/blender/build_landing_artifact.py).
 * It loads only as the section approaches and plays only while on screen; under reduced motion or data saver
 * the rendered poster stands in. Purely decorative: the heading and button above it carry the meaning.
 */
export function LandingCloseFilm() {
  const reduced = !!useLandingReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const [motion] = useState(() => !prefersData());
  useEffect(() => {
    const element = box.current; if (!element) return;
    const nearby = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setNear(true); nearby.disconnect(); } }, { rootMargin: '700px 0px' });
    const onScreen = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .15 });
    nearby.observe(element); onScreen.observe(element);
    return () => { nearby.disconnect(); onScreen.disconnect(); };
  }, []);
  const play = near && motion && !reduced;
  useEffect(() => {
    const player = video.current; if (!player || !play) return;
    const sync = () => { if (visible && !document.hidden) void player.play().catch(() => undefined); else player.pause(); };
    sync(); document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [play, visible]);
  return <div className="c-close-film" ref={box} aria-hidden="true">
    {play
      ? <video ref={video} className="c-close-video" width={1280} height={720} muted loop playsInline preload="auto" poster="/media/instrument-loop-poster.webp" src="/media/instrument-loop.mp4" />
      : <img className="c-close-video" src="/media/instrument-loop-poster.webp" width={1280} height={720} alt="" loading="lazy" decoding="async" />}
    <div className="c-close-shade" />
  </div>;
}
