import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useScroll, useTransform, useMotionValue, useSpring, useInView, useAnimationControls } from 'motion/react';
import { ArrowRightIcon, BarChartIcon, FileTextIcon, MicIcon, TargetIcon, Volume2Icon, VolumeXIcon } from './Icons';
import { AdaptivePreview, RoomPreview, ReportPreview } from './LandingProductPreviews';
import { BlenderAssetScene } from './BlenderAssetScene';
import { LandingFilm } from './LandingFilm';
import { loadGsap } from './landing-gsap';
import { LandingReveal as Reveal } from './LandingReveal';
import { landingMotion as timing, landingMotionStyles, revealVariants, useLandingReducedMotion } from './landing-motion';
import { Button } from './ui';
import { useLandingSound } from './useLandingSound';
import './LandingPage.css';

// Labels and round structure match /interviews/options and the setup screen.
const interviewTypes = [
  { label: 'Complete interview', detail: 'Introduction, technical, problem-solving and behavioral rounds' },
  { label: 'Technical deep dive', detail: 'Technical and problem-solving rounds' },
  { label: 'Behavioral & communication', detail: 'Introduction and behavioral rounds' },
];
const roles = ['Backend', 'Frontend', 'Full-Stack', 'Data & ML'];

const features = [
  { title: 'Voice-based interview practice', description: 'The interviewer speaks each question aloud, listens to your spoken answer and shows a transcript of what you said.', icon: MicIcon },
  { title: 'Technical and behavioral preparation', description: 'Choose a complete interview, a technical deep dive or a behavioral and communication session for backend, frontend, full-stack or data roles.', icon: TargetIcon },
  { title: 'Feedback and performance analysis', description: 'Skill-level scores, demonstrated strengths, knowledge gaps and answer-by-answer evidence, with coaching on how to strengthen an answer.', icon: FileTextIcon },
  { title: 'History and progress tracking', description: 'Completed interviews are saved to your workspace with a progress chart, your current skill profile and weaknesses that keep repeating.', icon: BarChartIcon },
];

const navigation = [['#how-it-works', 'How it works'], ['#capabilities', 'Features'], ['#approach', 'About']] as const;

function Mark({ small = false }: { small?: boolean }) {
  return <span className={`c-mark ${small ? 'c-mark-small' : ''}`} aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M16 3 28 10v12L16 29 4 22V10L16 3Z" stroke="currentColor" strokeWidth="1.4" /><path d="m4 10 12 7 12-7M16 17v12M16 3v8m-6 3 6-3 6 3" stroke="currentColor" strokeWidth="1.4" /></svg></span>;
}

