import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { detectTier } from '../experience/quality';
import { usePrefersReducedMotion } from '../design-system/motion';
import { loudnessAt, type AvatarSpeechClock } from './avatar-speech';
import { Icon } from './icon/Icon';
import type { LucideIcon } from './icon/icons';
import { Check, LoaderCircle, Mic, Sparkles, Volume2 } from './icon/icons';

const RoomVoiceSphere = lazy(() => import('./RoomVoiceSphere'));

/**
 * The six visual states of the room, derived only from real voice state: the room's phase, whether the
 * microphone is capturing, and its measured input level. Nothing here changes how the interview runs.
 */
export type RoomState = 'init' | 'interviewer' | 'listening' | 'speaking' | 'processing' | 'generating';
export function roomStateFor(phase: string, listening: boolean, level: number): RoomState {
  if (listening) return level > 3 ? 'speaking' : 'listening';
  if (phase === 'speaking') return 'interviewer';
  if (phase === 'transcribing' || phase === 'evaluating') return 'processing';
  if (phase === 'preparing' || phase === 'playback') return 'generating'; // the next question, then its audio
  return 'init'; // ready, connecting, paused, error, complete
}
const STATES: Record<RoomState, { label: string; icon: LucideIcon }> = {
  init: { label: 'Preparing the room', icon: LoaderCircle },
  interviewer: { label: 'Interviewer speaking', icon: Volume2 },
  listening: { label: 'Listening · your turn', icon: Mic },
  speaking: { label: 'You are speaking', icon: Mic },
  processing: { label: 'Processing your answer', icon: LoaderCircle },
  generating: { label: 'Preparing the next question', icon: Sparkles },
};

/**
 * Voice sphere beside the interviewer panel. Decorative for assistive technology: the room's status text and
 * the labelled microphone meter carry the same information.
 */
export function RoomVoice({ state, level, speech }: { state: RoomState; level: number; speech?: RefObject<AvatarSpeechClock> }) {
  const reduced = !!usePrefersReducedMotion();
  const [tier] = useState(() => detectTier(false));
  const levelRef = useRef(level);
  levelRef.current = level;
  return <div className="room-voice" data-state={state} aria-hidden="true">
    {tier === 'still'
      ? <span className="room-voice-flat" style={{ '--level': Math.min(1, level / 60) } as CSSProperties} />
      : <Suspense fallback={null}><RoomVoiceSphere state={state} level={levelRef} speech={speech} still={reduced} /></Suspense>}
  </div>;
}

/**
 * Inside the interviewer panel: the current state as a badge, and a live waveform of the real signal: the
 * interviewer's speech loudness (teal) while it speaks, your microphone level (amber) while you answer.
 */
export function RoomSignal({ state, level, speech }: { state: RoomState; level: number; speech?: RefObject<AvatarSpeechClock> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ state, level });
  live.current = { state, level };
  useEffect(() => {
    const element = canvas.current; if (!element) return;
    const context = element.getContext('2d'); if (!context) return;
    const BARS = 72, history: { value: number; who: 'ai' | 'you' | 'idle' }[] = Array.from({ length: BARS }, () => ({ value: 0, who: 'idle' }));
    const style = getComputedStyle(element);
    const colour = { ai: style.getPropertyValue('--wave-ai').trim(), you: style.getPropertyValue('--wave-you').trim(), idle: style.getPropertyValue('--wave-idle').trim() };
    let width = 0, height = 0;
    const resize = () => { const box = element.getBoundingClientRect(), ratio = Math.min(2, window.devicePixelRatio || 1); width = box.width; height = box.height; element.width = Math.round(width * ratio); element.height = Math.round(height * ratio); context.setTransform(ratio, 0, 0, ratio, 0, 0); };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const sample = () => {
      const { state: now, level: mic } = live.current;
      let value = 0, who: 'ai' | 'you' | 'idle' = 'idle';
      if (now === 'speaking' || now === 'listening') { value = Math.min(1, mic / 60); who = 'you'; }
      else if (now === 'interviewer') { const clock = speech?.current, audio = clock?.audio; const loud = audio && !audio.paused ? loudnessAt(clock?.envelope, audio.currentTime) : undefined; value = Math.min(1, loud ?? 0); who = 'ai'; }
      history.push({ value, who }); history.shift();
      context.clearRect(0, 0, width, height);
      const step = width / BARS, bar = Math.max(2, step * .56), middle = height / 2;
      history.forEach((entry, index) => {
        const h = Math.max(2, entry.value * (height - 4));
        context.fillStyle = colour[entry.who] || colour.idle;
        context.globalAlpha = .35 + (index / BARS) * .65; // older samples fade to the left
        context.beginPath(); context.roundRect(index * step + (step - bar) / 2, middle - h / 2, bar, h, bar / 2); context.fill();
      });
      context.globalAlpha = 1;
    };
    const timer = window.setInterval(sample, 100); // the microphone level is measured every 100 ms
    sample();
    return () => { window.clearInterval(timer); observer.disconnect(); };
  }, [speech]);
  const { label, icon } = STATES[state];
  return <div className="room-signal" data-state={state} aria-hidden="true">
    <span className="room-state"><Icon icon={icon} />{label}</span>
    <canvas ref={canvas} className="room-wave" />
  </div>;
}

/** One small glowing panel per planned question: answered, current, upcoming (reference 4's thumbnail row). */
export function RoomTimeline({ answered, total }: { answered: number; total: number }) {
  return <ol className="room-timeline" aria-label="Question timeline" style={{ '--progress': total ? answered / total : 0 } as CSSProperties}>
    {Array.from({ length: Math.max(0, total) }, (_, index) => {
      const state = index < answered ? 'done' : index === answered ? 'current' : 'next';
      return <li key={index} data-state={state} aria-label={`Question ${index + 1}: ${state === 'done' ? 'answered' : state === 'current' ? 'current' : 'upcoming'}`}>
        <span aria-hidden="true">{state === 'done' ? <Icon icon={Check} /> : String(index + 1).padStart(2, '0')}</span>
      </li>;
    })}
  </ol>;
}
