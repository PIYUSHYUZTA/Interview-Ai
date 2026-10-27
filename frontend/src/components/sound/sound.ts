import { useEffect, useSyncExternalStore } from 'react';
import { DEBOUNCE_MS, renderCue, type Cue } from '../../design-system/sound';

/**
 * The interface sound player. Off by default; the choice is remembered in localStorage.
 *
 * - No AudioContext exists until the person turns sound on, and none is created on page load.
 * - The context is created inside a click (browsers only allow audio after a gesture), closes after a
 *   short idle period, when sound is turned off and when the tab is hidden, releasing the audio device.
 * - The same cue never plays twice within 100 ms.
 * - Sounds are suppressed while anything registers with useSoundSuppressed (the interview room, where
 *   the microphone is listening and the interviewer is speaking).
 * - System mute: output goes through the operating system mixer, so a muted device stays silent. Where
 *   the browser supports it (Safari's Audio Session API) the session is "ambient", which also honours
 *   the ring/silent switch. Browsers expose no way to read the system mute state itself.
 */
export type { Cue };
const STORAGE_KEY = 'interview-ai.sound';
const IDLE_CLOSE_MS = 1500;
/**
 * One gesture, one sound: within 250 ms of a cue, cues of lower or equal importance are dropped, so a
 * click that also opens a toast and changes the screen is heard once, as its most meaningful cue.
 */
const PRIORITY: Record<Cue, number> = { click: 0, page: 1, toggle: 1, copy: 2, remove: 2, modalOpen: 3, modalClose: 3, notify: 3, success: 4, error: 4, done: 5 };
const PRIORITY_WINDOW_MS = 250;
let lastCue: { cue: Cue; at: number } | null = null;

interface SoundState { enabled: boolean; unavailable: boolean }
const readPreference = () => { try { return window.localStorage.getItem(STORAGE_KEY) === 'on'; } catch { return false; } };
const savePreference = (enabled: boolean) => { try { window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch { /* private mode: in-memory only */ } };

let state: SoundState = { enabled: typeof window !== 'undefined' && readPreference(), unavailable: false };
const listeners = new Set<() => void>();
const set = (next: Partial<SoundState>) => { state = { ...state, ...next }; listeners.forEach((listener) => listener()); };

let context: AudioContext | null = null;
let idleTimer = 0;
const buffers = new Map<Cue, AudioBuffer>();
const lastPlayed = new Map<Cue, number>();
const suppressors = new Set<symbol>();

function close() {
  window.clearTimeout(idleTimer);
  const closing = context;
  context = null;
  buffers.clear();
  if (closing && closing.state !== 'closed') void closing.close().catch(() => undefined);
}

async function running() {
  if (!context) {
    if (typeof window.AudioContext !== 'function') throw new Error('Web Audio unavailable');
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
    context = new window.AudioContext({ latencyHint: 'interactive' });
  }
  const current = context;
  await current.resume(); // resolves at once when running; rejects where the browser blocks audio
  if (current.state !== 'running') throw new Error('Audio playback blocked');
  return current;
}

async function start(cue: Cue) {
  const output = await running();
  let buffer = buffers.get(cue);
  if (!buffer) {
    const samples = renderCue(cue, output.sampleRate);
    buffer = output.createBuffer(1, samples.length, output.sampleRate);
    buffer.copyToChannel(samples, 0);
    buffers.set(cue, buffer);
  }
  const source = output.createBufferSource();
  const gain = output.createGain(); // unity: the loudness is in the samples; a hook point for checks
  source.buffer = buffer;
  source.connect(gain).connect(output.destination);
  source.onended = () => { source.disconnect(); gain.disconnect(); };
  source.start();
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(close, IDLE_CLOSE_MS);
}

/** Plays a cue if sound is on, the page is visible and nothing suppresses sound. Never throws. */
export function playSound(cue: Cue) {
  if (!state.enabled || suppressors.size > 0 || typeof document === 'undefined' || document.hidden) return;
  const now = performance.now();
  if (now - (lastPlayed.get(cue) ?? -Infinity) < DEBOUNCE_MS) return;
  if (lastCue && lastCue.cue !== cue && now - lastCue.at < PRIORITY_WINDOW_MS && PRIORITY[lastCue.cue] >= PRIORITY[cue]) return;
  lastPlayed.set(cue, now);
  lastCue = { cue, at: now };
  void start(cue).catch(() => undefined); // sound is an enhancement; every cue has visual feedback
}

/** Turns sound on (from a click) and confirms with the toggle click, or reports that audio is unavailable. */
export async function enableSound() {
  set({ enabled: true, unavailable: false });
  savePreference(true);
  try {
    lastPlayed.delete('toggle');
    await start('toggle');
  } catch {
    close();
    set({ enabled: false, unavailable: true });
    savePreference(false);
  }
}
export function disableSound() {
  set({ enabled: false });
  savePreference(false);
  close();
}

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) close(); });

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
/** Live sound state for toggles; every toggle on the page shows the same state. */
export function useSoundState() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
/** While mounted, no interface sound plays (used by the interview room). */
export function useSoundSuppressed() {
  useEffect(() => {
    const token = Symbol('suppress');
    suppressors.add(token);
    close();
    return () => { suppressors.delete(token); };
  }, []);
}
