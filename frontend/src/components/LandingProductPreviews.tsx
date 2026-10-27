import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { LandingReveal as Reveal } from './LandingReveal';
import { landingMotion, useLandingReducedMotion } from './landing-motion';
import { Meter } from './ui';
import { Icon } from './icon/Icon';
import { ArrowRight, Mic, Video } from './icon/icons';

const paths = {
  strong: { label: 'Strong answer', answer: '“Retries can create duplicate payments. I would use an idempotency key to identify the same request.”', decision: 'Explore the implementation', level: 'INTERMEDIATE → ADVANCED', question: 'How would you enforce idempotency when two identical requests arrive at the same time?', next: 'With continued strong evidence, explore distributed failures and trade-offs.', steps: ['Foundation', 'Implementation', 'Distributed trade-offs'] },
  partial: { label: 'Partial answer', answer: '“I would attach a unique key to each payment, but I am unsure how retries use it.”', decision: 'Clarify the missing concept', level: 'TARGETED FOLLOW-UP', question: 'What should the server return when it receives the same idempotency key again?', next: 'Clarify request identity before moving to a more complex scenario.', steps: ['Foundation', 'Clarify retry behavior', 'Reassess understanding'] },
  weak: { label: 'Weak answer', answer: '“I would retry the payment until it succeeds. I am not sure why that could create a duplicate.”', decision: 'Revisit the foundation', level: 'FOUNDATIONAL', question: 'If a payment succeeds but its response is lost, what could happen when the client sends it again?', next: 'Use a concrete example to investigate the missing fundamental.', steps: ['Foundation', 'Simpler scenario', 'Build understanding'] },
};

/** Curated marketing examples, never used by the interview engine. */
export function AdaptivePreview({ onSelection }: { onSelection?: () => void }) {
  const [path, setPath] = useState<keyof typeof paths>('strong');
  const reduced = useLandingReducedMotion();
  const selected = paths[path];
  return <Reveal className="c-adaptive-demo">
    <div className="c-demo-caption"><span>AN ILLUSTRATIVE BACKEND INTERVIEW</span><span>TRY A RESPONSE PATH</span></div>
    <div className="c-adaptive-grid">
      <div className="c-adaptive-input"><span className="c-step">START WITH A FOUNDATION</span><h3>Why can retrying a payment create duplicates?</h3><p>The same starting point. A different conversation, depending on the answer.</p>
        <div className="c-path-options" role="group" aria-label="Example answer quality">{(Object.keys(paths) as (keyof typeof paths)[]).map(key => <button type="button" key={key} aria-pressed={path === key} onClick={() => { if (path !== key) { onSelection?.(); setPath(key); } }}>{paths[key].label}</button>)}</div>
        <blockquote>{selected.answer}</blockquote>
      </div>
      <div className="c-adaptive-output" aria-live="polite" aria-atomic="true"><AnimatePresence mode="wait" initial={false}><motion.div key={path} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : landingMotion.duration.swap, ease: landingMotion.ease }}>
        <span className="c-step">{selected.level}</span><p className="c-decision">{selected.decision}</p><h3>{selected.question}</h3><p>{selected.next}</p><ol className="c-adaptive-route">{selected.steps.map((step, index) => <li key={step}><span>0{index + 1}</span>{step}</li>)}</ol>
      </motion.div></AnimatePresence></div>
    </div><p className="c-example-note">Illustrative response paths, not a live assessment. In your interview, the backend combines your resume, interview plan, answer evaluations and rolling skill state to choose each follow-up.</p>
  </Reveal>;
}

export function VoiceWave({ compact = false }: { compact?: boolean }) {
  return <div className={`c-demo-wave ${compact ? 'c-demo-wave-small' : ''}`} aria-hidden="true">{Array.from({ length: 35 }, (_, index) => <i key={index} style={{ height: 8 + Math.sin(index * .64) ** 2 * 31 + Math.sin(index * .21) ** 2 * 13 }} />)}</div>;
}

