import { lazy, Suspense, useState } from 'react';
import { detectTier } from '../experience/quality';
import { usePrefersReducedMotion } from '../design-system/motion';

const SetupDiscs = lazy(() => import('./SetupDiscs'));
const STAGES = ['Your profile', 'Your direction', 'Your plan'];

/**
 * Right-hand side of the setup page: the three stage discs in 3D (a still render under reduced motion), or,
 * where WebGL is off, the same three discs drawn flat. Decorative: the stepper in the panel names the stages.
 */
export function SetupStage({ stage }: { stage: number }) {
  const reduced = !!usePrefersReducedMotion();
  const [tier] = useState(() => detectTier(false));
  return <div className="su-stage" aria-hidden="true">
    <div className="su-discs" data-stage={stage}>
      {tier === 'still'
        ? <div className="su-discs-flat">{STAGES.map((label, index) => <span key={label} data-state={index === stage - 1 ? 'current' : index < stage - 1 ? 'done' : 'next'} />)}</div>
        : <Suspense fallback={null}><SetupDiscs stage={stage} still={reduced} /></Suspense>}
    </div>
    <ol className="su-stage-labels">{STAGES.map((label, index) => <li key={label} data-state={index === stage - 1 ? 'current' : index < stage - 1 ? 'done' : 'next'}><span>0{index + 1}</span>{label}</li>)}</ol>
  </div>;
}
