import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../design-system/motion';
import { loadGsap } from '../components/landing-gsap';
import { CHAPTERS } from './chapters';
import { useExperienceScroll } from './scroll';
import { detectTier, type Tier } from './quality';

const ExperienceCanvas = lazy(() => import('./ExperienceCanvas'));

/**
 * The immersive landing (Phase 1 foundation): real, accessible DOM chapters scrolling over one persistent
 * WebGL canvas. All meaning lives in the DOM; the canvas is decorative and absent in the still tier.
 */
export function Experience() {
  const reduced = !!usePrefersReducedMotion();
  const [tier, setTier] = useState<Tier>(() => detectTier(reduced));
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { setTier(detectTier(reduced)); }, [reduced]);
  const onChapter = useCallback((index: number) => setActive(index), []);
  useExperienceScroll({ smooth: !reduced, onChapter });

  // Masked line reveals, played as each chapter's copy reaches the reading zone.
  useEffect(() => {
    if (reduced) return;
    let undo: (() => void) | undefined, cancelled = false;
    void loadGsap().then(({ gsap }) => {
      if (cancelled || !root.current) return;
      const context = gsap.context(() => {
        for (const copy of gsap.utils.toArray<HTMLElement>('.xp-copy')) {
          gsap.from(copy.querySelectorAll('.xp-line > span'), { yPercent: 110, duration: 1.1, stagger: .09, ease: 'power3.out', scrollTrigger: { trigger: copy, start: 'top 72%' } });
          gsap.from(copy.querySelectorAll('.xp-eyebrow, .xp-body, .xp-actions'), { opacity: 0, y: 16, duration: .8, stagger: .08, delay: .25, ease: 'power2.out', scrollTrigger: { trigger: copy, start: 'top 72%' } });
        }
      }, root);
      undo = () => context.revert();
    });
    return () => { cancelled = true; undo?.(); };
  }, [reduced]);

  const live = tier !== 'still';
  return <div className="xp" ref={root} data-tier={tier}>
    {live && <Suspense fallback={null}><ExperienceCanvas tier={tier} /></Suspense>}
    <a className="xp-skip" href="#xp-main">Skip to content</a>
    <header className="xp-nav">
      <a className="xp-wordmark" href="/" aria-label="Interview AI home">interview<span>ai</span></a>
      <p className="xp-now" aria-live="polite"><span>0{active + 1}</span> {CHAPTERS[active].label}</p>
      <a className="xp-cta-small" href="/">Open the app</a>
    </header>
    <nav className="xp-rail" aria-label="Chapters">
      {CHAPTERS.map((chapter, index) => <a key={chapter.id} href={`#xp-${chapter.id}`} aria-current={index === active ? 'step' : undefined}><span className="ds-visually-hidden">{chapter.label}</span></a>)}
    </nav>
    <main id="xp-main" tabIndex={-1}>
      {CHAPTERS.map((chapter, index) => {
        const Heading = index === 0 ? 'h1' : 'h2';
        return <section key={chapter.id} id={`xp-${chapter.id}`} className="xp-chapter" data-chapter={index} data-align={chapter.align} style={{ height: `${chapter.length}vh` }} aria-labelledby={`xp-${chapter.id}-title`}>
          {!live && <img className="xp-still" src={chapter.still} alt="" width={1600} height={1000} loading="lazy" decoding="async" />}
          <div className="xp-copy">
            <p className="xp-eyebrow">0{index + 1} — {chapter.label}</p>
            <Heading id={`xp-${chapter.id}-title`} className="xp-title">{chapter.lines.map((line) => <span className="xp-line" key={line}><span>{line}</span></span>)}</Heading>
            <p className="xp-body">{chapter.body}</p>
            {index === CHAPTERS.length - 1 && <div className="xp-actions"><a className="xp-cta" href="/">Start practising</a><a className="xp-cta-quiet" href="/">Sign in</a></div>}
          </div>
        </section>;
      })}
    </main>
    <footer className="xp-footer"><p>Preview of the immersive landing, Phase 1: greybox sets stand in for the Blender environments still to come.</p></footer>
  </div>;
}