export function RoomPreview() {
  return <Reveal className="c-room-preview">
    <div className="c-demo-caption"><span>INTERVIEWAI / INTERVIEW ROOM</span><span>PRODUCT PREVIEW · NOT LIVE</span></div>
    <div className="c-room-demo-grid">
      <div className="c-room-interviewer"><div className="c-room-stage"><span className="c-signal" /> PROJECT EXPERIENCE <span>03 / 08 · EXAMPLE</span></div><span className="c-portrait" aria-hidden="true" /><p className="c-step">YOUR AI INTERVIEWER</p><h3>Tell me about a technical decision you made on your most recent project.</h3><VoiceWave /><span className="c-room-disclosure">Illustrative question and waveform · no audio playing</span></div>
      <div className="c-room-candidate"><div className="c-camera-illustration"><svg viewBox="0 0 240 200" fill="none" aria-hidden="true"><ellipse cx="120" cy="205" rx="92" ry="77" fill="url(#candidate-fill)" /><circle cx="120" cy="82" r="39" fill="url(#candidate-fill)" /><path d="M20 46V20h26m148 0h26v26M20 154v26h26m148 0h26v-26" stroke="#ff2d95" strokeOpacity=".35" /><defs><linearGradient id="candidate-fill" x1="75" y1="30" x2="170" y2="200" gradientUnits="userSpaceOnUse"><stop stopColor="#007ba7" /><stop offset="1" stopColor="#0a0a0a" /></linearGradient></defs></svg><span>CAMERA PREVIEW · ILLUSTRATION</span></div><div className="c-preview-controls" aria-label="Illustrative interview controls"><span><Icon icon={Mic} /> Microphone</span><span><Icon icon={Video} /> Camera</span><span><Icon icon={ArrowRight} /> Exit</span></div><p>No camera or microphone is active in this preview.</p><div className="c-demo-warning">INTEGRITY STATUS <span>Preview only</span></div></div>
    </div>
  </Reveal>;
}

export function ReportPreview() {
  return <Reveal className="c-report-preview">
    <div className="c-demo-caption"><span>YOUR INTELLIGENCE REPORT</span><span>EXAMPLE DATA</span></div>
    <p className="c-example-note">Illustrative report · these scores and answers are examples, not your results.</p>
    <div className="c-report-grid"><div><p className="c-step">SKILL BREAKDOWN / EXAMPLE</p><Meter label="Backend fundamentals" value={8} /><Meter label="Problem-solving" value={6.5} /><Meter label="Explanation clarity" value={7.5} /><div className="c-report-verdict"><span>DEMONSTRATED STRENGTH</span><h3>Recognizing duplicate-request risk.</h3><blockquote>“I would use an idempotency key to identify the same request.”</blockquote><p>Example evidence · answer 02</p></div></div>
      <div className="c-report-feedback"><span className="c-step">ANSWER QUALITY / EXAMPLE</span><h3>A good concept. Make the mechanism clear.</h3><p>The answer identifies request identity, but does not explain how concurrent retries are prevented from creating two payments.</p><div className="c-feedback-detail"><span>AREA TO IMPROVE</span><p>Explain atomic storage of the key and payment outcome. Describe what a repeated request returns.</p></div><div className="c-feedback-detail"><span>EXAMPLE IMPROVED EXPLANATION</span><p>“I would enforce a unique idempotency key atomically, save the payment outcome, and return that saved result for repeated requests.”</p><small>Illustrative coaching wording, not a candidate quote.</small></div></div></div>
    <div className="c-report-roadmap"><div><span className="c-step">PRIORITIZED PRACTICE / EXAMPLE</span><h3>Turn the gap into a next step.</h3></div><ol><li><span>01 / UNDERSTAND</span><strong>Atomicity &amp; uniqueness</strong><p>Trace two simultaneous payment requests.</p></li><li><span>02 / BUILD</span><strong>A retry-safe endpoint</strong><p>Store a key and result in one transaction.</p></li><li><span>03 / VERIFY</span><strong>One payment, every time</strong><p>Test concurrent retries and explain the outcome.</p></li></ol></div>
  </Reveal>;
}