export function LandingPage({ onStart, onWorkspace, signedIn = false }: { onStart: () => void; onWorkspace: () => void; signedIn?: boolean }) {
  const sound = useLandingSound();
  const hero = useRef<HTMLElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const artVisible = useInView(art, { margin: '60px' });
  const reduced = useLandingReducedMotion();
  const [paused, setPaused] = useState(false);
  const [sceneStatus, setSceneStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  const practice = useRef<HTMLDivElement>(null);
  const practiceVisible = useInView(practice, { amount: .4 });
  const [turn, setTurn] = useState(0);
  const stepTrack = useRef<HTMLDivElement>(null);
  // Scroll-drawn progress through the three steps (GSAP, loaded only when the steps are near).
  useEffect(() => {
    const track = stepTrack.current;
    if (!track || reduced) return;
    let undo: (() => void) | undefined, cancelled = false;
    const near = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      near.disconnect();
      void loadGsap().then(({ gsap, ScrollTrigger }) => {
        if (cancelled) return;
        const context = gsap.context(() => {
          gsap.fromTo('.c-step-rail i', { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: track, start: 'top 70%', end: 'bottom 60%', scrub: .4 } });
          for (const card of gsap.utils.toArray<HTMLElement>('.c-step-card')) ScrollTrigger.create({ trigger: card, start: 'top 62%', end: 'bottom 62%', toggleClass: 'is-current' });
        }, track);
        undo = () => context.revert();
      });
    }, { rootMargin: '400px 0px' });
    near.observe(track);
    return () => { cancelled = true; near.disconnect(); undo?.(); };
  }, [reduced]);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update(); window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  // Current section for the navigation: the linked section crossing the upper third of the viewport.
  useEffect(() => {
    const targets = navigation.map(([href]) => document.getElementById(href.slice(1))).filter((element): element is HTMLElement => !!element);
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) setSection(entry.target.id);
    }, { rootMargin: '-30% 0px -60% 0px' });
    targets.forEach((target) => observer.observe(target));
    const top = () => { if (window.scrollY < window.innerHeight * .5) setSection(null); };
    window.addEventListener('scroll', top, { passive: true });
    return () => { observer.disconnect(); window.removeEventListener('scroll', top); };
  }, []);
  const menuToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenuOpen(false); menuToggle.current?.focus(); } };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [menuOpen]);
  const panelPointerX = useMotionValue(0);
  const panelPointerY = useMotionValue(0);
  const panelX = useSpring(panelPointerX, timing.pointerSpring);
  const panelY = useSpring(panelPointerY, timing.pointerSpring);
  const sceneEntrance = useAnimationControls();
  useEffect(() => {
    if (reduced || paused) {
      sceneEntrance.stop(); sceneEntrance.set({ opacity: 1, scale: 1, rotate: 0 });
      panelX.stop(); panelY.stop();
      if (reduced) { panelPointerX.jump(0); panelPointerY.jump(0); panelX.jump(0); panelY.jump(0); }
    } else {
      void sceneEntrance.start({ opacity: 1, scale: 1, rotate: 0, transition: { duration: timing.duration.scene, delay: timing.entrance.scene, ease: timing.ease } });
    }
    return () => sceneEntrance.stop();
  }, [reduced, paused, sceneEntrance, panelX, panelY, panelPointerX, panelPointerY]);
  const { scrollYProgress } = useScroll({ target: hero, offset: ['start start', 'end start'] });
  const sceneY = useTransform(scrollYProgress, [0, 1], [0, timing.distance.heroDrift]);
  const sceneScale = useTransform(scrollYProgress, [0, 1], [1, .965]);
  const revealItem = revealVariants(!!reduced);
  // Illustrates the room's turn-taking; runs only while visible and motion is allowed.
  useEffect(() => {
    if (reduced || !practiceVisible) return;
    const timer = setInterval(() => setTurn((value) => (value + 1) % 3), 2200);
    return () => clearInterval(timer);
  }, [reduced, practiceVisible]);
  const reveal = (delay: number) => ({ initial: reduced ? false as const : { opacity: 0, y: timing.distance.reveal }, animate: { opacity: 1, y: 0 }, transition: { duration: reduced ? 0 : timing.duration.reveal, delay: reduced ? 0 : delay, ease: timing.ease } });

  return <div className="cinema" id="top" style={landingMotionStyles} data-motion-policy={reduced ? 'reduced' : 'full'}>
    <a className="c-skip" href="#cinema-main">Skip to content</a>
    <div className="c-sound-control"><button type="button" className="c-sound-toggle" aria-label="Landing sound effects" aria-pressed={sound.enabled} onClick={sound.toggle} title="Optional quiet interface sounds"><span aria-hidden="true">{sound.enabled ? <Volume2Icon size={16} /> : <VolumeXIcon size={16} />}</span>Sound {sound.enabled ? 'on' : 'off'}</button>{sound.unavailable && <span className="c-sound-message" role="status">Sound unavailable. Continue silently or retry.</span>}</div>
    <header className={`c-nav ${menuOpen ? 'is-open' : ''} ${scrolled ? 'is-scrolled' : ''}`}>
      <a className="c-wordmark" href="#top" aria-label="Interview AI home"><Mark /><span>interview<span className="c-wordmark-ai">ai</span></span></a>
      <nav aria-label="Landing navigation">{navigation.map(([href, label]) => <a key={href} href={href} aria-current={section === href.slice(1) ? 'location' : undefined}>{label}</a>)}</nav>
      <div className="c-nav-actions"><Button variant="ghost" onClick={onWorkspace}>{signedIn ? 'Workspace' : 'Sign in'}</Button><Button className="c-nav-cta" onClick={onStart}>Start practicing <ArrowRightIcon size={14} /></Button></div>
      <button ref={menuToggle} type="button" className="c-menu-toggle" aria-expanded={menuOpen} aria-controls="c-mobile-menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen((open) => !open)}><span aria-hidden="true" /><span aria-hidden="true" /></button>
    </header>
    <AnimatePresence>{menuOpen && <motion.div className="c-mobile-menu" id="c-mobile-menu" initial={reduced ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -8 }} transition={{ duration: reduced ? 0 : timing.duration.swap, ease: timing.ease }}>
      <nav aria-label="Mobile navigation">{navigation.map(([href, label]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}<ArrowRightIcon size={16} /></a>)}</nav>
      <Button className="c-primary" onClick={() => { setMenuOpen(false); onStart(); }}>Start your interview <ArrowRightIcon size={16} /></Button>
      <Button variant="secondary" onClick={() => { setMenuOpen(false); onWorkspace(); }}>{signedIn ? 'Open your workspace' : 'Sign in to your workspace'}</Button>
    </motion.div>}</AnimatePresence>

    <main id="cinema-main" tabIndex={-1}>
      <section className="c-hero c-container" ref={hero} aria-labelledby="c-hero-title">
        <div className="c-hero-copy">
          <motion.p className="c-eyebrow c-hero-eyebrow" {...reveal(timing.entrance.eyebrow)}><span className="c-signal" /> AI MOCK INTERVIEW STUDIO</motion.p>
          <h1 id="c-hero-title"><motion.span {...reveal(timing.entrance.headline)}>Interview practice</motion.span><motion.span className="c-heading-soft" {...reveal(timing.entrance.headlineEnd)}>that feels real.</motion.span></h1>
          <motion.p className="c-hero-description" {...reveal(timing.entrance.copy)}>Speak with a lifelike AI interviewer that adapts to your skills, challenges your thinking, and helps you improve with every answer.</motion.p>
          <motion.div className="c-hero-actions" initial={reduced ? false : { opacity: .72 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : timing.duration.swap, delay: reduced ? 0 : timing.entrance.action, ease: timing.ease }}><Button className="c-primary" onClick={onStart}>Start Your Interview <ArrowRightIcon size={17} /></Button><a className="c-text-link" href="#how-it-works">Explore the Platform <span aria-hidden="true">↘</span></a></motion.div>
          <motion.p className="c-hero-descriptor" {...reveal(timing.entrance.descriptor)}><span>Realistic voice conversation</span><i aria-hidden="true">·</i><span>Adaptive questions</span><i aria-hidden="true">·</i><span>Actionable feedback</span></motion.p>
        </div>
        <motion.div ref={art} className="c-hero-art" data-motion={paused || reduced || !artVisible || sceneStatus !== 'ready' ? 'still' : 'active'} style={{ y: reduced || paused ? 0 : sceneY, scale: reduced || paused ? 1 : sceneScale }} onPointerMove={(event) => {
          if (reduced || paused || event.pointerType !== 'mouse') return;
          const bounds = event.currentTarget.getBoundingClientRect();
          panelPointerX.set(((event.clientX - bounds.left) / bounds.width - .5) * 18);
          panelPointerY.set(((event.clientY - bounds.top) / bounds.height - .5) * 12);
        }} onPointerLeave={() => { if (!paused && !reduced) { panelPointerX.set(0); panelPointerY.set(0); } }}>
          <motion.div className="c-hero-atmosphere" aria-hidden="true" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : timing.duration.atmosphere, ease: timing.ease }} />
          <div className="c-light-stage" aria-hidden="true"><i /><i /><span /></div>
          <motion.div className="c-core-entrance" initial={reduced ? false : { opacity: 0, scale: .92, rotate: -4 }} animate={sceneEntrance}>
            <BlenderAssetScene variant="hero" paused={paused} onStatusChange={setSceneStatus} />
          </motion.div>
          <motion.div className="c-hero-glass c-voice-glass" aria-hidden="true" style={{ x: panelX, y: panelY }} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : timing.duration.reveal, delay: reduced ? 0 : timing.entrance.followUp, ease: timing.ease }}>
            <div className="c-glass-label"><MicIcon size={13} /><span>AN ADAPTIVE FOLLOW-UP</span></div>
            <div className="c-hero-waveform">{Array.from({ length: 25 }, (_, index) => <i key={index} style={{ height: `${8 + Math.sin(index * .59) ** 2 * 24}px`, animationDelay: `${index * -.09}s` }} />)}</div>
            <p>“What shaped that decision?”</p>
          </motion.div>
          <div className="c-scene-disclosure">CONCEPT VISUAL · WAVEFORM IS ILLUSTRATIVE</div>
          <div className="c-art-bottom"><button type="button" aria-pressed={paused || !!reduced} disabled={!!reduced || sceneStatus !== 'ready'} onClick={() => setPaused((value) => !value)} aria-label={sceneStatus === 'fallback' ? 'Static visual' : reduced ? 'Motion reduced' : paused ? 'Resume scene motion' : 'Pause scene motion'}><span aria-hidden="true">{paused || reduced ? '▷' : 'Ⅱ'}</span> {sceneStatus === 'fallback' ? 'Static visual' : sceneStatus === 'loading' ? 'Loading visual' : reduced ? 'Reduced motion' : paused ? 'Resume motion' : 'Pause motion'}</button></div>
        </motion.div>
        <div className="c-hero-index"><span className="c-editorial-index"><b>01</b> UNDERSTAND <i /> <b>02</b> ADAPT <i /> <b>03</b> DEVELOP</span><a href="#how-it-works">SCROLL TO EXPLORE <span aria-hidden="true">↓</span></a></div>
      </section>

      <section className="c-steps c-container" id="how-it-works" aria-labelledby="c-steps-title">
        <Reveal className="c-section-intro"><p className="c-eyebrow">HOW IT WORKS</p><div><h2 id="c-steps-title">Three steps.<br /><span>One realistic interview.</span></h2><p>Each step below is part of the current product, not a roadmap.</p></div></Reveal>
        <div className="c-step-track" ref={stepTrack}><span className="c-step-rail" aria-hidden="true"><i /></span>
        <ol className="c-step-list">
          <li><Reveal className="c-step-card c-step-choose">
            <div className="c-step-copy"><div className="c-step-meta"><span className="c-step-number">01</span><span className="c-available">Available now</span></div><h3>Choose an interview type</h3><p>Upload a PDF or DOCX resume, or start from a role preset. Confirm the suggested direction, add a job description if you have one, then choose the interview and its length.</p></div>
            <div className="c-step-visual" aria-hidden="true">
              <span className="c-preview-example">OPTIONS ON THE SETUP SCREEN</span>
              <Reveal className="c-type-list" stagger>{interviewTypes.map((type) => <motion.div variants={revealItem} key={type.label} className="c-type"><div><strong>{type.label}</strong><small>{type.detail}</small></div></motion.div>)}</Reveal>
              <p className="c-role-list"><span>Role presets</span>{roles.join(' · ')}</p>
            </div>
          </Reveal></li>
          <li><Reveal className="c-step-card c-step-practice">
            <div className="c-step-copy"><div className="c-step-meta"><span className="c-step-number">02</span><span className="c-available">Available now</span></div><h3>Practice with the AI interviewer</h3><p>A digital interviewer asks each question aloud with lip movement synchronized to the audio, then listens. Follow-up questions adapt to the evidence in your answers.</p></div>
            <div className="c-step-visual" aria-hidden="true" ref={practice}>
              <span className={`c-portrait ${turn === 0 ? 'is-speaking' : ''}`} />
              <div className="c-practice-states">{['Interviewer speaking', 'Listening', 'Evaluating'].map((label, index) => <span key={label} className={turn === index ? 'is-on' : ''}>{label}</span>)}</div>
              <p className="c-practice-question">“Walk me through a technical decision you made recently.”</p>
              <span className="c-preview-example">ILLUSTRATIVE QUESTION</span>
            </div>
          </Reveal></li>
          <li><Reveal className="c-step-card c-step-review">
            <div className="c-step-copy"><div className="c-step-meta"><span className="c-step-number">03</span><span className="c-available">Available now</span></div><h3>Review feedback and improve</h3><p>See skill-level scores, strengths and gaps linked to what you actually said, then follow a prioritized plan. Every completed interview is saved so you can track progress.</p></div>
            <div className="c-step-visual" aria-hidden="true">
              <span className="c-preview-example">EXAMPLE DATA</span>
              {([['Backend fundamentals', 80], ['Problem-solving', 65], ['Explanation clarity', 75]] as const).map(([name, value]) => <div key={name} className="c-review-bar"><span>{name}<b>{(value / 10).toFixed(1)}</b></span><motion.i initial={reduced ? 'visible' : 'hidden'} whileInView="visible" viewport={{ once: true, amount: .8 }}><motion.em style={{ width: `${value}%`, originX: 0 }} variants={{ hidden: { scaleX: 0 }, visible: { scaleX: 1, transition: { duration: reduced ? 0 : .9, ease: timing.ease } } }} /></motion.i></div>)}
              <div className="c-review-next"><TargetIcon size={14} /> Next practice: explain how concurrent retries are prevented.</div>
            </div>
          </Reveal></li>
        </ol></div>
        <div className="c-steps-cta"><Button onClick={onStart}>Set up an interview <ArrowRightIcon size={16} /></Button></div>
      </section>

      <LandingFilm onStart={onStart} />

      <section className="c-capabilities c-container" id="capabilities" aria-labelledby="c-capabilities-title">
        <Reveal className="c-capabilities-intro"><p className="c-eyebrow">FEATURES</p><h2 id="c-capabilities-title">Built like a real interview.<br /><span>Designed to help you improve.</span></h2></Reveal>
        <Reveal className="c-capability-grid" stagger>{features.map(({ title, description, icon: FeatureIcon }, index) => <motion.article key={title} variants={revealItem}><div className="c-capability-head"><span className="c-capability-icon"><FeatureIcon size={18} /></span><span>0{index + 1}</span></div><h3>{title}</h3><p>{description}</p></motion.article>)}</Reveal>
        <p className="c-availability"><span>Availability</span> All four features are implemented in this build. Feedback is written by a configured AI provider; without one, practice runs in a clearly labeled deterministic demo mode. Lip-synchronized interviewer audio uses the Windows speech service; other systems fall back to the browser voice without lip sync.</p>
      </section>

      <section className="c-method" id="approach" aria-labelledby="c-method-title"><motion.div className="c-section-atmosphere" aria-hidden="true" initial={reduced ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: .1 }} transition={{ duration: reduced ? 0 : timing.duration.atmosphere, ease: timing.ease }} /><div className="c-container">
        <Reveal><p className="c-eyebrow">ABOUT THE METHOD</p><h2 id="c-method-title">Structure sets the stage.<br /><span>Your thinking leads the way.</span></h2></Reveal>
        <AdaptivePreview onSelection={() => { void sound.play('transition'); }} />
      </div></section>

      <section className="c-room-section c-container" id="interview-room" aria-labelledby="c-room-title">
        <Reveal className="c-section-intro"><p className="c-eyebrow">INSIDE THE INTERVIEW ROOM</p><div><h2 id="c-room-title">Less interface.<br /><span>More conversation.</span></h2><p>A focused room for your interview. Your voice, your thinking, and a question worth exploring.</p></div></Reveal>
        <RoomPreview />
      </section>

      <section className="c-development c-container" id="intelligence-report" aria-labelledby="c-development-title">
        <Reveal className="c-development-copy"><p className="c-eyebrow">AFTER THE CONVERSATION</p><h2 id="c-development-title">See your potential.<br /><span>Know your next move.</span></h2><p>A useful assessment shows its working. Revisit your answers, understand what they demonstrated and see where focused practice can make a difference.</p><a className="c-text-link" href="#start">Make your next move <ArrowRightIcon size={16} /></a></Reveal>
        <Reveal className="c-evidence-stack" stagger><div className="c-evidence-head"><span className="c-crosshair" /> THE DEVELOPMENT LOOP</div><motion.article variants={revealItem}><span>01</span><div><h3>Evidence, in context.</h3><p>Question-by-question feedback linked to what you actually said.</p></div><FileTextIcon size={20} /></motion.article><motion.article variants={revealItem}><span>02</span><div><h3>Priorities, made clear.</h3><p>Demonstrated strengths and gaps, organized by relevant skills.</p></div><TargetIcon size={20} /></motion.article><motion.article variants={revealItem}><span>03</span><div><h3>Practice, with purpose.</h3><p>Learning sequences, exercises and checkpoints to guide your next step.</p></div><ArrowRightIcon size={20} /></motion.article><div className="c-evidence-end">YOUR ANSWERS <span>→</span> YOUR EVIDENCE <span>→</span> YOUR DIRECTION</div></Reveal>
      </section>

      <div className="c-container c-report-section"><ReportPreview /></div>

      <section className="c-close" id="start" aria-labelledby="c-close-title"><motion.div className="c-close-halo" aria-hidden="true" initial={reduced ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: .1 }} transition={{ duration: reduced ? 0 : timing.duration.atmosphere, ease: timing.ease }} /><Reveal><div className="c-closing-sculpture" aria-hidden="true"><i /><i /><i /><span /></div><p className="c-eyebrow">THE NEXT CHAPTER IS YOURS.</p><h2 id="c-close-title">Walk into your next<br /><span>interview prepared.</span></h2><p>Bring your experience. Find your words.<br />Take the next step with a clearer direction.</p><Button className="c-primary" onClick={onStart}>Start Practicing <ArrowRightIcon size={17} /></Button></Reveal></section>
    </main>
    <footer className="c-footer c-container">
      <div className="c-footer-brand"><a href="#top" className="c-wordmark" aria-label="Interview AI home"><Mark small /><span>interview<span className="c-wordmark-ai">ai</span></span></a><p>Realistic, voice-first interview practice with an AI interviewer.</p></div>
      <nav className="c-footer-groups" aria-label="Footer">
        <div><span>Product</span><a href="#how-it-works">How it works</a><a href="#capabilities">Features</a><a href="#interview-room">Interview room</a><a href="#intelligence-report">Feedback report</a></div>
        <div><span>About</span><a href="#approach">The method</a><a href="#top">Back to top</a></div>
        <div><span>Account</span><button type="button" onClick={onWorkspace}>{signedIn ? 'Open your workspace' : 'Sign in to your workspace'} <ArrowRightIcon size={14} /></button><button type="button" onClick={onStart}>Begin an interview <ArrowRightIcon size={14} /></button></div>
      </nav>
      <p className="c-provider-note">Interview AI · AI mock interview practice. Deterministic practice mode is available when no AI provider is configured. Voice recognition and playback depend on your browser and speech-service availability. The 3D interviewer is a visual representation.</p>
    </footer>
  </div>;
}
