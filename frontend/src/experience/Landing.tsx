import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { usePrefersReducedMotion } from '../design-system/motion';
import { loadGsap } from '../components/landing-gsap';
import { Icon } from '../components/icon/Icon';
import { ArrowDown, ArrowRight, Menu, X } from '../components/icon/icons';
import { SoundToggle } from '../components/sound/SoundToggle';
import { SHOTS } from './chapters';
import { useExperienceScroll } from './scroll';
import { detectTier, type Tier } from './quality';

const ExperienceCanvas = lazy(() => import('./ExperienceCanvas'));

type Props = { onStart: () => void; onWorkspace: () => void; signedIn: boolean };
const NAV = [{ href: '#how', label: 'How it works', chapter: 2 }, { href: '#questions', label: 'Questions', chapter: 3 }, { href: '#live', label: 'Interview room', chapter: 4 }, { href: '#performance', label: 'Report', chapter: 5 }];
const len = (id: string) => `${SHOTS.find((shot) => shot.id === id)!.length}vh`;

/** A headline whose lines rise out of a mask as the section arrives. Screen readers get one plain sentence. */
function Lines({ lines, as: Tag = 'h2', id, className = '' }: { lines: string[]; as?: 'h1' | 'h2'; id: string; className?: string }) {
  return <Tag id={id} className={`lx-title ${className}`} aria-label={lines.join(' ')}>{lines.map((line, index) => <span className="lx-line" key={index} aria-hidden="true"><span>{line}</span></span>)}</Tag>;
}

function Chapter({ id, index, children, className = '' }: { id: string; index: number; children: ReactNode; className?: string }) {
  return <section id={id} className={`lx-chapter lx-ch-${id} ${className}`} data-chapter={index} style={{ height: len(id) }} aria-labelledby={`lx-${id}-title`}>
    <div className="lx-sticky">{children}</div>
  </section>;
}

/**
 * The landing (docs/reference-redesign-spec.md, page 01), after the mindhyve "Where Intelligence Meets…"
 * reference: a night clearing with a luminous Tree of Thought, glass pill navigation, editorial type bottom
 * left, and a scroll story that travels through the tree. All meaning is in this DOM; the canvas is decorative.
 */
