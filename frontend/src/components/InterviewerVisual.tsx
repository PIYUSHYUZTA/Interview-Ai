import type { RefObject } from 'react';
import type { AvatarSpeechClock } from './avatar-speech';
import SiriOrb from './vendor/smooth-siri-orb';
import type { AIState } from './vendor/smooth-ai-core';
import { BlenderAssetScene } from './BlenderAssetScene';

/** State visualization only: animation is not an audio-level meter. */
export function InterviewerVisual({ state = 'idle', size = 96, immersive = false, speech, onStatusChange }: { state?: AIState; size?: number; immersive?: boolean; speech?:RefObject<AvatarSpeechClock>; onStatusChange?:(status: 'loading'|'ready'|'fallback')=>void }) {
  return <div className={`interviewer-visual${immersive ? ' has-blender-studio' : ''}`} data-state={state} aria-hidden="true">{immersive ? <BlenderAssetScene variant="studio" state={state} speech={speech} onStatusChange={onStatusChange} /> : <SiriOrb state={state} size={`${size}px`} colors={{ bg: 'var(--paint-jet)', c1: 'var(--paint-cerulean)', c2: 'var(--paint-snow)', c3: 'var(--paint-cerulean)', c4: 'var(--paint-rose)' }} />}</div>;
}
