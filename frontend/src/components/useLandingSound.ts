import { useCallback, useEffect, useRef, useState } from 'react';

type Cue = 'activate' | 'transition';

/** Tiny, gesture-triggered accents. No context exists while idle or muted. */
export function useLandingSound() {
  const [enabled, setEnabled] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const allowed = useRef(false);
  const active = useRef<AudioContext | null>(null);
  const generation = useRef(0);
  const lastPlayed = useRef(-Infinity);
  const mounted = useRef(true);

  const stop = useCallback(() => {
    generation.current++;
    const context = active.current;
    active.current = null;
    if (context && context.state !== 'closed') {
      // Closing releases the audio device and stops any scheduled tone.
      try { void context.close().catch(() => {}); } catch { /* Audio is optional. */ }
    }
  }, []);

  const play = useCallback(async (cue: Cue) => {
    if (!allowed.current || document.hidden || performance.now() - lastPlayed.current < 350) return;
    lastPlayed.current = performance.now();
    stop();
    const ticket = generation.current;
    let context: AudioContext | null = null;
    try {
      if (typeof window.AudioContext !== 'function') throw new Error('Web Audio unavailable');
      context = new window.AudioContext({ latencyHint: 'interactive' });
      active.current = context;
      // Called directly from a click/key activation, never from an effect or timer.
      await context.resume();
      if (ticket !== generation.current || !allowed.current || !mounted.current) return;
      if (context.state !== 'running') throw new Error('Audio playback blocked');
      if (cue === 'activate') setEnabled(true);
      setUnavailable(false);
      const now = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(.025, now + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, now + .18);
      gain.gain.linearRampToValueAtTime(0, now + .21);
      gain.connect(context.destination);
      const tone = context.createOscillator();
      tone.type = 'sine';
      tone.frequency.setValueAtTime(cue === 'activate' ? 523.25 : 440, now);
      tone.frequency.exponentialRampToValueAtTime(cue === 'activate' ? 783.99 : 523.25, now + .15);
      tone.connect(gain);
      tone.onended = () => {
        tone.disconnect(); gain.disconnect();
        if (active.current === context) active.current = null;
        if (context!.state !== 'closed') void context!.close().catch(() => {});
      };
      tone.start(now); tone.stop(now + .22);
    } catch {
      if (ticket === generation.current && mounted.current) {
        allowed.current = false; setEnabled(false); setUnavailable(true);
      }
    } finally {
      if (context && (ticket !== generation.current || !allowed.current) && context.state !== 'closed') {
        if (active.current === context) active.current = null;
        void context.close().catch(() => {});
      }
    }
  }, [stop]);

  const toggle = useCallback(() => {
    if (allowed.current) { allowed.current = false; stop(); setEnabled(false); }
    else { allowed.current = true; lastPlayed.current = -Infinity; void play('activate'); }
  }, [play, stop]);

  useEffect(() => {
    mounted.current = true;
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      mounted.current = false; allowed.current = false; stop();
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [stop]);

  return { enabled, unavailable, toggle, play };
}