export function Landing({ onStart, onWorkspace, signedIn }: Props) {
  const reduced = !!usePrefersReducedMotion();
  const [tier, setTier] = useState<Tier>(() => detectTier(false));
  const [active, setActive] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const film = useRef<HTMLVideoElement>(null);
  useEffect(() => { setTier(detectTier(false)); }, []);
  const onChapter = useCallback((index: number) => setActive(index), []);
  useExperienceScroll({ smooth: !reduced, onChapter });
  useEffect(() => { const on = () => setScrolled(window.scrollY > 80); on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on); }, []);
  useEffect(() => { if (!menu) return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(false); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [menu]);

  // The interviewer film plays only while its section is on screen, and never under reduced motion.
  useEffect(() => {
    const video = film.current; if (!video || reduced) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) void video.play().catch(() => undefined); else video.pause(); }, { threshold: .2 });
    observer.observe(video); return () => observer.disconnect();
  }, [reduced]);

  // Choreography: masked line reveals, section fades, the image mask opening, parallax layers.
  useEffect(() => {
    if (reduced) return;
    let undo: (() => void) | undefined, cancelled = false;
    void loadGsap().then(({ gsap }) => {
      if (cancelled || !root.current) return;
      const context = gsap.context(() => {
        gsap.from('.lx-ch-hero .lx-line > span', { yPercent: 112, duration: 1.3, stagger: .1, ease: 'power4.out', delay: .2 });
        gsap.from('.lx-ch-hero .lx-fade', { autoAlpha: 0, y: 16, duration: 1, stagger: .1, ease: 'power3.out', delay: .7 });
        for (const section of gsap.utils.toArray<HTMLElement>('.lx-chapter:not(.lx-ch-hero)')) {
          const sticky = section.querySelector('.lx-sticky');
          gsap.from(section.querySelectorAll('.lx-line > span'), { yPercent: 112, duration: 1.1, stagger: .08, ease: 'power4.out', scrollTrigger: { trigger: section, start: 'top 55%' } });
          gsap.from(section.querySelectorAll('.lx-fade'), { autoAlpha: 0, y: 24, duration: .9, stagger: .08, ease: 'power3.out', scrollTrigger: { trigger: section, start: 'top 45%' } });
          gsap.to(sticky, { autoAlpha: 0, y: -40, ease: 'none', scrollTrigger: { trigger: section, start: 'bottom 70%', end: 'bottom 30%', scrub: true } });
        }
        gsap.to('.lx-ch-hero .lx-sticky', { autoAlpha: 0, y: -60, ease: 'none', scrollTrigger: { trigger: '.lx-ch-hero', start: 'bottom 85%', end: 'bottom 35%', scrub: true } });
        // Image masking: the interviewer film opens from a narrow capsule to a full frame.
        gsap.fromTo('.lx-mask', { clipPath: 'inset(28% 34% 28% 34% round 999px)' }, { clipPath: 'inset(0% 0% 0% 0% round 24px)', ease: 'none', scrollTrigger: { trigger: '.lx-ch-product', start: 'top 70%', end: 'center 45%', scrub: .6 } });
        gsap.fromTo('.lx-mask video', { scale: 1.3 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.lx-ch-product', start: 'top 70%', end: 'bottom top', scrub: true } });
        // Layered depth in the live room: backdrop slow, panel faster, captions fastest; a slow cinematic zoom.
        gsap.fromTo('.lx-room-back', { yPercent: -6, scale: 1.18 }, { yPercent: 6, scale: 1.04, ease: 'none', scrollTrigger: { trigger: '.lx-ch-live', start: 'top bottom', end: 'bottom top', scrub: true } });
        gsap.fromTo('.lx-room-panel', { yPercent: 18, rotateY: -14 }, { yPercent: -8, rotateY: -4, ease: 'none', scrollTrigger: { trigger: '.lx-ch-live', start: 'top bottom', end: 'bottom top', scrub: true } });
        gsap.fromTo('.lx-room-frame', { clipPath: 'inset(16% 22% 16% 22% round 28px)' }, { clipPath: 'inset(0% 0% 0% 0% round 28px)', ease: 'none', scrollTrigger: { trigger: '.lx-ch-live', start: 'top 60%', end: 'center 50%', scrub: .6 } });
        // Roadmap lines draw as the path of light descends.
        gsap.from('.lx-plan-line', { scaleY: 0, transformOrigin: 'top', ease: 'none', scrollTrigger: { trigger: '.lx-ch-improvement', start: 'top 50%', end: 'center 40%', scrub: true } });
      }, root);
      undo = () => context.revert();
    });
    return () => { cancelled = true; undo?.(); };
  }, [reduced]);

  const live = tier !== 'still';
  const go = (event: React.MouseEvent, action: () => void) => { event.preventDefault(); setMenu(false); action(); };
  return <div className="lx" ref={root} data-theme="dark" data-tier={tier} data-motion={reduced ? 'reduced' : 'full'}>
    {live ? <Suspense fallback={null}><ExperienceCanvas tier={tier} still={reduced} /></Suspense> : <div className="lx-fallback" aria-hidden="true" />}
    <a className="lx-skip" href="#lx-main">Skip to content</a>

    <header className={`lx-nav ${scrolled ? 'is-scrolled' : ''}`}>
      <a className="lx-logo" href="#top" aria-label="Interview AI home"><span className="lx-logo-mark" aria-hidden="true" /><span>interview<b>ai</b></span></a>
      <nav className={`lx-pills ${menu ? 'is-open' : ''}`} aria-label="Primary">
        {NAV.map((item) => <a key={item.href} href={item.href} aria-current={active === item.chapter ? 'true' : undefined} onClick={() => setMenu(false)}>{item.label}</a>)}
        <button type="button" className="lx-pill-quiet" onClick={(event) => go(event, onWorkspace)}>{signedIn ? 'Workspace' : 'Sign in'}</button>
        <button type="button" className="lx-cta lx-cta-sm" onClick={(event) => go(event, onStart)}>Start practicing<span className="lx-chip" aria-hidden="true"><Icon icon={ArrowRight} /></span></button>
      </nav>
      <div className="lx-nav-end"><SoundToggle className="lx-sound-toggle" /><button type="button" className="lx-menu ds-has-tooltip" data-tooltip={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu} aria-label={menu ? 'Close menu' : 'Open menu'} onClick={() => setMenu((open) => !open)}><Icon icon={menu ? X : Menu} size="standalone" /></button></div>
    </header>

    <main id="lx-main" tabIndex={-1}>
      <Chapter id="hero" index={0}>
        <div className="lx-hero-copy">
          <p className="lx-brandline lx-fade">interview ai</p>
          <Lines as="h1" id="lx-hero-title" lines={['Where intelligence', 'meets your', 'story.']} className="lx-display" />
          <p className="lx-lede lx-fade">Beyond practice questions: a real conversation with an AI interviewer that <em>listens</em>, follows your thinking and shows you what to work on next.</p>
          <div className="lx-actions lx-fade">
            <button type="button" className="lx-cta" onClick={onStart}>Start practicing<span className="lx-chip" aria-hidden="true"><Icon icon={ArrowRight} /></span></button>
            <a className="lx-ghost" href="#how">See how it works</a>
          </div>
        </div>
        <a className="lx-scroll lx-fade" href="#product">Scroll to discover <span aria-hidden="true"><Icon icon={ArrowDown} /></span></a>
      </Chapter>

      <Chapter id="product" index={1}>
        <div className="lx-split">
          <div className="lx-copy">
            <p className="lx-eyebrow lx-fade">01 · The product</p>
            <Lines id="lx-product-title" lines={['An interviewer', 'that listens.']} />
            <p className="lx-body lx-fade">Interview AI runs a spoken mock interview built around your résumé and the role you want. It asks, listens to your whole answer, follows up on what you actually said, and turns the conversation into a report you can act on.</p>
          </div>
          <figure className="lx-mask-wrap lx-fade">
            <div className="lx-mask"><video ref={film} src="/media/hero-film.mp4" poster="/media/hero-film-poster.webp" width={1280} height={720} muted loop playsInline preload="none" aria-hidden="true" /></div>
            <figcaption>The interviewer, rendered in Blender. In the room it speaks each question with lip movement driven by the audio.</figcaption>
          </figure>
        </div>
      </Chapter>

      <Chapter id="how" index={2}>
        <div className="lx-copy lx-copy-right">
          <p className="lx-eyebrow lx-fade">02 · How AI interviews work</p>
          <Lines id="lx-how-title" lines={['Rooted in your', 'experience.']} />
          <ol className="lx-steps">
            <li className="lx-fade"><span>01</span><div><h3>Bring your résumé</h3><p>Upload or paste it. Your experience, skills and likely direction are extracted for you to review and correct.</p></div></li>
            <li className="lx-fade"><span>02</span><div><h3>Speak your answers</h3><p>The interviewer asks out loud and listens. Your spoken answer is transcribed and evaluated against a rubric.</p></div></li>
            <li className="lx-fade"><span>03</span><div><h3>Receive your report</h3><p>Scores, evidence from your own words, the gaps that matter for the role and a plan for what to practise next.</p></div></li>
          </ol>
        </div>
      </Chapter>

      <Chapter id="questions" index={3}>
        <div className="lx-copy">
          <p className="lx-eyebrow lx-fade">03 · Intelligent question generation</p>
          <Lines id="lx-questions-title" lines={['Every follow-up', 'grows from', 'what you said.']} />
          <div className="lx-exchange lx-fade" aria-label="Illustrative example">
            <p className="lx-tag">Illustrative example</p>
            <p className="lx-you"><span>You</span>I moved our payment writes to an outbox table, so the data and the event commit together.</p>
            <p className="lx-ai"><span>Interviewer</span>What happens if the consumer processes the same event twice?</p>
          </div>
          <p className="lx-body lx-fade">Questions adapt to your answers and to the role, inside a plan with rounds, skills and difficulty. Real follow-ups come from your own words.</p>
        </div>
      </Chapter>

      <Chapter id="live" index={4}>
        <div className="lx-room">
          <div className="lx-room-frame lx-fade">
            <img className="lx-room-back" src="/media/room-backdrop.webp" width={1920} height={1080} alt="" loading="lazy" decoding="async" />
            <div className="lx-room-panel"><img src="/media/hero-film-poster.webp" width={1280} height={720} alt="" loading="lazy" decoding="async" /></div>
          </div>
          <div className="lx-room-copy">
            <p className="lx-eyebrow lx-fade">04 · The live interview</p>
            <Lines id="lx-live-title" lines={['A room that feels', 'like a conversation.']} />
            <ul className="lx-facts lx-fade"><li>Questions spoken aloud; answers in your own voice</li><li>A 3D interviewer with audio-synchronised lip movement</li><li>Live transcript and a voice visualisation that follows who is speaking</li><li>Camera monitoring only if you opt in</li></ul>
          </div>
        </div>
      </Chapter>

      <Chapter id="performance" index={5}>
        <div className="lx-copy lx-copy-right">
          <p className="lx-eyebrow lx-fade">05 · Performance intelligence</p>
          <Lines id="lx-performance-title" lines={['See how your', 'thinking holds up.']} />
          <p className="lx-body lx-fade">Every answer becomes evidence. The report maps your answers by skill, shows which met the bar and which fell short, and explains how readiness for the role is calculated.</p>
          <div className="lx-gauges lx-fade" role="img" aria-label="Example report figures: overall score 72, readiness 64, 6 of 8 answers met the bar">
            {[{ v: 72, l: 'Overall' }, { v: 64, l: 'Readiness' }, { v: 75, l: 'Answers met', t: '6/8' }].map((g) => <span key={g.l} className="lx-gauge" style={{ '--sweep': `${g.v * 3.6}deg` } as CSSProperties}><b>{g.t ?? g.v}</b><small>{g.l}</small></span>)}
          </div>
          <p className="lx-tag lx-fade">Example figures</p>
        </div>
      </Chapter>

      <Chapter id="improvement" index={6}>
        <div className="lx-copy">
          <p className="lx-eyebrow lx-fade">06 · Personalized improvement</p>
          <Lines id="lx-improvement-title" lines={['Practise what', 'moves you forward.']} />
          <ol className="lx-plan">
            <span className="lx-plan-line" aria-hidden="true" />
            <li className="lx-fade"><b>Priorities</b><p>Gaps ranked by how much they matter for the role you chose.</p></li>
            <li className="lx-fade"><b>Practice</b><p>Exercises and target outcomes for each priority skill.</p></li>
            <li className="lx-fade"><b>Progress</b><p>Each new interview compared with your earlier ones, so you can see what changed.</p></li>
          </ol>
        </div>
      </Chapter>

      <Chapter id="cta" index={7}>
        <div className="lx-final">
          <p className="lx-eyebrow lx-fade">Your next interview</p>
          <Lines id="lx-cta-title" lines={['Walk in', 'prepared.']} className="lx-display" />
          <div className="lx-actions lx-fade">
            <button type="button" className="lx-cta" onClick={onStart}>Start practicing<span className="lx-chip" aria-hidden="true"><Icon icon={ArrowRight} /></span></button>
            <button type="button" className="lx-ghost" onClick={onWorkspace}>{signedIn ? 'Open your workspace' : 'Sign in'}</button>
          </div>
        </div>
      </Chapter>
    </main>

    <footer className="lx-footer">
      <div className="lx-footer-brand"><a className="lx-logo" href="#top" aria-label="Interview AI, back to top"><span className="lx-logo-mark" aria-hidden="true" /><span>interview<b>ai</b></span></a><p>Realistic, voice-first interview practice with an AI interviewer.</p></div>
      <nav className="lx-footer-links" aria-label="Footer">
        <div><span>Product</span><a href="#how">How it works</a><a href="#questions">Question generation</a><a href="#live">Interview room</a><a href="#performance">Report</a></div>
        <div><span>Account</span><button type="button" onClick={onWorkspace}>{signedIn ? 'Open your workspace' : 'Sign in'}</button><button type="button" onClick={onStart}>Begin an interview</button></div>
      </nav>
      <p className="lx-note">Deterministic practice mode is available when no AI provider is configured. Voice recognition and playback depend on your browser and speech-service availability. The 3D interviewer is a visual representation.</p>
    </footer>
  </div>;
}
