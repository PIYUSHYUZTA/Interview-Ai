import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useScroll, useTransform, useMotionValue, useSpring, useInView, useAnimationControls } from 'motion/react';
import { ArrowRightIcon, FileTextIcon, MicIcon, TargetIcon, Volume2Icon, VolumeXIcon } from './Icons';
import { AdaptivePreview, RoomPreview, ReportPreview, VoiceWave } from './LandingProductPreviews';
import { InterviewerVisual } from './InterviewerVisual';
import { BlenderAssetScene } from './BlenderAssetScene';
import { LandingReveal as Reveal } from './LandingReveal';
import { landingMotion as timing, landingMotionStyles, revealVariants, useLandingReducedMotion } from './landing-motion';
import { Button } from './ui';
import { useLandingSound } from './useLandingSound';
import './LandingPage.css';

const chapters = [
  { name: 'Upload your resume', label: '01 / UNDERSTAND', title: 'The starting point is you.', hint: 'Your experience, connected.', description: 'Upload a PDF or DOCX resume. Your skills, projects and experience inform the interview direction. A target job description is optional.', icon: FileTextIcon },
  { name: 'Meet your AI interviewer', label: '02 / PREPARE', title: 'Step into the conversation.', hint: 'A room built for focus.', description: 'Confirm your interview direction and check your devices. Enter a dedicated interview room, with your question and camera preview in view.', icon: TargetIcon },
  { name: 'Answer through voice', label: '03 / ADAPT', title: 'A follow-up with a reason.', hint: 'Your answers set the direction.', description: 'Hear the question, explain your thinking and review your transcript. Supported speech services turn your response into evidence for the next adaptive question.', icon: MicIcon },
  { name: 'Explore your intelligence', label: '04 / REFLECT', title: 'Understand the evidence.', hint: 'Feedback with context.', description: 'Review skill-level assessments, demonstrated strengths and areas to improve. Feedback connects to the answers you actually gave.', icon: FileTextIcon },
  { name: 'Improve and practice again', label: '05 / DEVELOP', title: 'Make your next step clear.', hint: 'A practical way forward.', description: 'Follow a prioritized improvement roadmap with focused exercises and checkpoints. Return for another interview when you are ready to practice again.', icon: TargetIcon },
];

function Mark({ small = false }: { small?: boolean }) {
  return <span className={`c-mark ${small ? 'c-mark-small' : ''}`} aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M16 3 28 10v12L16 29 4 22V10L16 3Z" stroke="currentColor" strokeWidth="1.4" /><path d="m4 10 12 7 12-7M16 17v12M16 3v8m-6 3 6-3 6 3" stroke="currentColor" strokeWidth="1.4" /></svg></span>;
}

