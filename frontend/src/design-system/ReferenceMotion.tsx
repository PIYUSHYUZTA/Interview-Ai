import { useState } from 'react';
import { IconButton } from '../components/icon/Icon';
import { X } from '../components/icon/icons';
import { ActionButton, Skeleton, SkeletonScreen, ToastProvider, holdSuccess, useShake, useToast, type ActionState } from '../components/motion/feedback';
import { CountUp, RevealGroup, Typewriter, WordReveal, revealItem } from '../components/motion/reveal';
import { Button, Card, Modal } from '../components/ui';
import { TextField } from '../components/library/forms';

/** The motion system on the reference page: the real components, so timing can be checked here. */
export function ReferenceMotion() {
  return <ToastProvider><MotionLab /></ToastProvider>;
}

function MotionLab() {
  const notify = useToast();
  const [state, setState] = useState<ActionState>('idle');
  const [modal, setModal] = useState(false);
  const [replay, setReplay] = useState(0);
  const [form, shake] = useShake<HTMLDivElement>();
  const submit = async () => { setState('busy'); await new Promise((resolve) => setTimeout(resolve, 900)); setState('success'); await holdSuccess(); setTimeout(() => setState('idle'), 1200); };
  return <div className="ds-stack ref-motion">
    <p className="ds-label">Entrance</p>
    <div className="ds-cluster"><h3 className="ds-h3" key={replay} data-testid="words"><WordReveal text="Interview practice that feels real." /></h3><Button variant="ghost" onClick={() => setReplay((n) => n + 1)}>Replay</Button></div>
    <p className="ds-body" data-testid="typewriter"><Typewriter key={replay} text="“What shaped that decision?”" delay={0.3} /></p>

    <p className="ds-label">Scroll reveal · count-up</p>
    <RevealGroup className="ref-motion-cards">{['Completed interviews', 'Answer evidence', 'Assessment change'].map((label, index) => <Card key={label} {...revealItem(index)} data-testid="reveal-card"><p className="ds-caption">{label}</p><strong className="ds-h2"><CountUp value={[12, 48, 6.4][index]} decimals={index === 2 ? 1 : 0} signed={index === 2} /></strong></Card>)}</RevealGroup>

    <p className="ds-label">Hover</p>
    <div className="ds-cluster">
      <Button data-testid="primary">Start interview</Button>
      <Button variant="ghost" data-testid="ghost">Explore with a sample</Button>
      <IconButton icon={X} label="Close panel" data-testid="motion-icon-button" />
      <button type="button" className="ref-lift ds-lift" data-testid="lift">Interactive card</button>
      <span className="ref-media ds-media-zoom" data-testid="media"><img src="/models/hero-bust-poster.webp" alt="Interviewer poster" /></span>
    </div>

    <p className="ds-label">Feedback</p>
    <div className="ds-cluster" ref={form}>
      <TextField label="Email address" type="email" data-testid="float" />
      <ActionButton state={state} busyLabel="Saving…" successLabel="Saved" onClick={() => { void submit(); }} data-testid="action">Save profile</ActionButton>
      <Button variant="secondary" onClick={shake} data-testid="shake">Show an error</Button>
      <Button variant="secondary" onClick={() => notify('Signed in as Ada Lovelace.')} data-testid="toast">Show a toast</Button>
      <Button variant="secondary" onClick={() => setModal(true)} data-testid="modal">Open a dialog</Button>
    </div>
    {modal && <Modal title="Leave this interview?" onClose={() => setModal(false)}>{(close) => <><p>Capture and playback stop on exit.</p><Button variant="secondary" onClick={close} data-testid="modal-close">Keep practicing</Button></>}</Modal>}
    <details className="ref-details" data-testid="details"><summary>How readiness is calculated</summary><p className="ds-body-sm">A role-weighted index of demonstrated skill verdicts. A practice indicator, not a hiring prediction.</p></details>
    <SkeletonScreen label="Loading your workspace…" className="ref-skeleton"><Skeleton width="40%" height="12px" /><Skeleton height="48px" /><Skeleton width="70%" height="12px" /></SkeletonScreen>
    <p className="ds-h3"><span className="ds-gradient-text">interview prepared.</span></p>
  </div>;
}
