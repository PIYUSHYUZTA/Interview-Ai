import { useEffect, useRef, useState } from 'react';
import { Icon } from './icon/Icon';
import { ArrowRight } from './icon/icons';
import { loadGsap } from './landing-gsap';
import { useLandingReducedMotion } from './landing-motion';
import { Button } from './ui';

const prefersData = () => !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;

/** Full-bleed interlude built around the Cycles-rendered interviewer film (scripts/blender/render_hero_film.py).
 * The video loads only near the viewport, plays only while visible, never autoplays under reduced motion or
 * data saver, and always has a real pause/play control. GSAP scrubs the reveal when motion is allowed. */
export function LandingFilm({ onStart }: { onStart: () => void }) {
  const reduced = !!useLandingReducedMotion();
  const section = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [userChoice, setUserChoice] = useState<'play' | 'pause' | null>(null);
  const [failed, setFailed] = useState(false);
  const [autoplay] = useState(() => !prefersData());

  useEffect(() => {
    const element = section.current; if (!element) return;
    const nearby = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setNear(true); }, { rootMargin: '600px 0px' });
    const onScreen = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .25 });
    nearby.observe(element); onScreen.observe(element);
    return () => { nearby.disconnect(); onScreen.disconnect(); };
  }, []);

  // Play only while on screen and the tab is visible; respect the visitor's choice and motion preference.
  useEffect(() => {
    const player = video.current; if (!player || failed || !near) return;
    const wanted = userChoice === 'play' || (userChoice === null && autoplay && !reduced);
    const sync = () => { if (wanted && visible && !document.hidden) void player.play().catch(() => setPlaying(false)); else player.pause(); };
    sync(); document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [visible, near, userChoice, autoplay, reduced, failed]);

  useEffect(() => {
    if (reduced || !near) return;
    let undo: (() => void) | undefined, cancelled = false;
    void loadGsap().then(({ gsap }) => {
      if (cancelled || !section.current) return;
      const context = gsap.context(() => {
        gsap.fromTo(frame.current, { clipPath: 'inset(9% 7% 9% 7% round 28px)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none', scrollTrigger: { trigger: section.current, start: 'top 88%', end: 'top 12%', scrub: .6 } });
        gsap.fromTo(video.current, { scale: 1.16, yPercent: -3 }, { scale: 1, yPercent: 3, ease: 'none', scrollTrigger: { trigger: section.current, start: 'top bottom', end: 'bottom top', scrub: true } });
        gsap.from('.c-film-line > span', { yPercent: 105, opacity: 0, stagger: .12, duration: 1.1, ease: 'power3.out', scrollTrigger: { trigger: section.current, start: 'top 55%' } });
      }, section);
      undo = () => context.revert();
    });
    return () => { cancelled = true; undo?.(); };
  }, [reduced, near]);

  return <section className="c-film" id="the-interviewer" ref={section} aria-labelledby="c-film-title" data-film={failed ? 'failed' : playing ? 'playing' : 'paused'}>
    <div className="c-film-frame" ref={frame}>
      <video ref={video} className="c-film-video" width={1280} height={720} muted loop playsInline preload="none" poster="/media/hero-film-poster.webp" aria-hidden="true" onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)}>
        {near && <source src="/media/hero-film.mp4" type="video/mp4" onError={() => { setFailed(true); setPlaying(false); }} />}
      </video>
      <div className="c-film-shade" aria-hidden="true" />
    </div>
    <div className="c-film-copy c-container">
      <p className="c-eyebrow">THE INTERVIEWER</p>
      <h2 id="c-film-title"><span className="c-film-line"><span>Someone to talk to.</span></span><span className="c-film-line"><span>Not a form to fill in.</span></span></h2>
      <p className="c-film-text">This film is rendered in Blender with Cycles. In the interview room the same character is drawn live in your browser and speaks each question, with lip movement driven by the spoken audio.</p>
      <div className="c-film-actions">
        <Button className="c-primary" onClick={onStart}>Meet your interviewer <Icon icon={ArrowRight} /></Button>
        {!failed && <button type="button" className="c-film-toggle" aria-pressed={playing} onClick={() => { const next = playing ? 'pause' : 'play'; setUserChoice(next); if (next === 'play') { setNear(true); setVisible(true); } }}><span aria-hidden="true">{playing ? 'Ⅱ' : '▷'}</span>{playing ? 'Pause film' : 'Play film'}</button>}
      </div>
      <p className="c-film-note">{failed ? 'Film unavailable · showing a still frame' : 'Pre-rendered film · silent · 10-second loop'}</p>
    </div>
  </section>;
}
