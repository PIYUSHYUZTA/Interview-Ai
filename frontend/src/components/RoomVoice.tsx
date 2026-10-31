import { lazy, Suspense, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { detectTier } from '../experience/quality';
import { usePrefersReducedMotion } from '../design-system/motion';
import type { AvatarSpeechClock } from './avatar-speech';
import type { VoiceMode } from './RoomVoiceSphere';
import { Icon } from './icon/Icon';
import { Check } from './icon/icons';

const RoomVoiceSphere = lazy(() => import('./RoomVoiceSphere'));

/**
 * Voice visualisation beside the interviewer panel. Decorative for assistive technology: the room's status
 * text and the labelled microphone meter carry the same information.
 */
export function RoomVoice({ mode, level, speech }: { mode: VoiceMode; level: number; speech?: RefObject<AvatarSpeechClock> }) {
  const reduced = !!usePrefersReducedMotion();
  const [tier] = useState(() => detectTier(false));
  const levelRef = useRef(level);
  levelRef.current = level;
  return <div className="room-voice" data-mode={mode} aria-hidden="true">
    {tier === 'still'
      ? <span className="room-voice-flat" style={{ '--level': Math.min(1, level / 60) } as CSSProperties} />
      : <Suspense fallback={null}><RoomVoiceSphere mode={mode} level={levelRef} speech={speech} still={reduced} /></Suspense>}
  </div>;
}

/** One small glowing panel per planned question: answered, current, upcoming (reference 4's thumbnail row). */
export function RoomTimeline({ answered, total }: { answered: number; total: number }) {
  return <ol className="room-timeline" aria-label="Question timeline">
    {Array.from({ length: Math.max(0, total) }, (_, index) => {
      const state = index < answered ? 'done' : index === answered ? 'current' : 'next';
      return <li key={index} data-state={state} aria-label={`Question ${index + 1}: ${state === 'done' ? 'answered' : state === 'current' ? 'current' : 'upcoming'}`}>
        <span aria-hidden="true">{state === 'done' ? <Icon icon={Check} /> : String(index + 1).padStart(2, '0')}</span>
      </li>;
    })}
  </ol>;
}