export function LandingPage({ onStart, onWorkspace }: { onStart: () => void; onWorkspace: () => void }) {
  const sound = useLandingSound();
  const selectChapter = (index: number) => { if (index !== chapter) { void sound.play('transition'); setChapter(index); } };
  const hero = useRef<HTMLElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const artVisible = useInView(art, { margin: '60px' });
  const reduced = useLandingReducedMotion();
  const [paused, setPaused] = useState(false);
  const [sceneStatus, setSceneStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [chapter, setChapter] = useState(0);
  const panelPointerX = useMotionValue(0);
  const panelPointerY = useMotionValue(0);
  const panelX = useSpring(panelPointerX, timing.pointerSpring);
  const panelY = useSpring(panelPointerY, timing.pointerSpring);
  const backPanelX = useTransform(panelX, (value) => -value * .65);
  const backPanelY = useTransform(panelY, (value) => -value * .65);
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
  const active = chapters[chapter];
  const ChapterIcon = active.icon;
  const reveal = (delay: number) => ({ initial: reduced ? false as const : { opacity: 0, y: timing.distance.reveal }, animate: { opacity: 1, y: 0 }, transition: { duration: reduced ? 0 : timing.duration.reveal, delay: reduced ? 0 : delay, ease: timing.ease } });

  return <div className="cinema" id="top" style={landingMotionStyles} data-motion-policy={reduced ? 'reduced' : 'full'}>
    <a className="c-skip" href="#cinema-main">Skip to content</a>
    <div className="c-sound-control"><button type="button" className="c-sound-toggle" aria-label="Landing sound effects" aria-pressed={sound.enabled} onClick={sound.toggle} title="Optional quiet interface sounds"><span aria-hidden="true">{sound.enabled ? <Volume2Icon size={16} /> : <VolumeXIcon size={16} />}</span>Sound {sound.enabled ? 'on' : 'off'}</button>{sound.unavailable && <span className="c-sound-message" role="status">Sound unavailable. Continue silently or retry.</span>}</div>
    <header className="c-nav">
      <a className="c-wordmark" href="#top" aria-label="Interview AI home"><Mark /><span>interview<span className="c-wordmark-ai">ai</span></span></a>
      <nav aria-label="Landing navigation"><a href="#features">Experience</a><a href="#approach">Our approach</a></nav>
      <div className="c-nav-actions"><Button variant="ghost" onClick={onWorkspace}>Workspace</Button><Button className="c-nav-cta" onClick={onStart}>Start practicing <ArrowRightIcon size={14} /></Button></div>
    </header>

    <main id="cinema-main" tabIndex={-1}>
      <section className="c-hero c-container" ref={hero} aria-labelledby="c-hero-title">
        <div className="c-hero-copy">
          <motion.p className="c-eyebrow c-hero-eyebrow" {...reveal(timing.entrance.eyebrow)}><span className="c-signal" /> THE INTERVIEW PRACTICE STUDIO</motion.p>
          <h1 id="c-hero-title"><motion.span {...reveal(timing.entrance.headline)}>Your next interview.</motion.span><motion.span className="c-heading-soft" {...reveal(timing.entrance.headlineEnd)}>Your unfair advantage.</motion.span></h1>
          <motion.p className="c-hero-description" {...reveal(timing.entrance.copy)}>Practice with an AI interviewer that adapts to your skills, challenges your thinking, and helps you improve with every answer.</motion.p>
          <motion.div className="c-hero-actions" initial={reduced ? false : { opacity: .72 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : timing.duration.swap, delay: reduced ? 0 : timing.entrance.action, ease: timing.ease }}><Button className="c-primary" onClick={onStart}>Start Your Interview <ArrowRightIcon size={17} /></Button><a className="c-text-link" href="#features">Explore the Experience <span aria-hidden="true">↘</span></a></motion.div>
          <motion.p className="c-hero-descriptor" {...reveal(timing.entrance.descriptor)}><span>Resume-aware practice</span><i aria-hidden="true">·</i><span>Adaptive questions</span><i aria-hidden="true">·</i><span>Actionable feedback</span></motion.p>
        </div>
        <motion.div ref={art} className="c-hero-art" data-motion={paused || reduced || !artVisible || sceneStatus !== 'ready' ? 'still' : 'active'} style={{ y: reduced || paused ? 0 : sceneY, scale: reduced || paused ? 1 : sceneScale }} onPointerMove={(event) => {
          if (reduced || paused || event.pointerType !== 'mouse') return;
          const bounds = event.currentTarget.getBoundingClientRect();
          panelPointerX.set(((event.clientX - bounds.left) / bounds.width - .5) * 18);
          panelPointerY.set(((event.clientY - bounds.top) / bounds.height - .5) * 12);
        }} onPointerLeave={() => { if (!paused && !reduced) { panelPointerX.set(0); panelPointerY.set(0); } }}>
          <motion.div className="c-hero-atmosphere" aria-hidden="true" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : timing.duration.atmosphere, ease: timing.ease }} />
          <div className="c-light-stage" aria-hidden="true"><i /><i /><span /></div>
          <motion.div className="c-art-caption" {...reveal(timing.entrance.descriptor)}><span className="c-crosshair" /> THE INTELLIGENCE CORE <span>01 / 03</span></motion.div>
          <motion.div className="c-core-entrance" initial={reduced ? false : { opacity: 0, scale: .92, rotate: -4 }} animate={sceneEntrance}>
            <BlenderAssetScene variant="core" paused={paused} onStatusChange={setSceneStatus} />
          </motion.div>
          <svg className="c-hero-connections" viewBox="0 0 640 640" fill="none" aria-hidden="true"><path d="M110 159H195L272 245" /><path d="M512 420H456L389 358" /><circle cx="272" cy="245" r="3" /><circle cx="389" cy="358" r="3" /><path className="c-orbital-guide" d="M67 322a253 183 -25 1 0 500 -66" strokeDasharray="2 10" /></svg>
          <motion.div className="c-hero-glass c-context-glass" aria-hidden="true" style={{ x: backPanelX, y: backPanelY }} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : timing.duration.reveal, delay: reduced ? 0 : timing.entrance.panel, ease: timing.ease }}>
            <div className="c-glass-label"><FileTextIcon size={13} /><span>CANDIDATE CONTEXT</span><i /></div>
            <strong>Your experience,<br />connected.</strong>
            <div className="c-context-row"><span>Skills &amp; tools</span><span>↗</span></div><div className="c-context-row"><span>Projects &amp; experience</span><span>↗</span></div><div className="c-context-route"><i /> SKILL EVIDENCE → INTERVIEW PLAN</div>
          </motion.div>
          <motion.div className="c-hero-glass c-voice-glass" aria-hidden="true" style={{ x: panelX, y: panelY }} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : timing.duration.reveal, delay: reduced ? 0 : timing.entrance.followUp, ease: timing.ease }}>
            <div className="c-glass-label"><MicIcon size={13} /><span>THE CONVERSATION</span><i /></div>
            <div className="c-hero-waveform">{Array.from({ length: 25 }, (_, index) => <i key={index} style={{ height: `${8 + Math.sin(index * .59) ** 2 * 24}px`, animationDelay: `${index * -.09}s` }} />)}</div>
            <p>“What shaped<br />that decision?”</p><div className="c-voice-route">YOUR ANSWER <span>→</span> A DEEPER QUESTION</div>
          </motion.div>
          <div className="c-scene-disclosure">CONCEPT VISUAL · WAVEFORM IS ILLUSTRATIVE</div>
          <div className="c-art-bottom"><span>UNDERSTAND <i /> ADAPT <i /> DEVELOP</span><button type="button" aria-pressed={paused || !!reduced} disabled={!!reduced || sceneStatus !== 'ready'} onClick={() => setPaused((value) => !value)} aria-label={sceneStatus === 'fallback' ? 'Static visual' : reduced ? 'Motion reduced' : paused ? 'Resume scene motion' : 'Pause scene motion'}><span aria-hidden="true">{paused || reduced ? '▷' : 'Ⅱ'}</span> {sceneStatus === 'fallback' ? 'Static visual' : sceneStatus === 'loading' ? 'Loading visual' : reduced ? 'Reduced motion' : paused ? 'Resume motion' : 'Pause motion'}</button></div>
        </motion.div>
        <div className="c-hero-index"><span className="c-editorial-index"><b>01</b> UNDERSTAND <i /> <b>02</b> ADAPT <i /> <b>03</b> DEVELOP</span><a href="#features">SCROLL TO EXPLORE <span aria-hidden="true">↓</span></a></div>
      </section>

      <div className="c-principles"><Reveal className="c-container" stagger><motion.span variants={revealItem}><FileTextIcon size={16} /> Grounded in your experience</motion.span><motion.span variants={revealItem}><MicIcon size={16} /> A conversation that adapts</motion.span><motion.span variants={revealItem}><TargetIcon size={16} /> Progress backed by evidence</motion.span></Reveal></div>

      <section className="c-experience c-container" id="features" aria-labelledby="c-experience-title">
        <Reveal className="c-section-intro"><p className="c-eyebrow">01 / A MORE PERSONAL KIND OF PRACTICE</p><div><h2 id="c-experience-title">A conversation shaped by you.<br /><span>A clearer way forward.</span></h2><p>Your background is the starting point. Your answers decide where the conversation goes.</p></div></Reveal>
        <Reveal className="c-product-stage">
          <div className="c-chapter-list" role="tablist" aria-label="Explore the interview experience" aria-orientation="vertical">{chapters.map((item, index) => <button type="button" role="tab" id={`c-tab-${index}`} aria-controls="c-chapter-panel" aria-selected={chapter === index} tabIndex={chapter === index ? 0 : -1} key={item.name} className={chapter === index ? 'is-selected' : ''} onClick={() => selectChapter(index)} onKeyDown={(event) => { if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? chapters.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + chapters.length) % chapters.length; selectChapter(next); document.getElementById(`c-tab-${next}`)?.focus(); } }}><span>0{index+1}</span><div>{item.name}<small>{item.hint}</small></div><ArrowRightIcon size={17} /></button>)}</div>
          <div className="c-chapter-panel" id="c-chapter-panel" role="tabpanel" aria-labelledby={`c-tab-${chapter}`} tabIndex={0}>
            <div className="c-panel-top"><span><ChapterIcon size={15} /> {active.label}</span><span>EXPERIENCE PREVIEW</span></div>
            <AnimatePresence mode="wait" initial={false}><motion.div key={chapter} initial={reduced ? false : { opacity: 0, y: timing.distance.swap }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -timing.distance.swap }} transition={{ duration: reduced ? 0 : timing.duration.swap, ease: timing.ease }}>
              <div className={`c-preview-art c-preview-${chapter}`} aria-hidden="true">{chapter === 0 ? <><div className="c-resume-sheet"><div className="c-sheet-avatar" /><div className="c-sheet-name" /><div className="c-sheet-rule" /><span /><span /><span /><div className="c-sheet-tags"><i>SKILLS</i><i>PROJECTS</i><i>EXPERIENCE</i></div><span /><span /></div><div className="c-document-orbit" /><div className="c-extraction-note"><span className="c-signal" /> YOUR EXPERIENCE, CONNECTED</div></> : chapter === 1 ? <><InterviewerVisual size={100} state="idle" /><div className="c-preview-question">A conversation.<br />Built around your experience.</div></> : chapter === 2 ? <><div className="c-voice-icon"><Mark /></div><div className="c-waveform">{Array.from({length:39},(_,index)=><i key={index} style={{height:`${10+Math.abs(Math.sin(index*.68))*28+Math.sin(index*.24)**2*20}px`}} />)}</div><div className="c-preview-question">“What would you change<br />if traffic doubled?”</div><span className="c-preview-example">ILLUSTRATIVE FOLLOW-UP · NOT A LIVE SESSION</span></> : chapter === 3 ? <div className="c-journey-insight"><span className="c-step">FROM ANSWERS TO INSIGHT</span><strong>Evidence → Feedback → Focus</strong><VoiceWave compact /><span className="c-preview-example">PRODUCT CONCEPT · NOT AN ASSESSMENT</span></div> : <><div className="c-roadmap-line" /><div className="c-roadmap-node"><i /><span>01 / YOUR EVIDENCE</span><strong>Understand the gap.</strong></div><div className="c-roadmap-node"><i /><span>02 / YOUR PRIORITY</span><strong>Focus your practice.</strong></div><div className="c-roadmap-node"><i /><span>03 / YOUR NEXT STEP</span><strong>Put it into action.</strong></div></>}</div>
              <div className="c-panel-copy"><h3>{active.title}</h3><p>{active.description}</p></div>
            </motion.div></AnimatePresence>
          </div>
        </Reveal>
      </section>

      <section className="c-resume-intelligence c-container" id="resume-intelligence" aria-labelledby="c-resume-title">
        <Reveal className="c-resume-narrative"><p className="c-eyebrow">YOUR EXPERIENCE / THE STARTING POINT</p><h2 id="c-resume-title">More than a resume.<br /><span>A direction for the conversation.</span></h2><p>Your projects, tools and experience shape what gets explored. Confirm the detected direction, or add a target job description for a specific opportunity.</p><Button variant="ghost" onClick={onStart}>Bring your experience <ArrowRightIcon size={16} /></Button></Reveal>
        <Reveal className="c-context-map" stagger><div className="c-map-heading"><FileTextIcon size={16} /><span>FROM CONTEXT TO CONVERSATION</span></div>{[
          ['01', 'Your background', 'Skills, projects and practical experience from your PDF or DOCX resume.'],
          ['02', 'Your direction', 'A suggested role to confirm, with an optional target job description.'],
          ['03', 'Your interview', 'A relevant plan, refined by the evidence in each answer.'],
        ].map(([number, title, description]) => <motion.article key={number} variants={revealItem}><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></motion.article>)}<p className="c-map-note">PRODUCT WORKFLOW · NO PERSONAL DATA SHOWN</p></Reveal>
      </section>

      <section className="c-method" id="approach" aria-labelledby="c-method-title"><motion.div className="c-section-atmosphere" aria-hidden="true" initial={reduced ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: .1 }} transition={{ duration: reduced ? 0 : timing.duration.atmosphere, ease: timing.ease }} /><div className="c-container">
        <Reveal><p className="c-eyebrow">02 / INTELLIGENCE WITH INTENTION</p><h2 id="c-method-title">Structure sets the stage.<br /><span>Your thinking leads the way.</span></h2></Reveal>
        <AdaptivePreview onSelection={() => { void sound.play('transition'); }} />
      </div></section>

      <section className="c-room-section c-container" id="interview-room" aria-labelledby="c-room-title">
        <Reveal className="c-section-intro"><p className="c-eyebrow">03 / SPACE TO THINK OUT LOUD</p><div><h2 id="c-room-title">Less interface.<br /><span>More conversation.</span></h2><p>A focused room for your interview. Your voice, your thinking, and a question worth exploring.</p></div></Reveal>
        <RoomPreview />
      </section>

      <section className="c-development c-container" id="intelligence-report" aria-labelledby="c-development-title">
        <Reveal className="c-development-copy"><p className="c-eyebrow">04 / AFTER THE CONVERSATION</p><h2 id="c-development-title">See your potential.<br /><span>Know your next move.</span></h2><p>A useful assessment shows its working. Revisit your answers, understand what they demonstrated and see where focused practice can make a difference.</p><a className="c-text-link" href="#start">Make your next move <ArrowRightIcon size={16} /></a></Reveal>
        <Reveal className="c-evidence-stack" stagger><div className="c-evidence-head"><span className="c-crosshair" /> THE DEVELOPMENT LOOP</div><motion.article variants={revealItem}><span>01</span><div><h3>Evidence, in context.</h3><p>Question-by-question feedback linked to what you actually said.</p></div><FileTextIcon size={20} /></motion.article><motion.article variants={revealItem}><span>02</span><div><h3>Priorities, made clear.</h3><p>Demonstrated strengths and gaps, organized by relevant skills.</p></div><TargetIcon size={20} /></motion.article><motion.article variants={revealItem}><span>03</span><div><h3>Practice, with purpose.</h3><p>Learning sequences, exercises and checkpoints to guide your next step.</p></div><ArrowRightIcon size={20} /></motion.article><div className="c-evidence-end">YOUR ANSWERS <span>→</span> YOUR EVIDENCE <span>→</span> YOUR DIRECTION</div></Reveal>
      </section>

      <div className="c-container c-report-section"><ReportPreview /></div>

      <section className="c-close" id="start" aria-labelledby="c-close-title"><motion.div className="c-close-halo" aria-hidden="true" initial={reduced ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: .1 }} transition={{ duration: reduced ? 0 : timing.duration.atmosphere, ease: timing.ease }} /><Reveal><div className="c-closing-sculpture" aria-hidden="true"><i /><i /><i /><span /></div><p className="c-eyebrow">THE NEXT CHAPTER IS YOURS.</p><h2 id="c-close-title">Walk into your next<br /><span>interview prepared.</span></h2><p>Bring your experience. Find your words.<br />Take the next step with a clearer direction.</p><Button className="c-primary" onClick={onStart}>Start Practicing <ArrowRightIcon size={17} /></Button></Reveal></section>
    </main>
    <footer className="c-footer c-container"><div><a href="#top" className="c-wordmark" aria-label="Interview AI home"><Mark small /><span>interview<span className="c-wordmark-ai">ai</span></span></a><p>Preparation for what’s next.</p></div><div className="c-footer-links"><a href="#features">Experience</a><a href="#approach">Approach</a><a href="#resume-intelligence">Resume intelligence</a><a href="#interview-room">Interview room</a><a href="#intelligence-report">Report</a><button type="button" onClick={onWorkspace}>Open your workspace <ArrowRightIcon size={14} /></button></div><p className="c-provider-note">Deterministic practice mode is available. Voice recognition and playback depend on your browser and speech-service availability. The 3D core is a visual representation.</p></footer>
  </div>;
}
