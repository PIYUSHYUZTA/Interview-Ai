/**
 * Sound design: every interface sound, synthesised from code (no audio files).
 *
 * Sound confirms, never decorates: each cue answers an action that already has visual feedback.
 * Cues are rendered sample by sample from a fixed recipe, so the exact waveform the browser plays can be
 * measured anywhere: src/api/soundSystem.test.ts checks loudness (<= -18 LUFS), peak and duration.
 * The player (components/sound/sound.ts) only copies these samples into an AudioBuffer.
 */
export type Cue = 'click' | 'success' | 'error' | 'notify' | 'modalOpen' | 'modalClose' | 'toggle' | 'page' | 'copy' | 'remove' | 'done';

/** Integrated loudness each cue is normalised to; the brief's ceiling is -18 LUFS. */
export const TARGET_LUFS = -22;
export const MAX_LUFS = -18;
/** Interaction sounds stay under 300 ms; the completion chime is the one longer cue (400 ms). */
export const MAX_INTERACTION_SECONDS = 0.3;
/** The same cue never plays twice within this window. */
export const DEBOUNCE_MS = 100;

interface Recipe { seconds: number; render: (t: number, state: RenderState) => number }
interface RenderState { sampleRate: number; noise: () => number; phase: number[] }

const TAU = Math.PI * 2;
// Envelopes: a 4 ms attack avoids clicks; the decay is exponential, as in real struck objects.
const attack = (t: number, a = 0.004) => Math.min(1, t / a);
const decay = (t: number, length: number, curve = 5) => Math.exp((-curve * t) / length) * Math.max(0, 1 - t / length);
const env = (t: number, length: number, curve?: number) => attack(t) * decay(t, length, curve);
/** Phase-continuous oscillator for gliding pitches. */
const glide = (state: RenderState, voice: number, frequency: number) => {
  state.phase[voice] = (state.phase[voice] ?? 0) + (TAU * frequency) / state.sampleRate;
  return Math.sin(state.phase[voice]);
};
const note = (t: number, start: number, length: number, frequency: number) => {
  const local = t - start;
  return local < 0 || local > length ? 0 : Math.sin(TAU * frequency * local) * env(local, length, 4);
};
const C5 = 523.25, E5 = 659.25, G5 = 783.99;

/** One-pole low-pass whose cutoff moves with time: turns white noise into a "whoosh". */
function sweptNoise(seconds: number, from: number, to: number, curve = 3): Recipe {
  let low = 0, band = 0;
  return {
    seconds,
    render: (t, state) => {
      const progress = t / seconds;
      const cutoff = from * (to / from) ** progress;
      const a = 1 - Math.exp((-TAU * cutoff) / state.sampleRate);
      low += a * (state.noise() - low);
      band += a * (low - band); // second pole: softer, less hiss
      const shape = Math.sin(Math.PI * Math.min(1, progress * 1.15)) ** curve; // swells, then falls away
      return band * shape;
    },
  };
}

/** Recipes are factories: a filter's state starts fresh for every render. */
export const recipes: Record<Cue, () => Recipe> = {
  // Soft tick: 80 Hz sine, 60 ms, fading out.
  click: () => ({ seconds: 0.06, render: (t) => Math.sin(TAU * 80 * t) * env(t, 0.06, 4) }),
  // Pleasant two-tone chime: C5 then E5, 200 ms.
  success: () => ({ seconds: 0.2, render: (t) => note(t, 0, 0.1, C5) + note(t, 0.09, 0.11, E5) }),
  // Low dull thud: 120 Hz with a little soft-clip distortion, 150 ms.
  error: () => ({ seconds: 0.15, render: (t) => Math.tanh(2.2 * Math.sin(TAU * 120 * t) * env(t, 0.15, 4)) / Math.tanh(2.2) }),
  // Subtle pop: 440 Hz sine, 80 ms, quick fade.
  notify: () => ({ seconds: 0.08, render: (t) => Math.sin(TAU * 440 * t) * env(t, 0.08, 6) }),
  // Soft whoosh: noise swept upward, 180 ms; the close is the same sweep reversed and shorter, 120 ms.
  modalOpen: () => sweptNoise(0.18, 300, 3200),
  modalClose: () => sweptNoise(0.12, 3200, 300),
  // Mechanical click: a 40 ms burst of bright noise with a very fast decay.
  toggle: () => ({ seconds: 0.04, render: (t, state) => state.noise() * env(t, 0.04, 9) }),
  // Gentle swipe: 200 ms white-noise sweep, the quietest whoosh (normalised lower below).
  page: () => sweptNoise(0.2, 500, 5000, 2),
  // Satisfying "tink": 880 Hz sine with a faint octave, 100 ms.
  copy: () => ({ seconds: 0.1, render: (t) => (Math.sin(TAU * 880 * t) + 0.25 * Math.sin(TAU * 1760 * t)) * env(t, 0.1, 6) }),
  // Soft descending tone: 300 Hz gliding to 200 Hz, 250 ms.
  remove: () => ({ seconds: 0.25, render: (t, state) => glide(state, 0, 300 * (200 / 300) ** (t / 0.25)) * env(t, 0.25, 3) }),
  // Warm three-note ascending chime: C5, E5, G5 across 400 ms.
  done: () => ({ seconds: 0.4, render: (t) => note(t, 0, 0.16, C5) + note(t, 0.12, 0.16, E5) + 1.1 * note(t, 0.24, 0.16, G5) }),
};

/** Per-cue offset from the target loudness: supporting sounds sit lower than confirmations. */
const trim: Partial<Record<Cue, number>> = { page: -6, click: -4, toggle: -4, modalOpen: -3, modalClose: -3 };

/** Deterministic noise, so every play (and every test) produces the same waveform. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return (((x ^ (x >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/** Renders a cue at `sampleRate`, normalised to its loudness target. */
export function renderCue(cue: Cue, sampleRate: number): Float32Array<ArrayBuffer> {
  const recipe = recipes[cue]();
  const length = Math.round(recipe.seconds * sampleRate);
  const samples = new Float32Array(length);
  const state: RenderState = { sampleRate, noise: seeded(cue.length * 7919), phase: [] };
  for (let i = 0; i < length; i++) samples[i] = recipe.render(i / sampleRate, state);
  // A 2 ms fade to zero guarantees no click at the end of the buffer.
  const tail = Math.min(length, Math.round(0.002 * sampleRate));
  for (let i = 0; i < tail; i++) samples[length - 1 - i] *= i / tail;
  const gain = 10 ** ((TARGET_LUFS + (trim[cue] ?? 0) - loudness(samples, sampleRate)) / 20);
  for (let i = 0; i < length; i++) samples[i] *= gain;
  return samples;
}

/**
 * Loudness in LUFS (ITU-R BS.1770 K-weighting), measured over the sound itself rather than gated over a
 * programme, which is the stricter reading for short cues. A mono cue is heard on both speakers, so it
 * is measured as two identical channels.
 */
export function loudness(samples: Float32Array, sampleRate: number, channels = 2) {
  const weighted = kWeight(samples, sampleRate);
  let sum = 0;
  for (const value of weighted) sum += value * value;
  const meanSquare = (sum / weighted.length) * channels;
  return meanSquare > 0 ? -0.691 + 10 * Math.log10(meanSquare) : -Infinity;
}

/** The two BS.1770 pre-filters (high shelf + high pass), designed for any sample rate. */
function kWeight(input: Float32Array, sampleRate: number) {
  const shelf = biquad('highshelf', 1681.974450955533, 0.7071752369554196, 3.99984385397, sampleRate);
  const highPass = biquad('highpass', 38.13547087602444, 0.5003270373238773, 0, sampleRate);
  return filter(filter(input, shelf), highPass);
}
function biquad(type: 'highshelf' | 'highpass', f0: number, q: number, gainDb: number, fs: number) {
  const A = 10 ** (gainDb / 40), w0 = (TAU * f0) / fs, alpha = Math.sin(w0) / (2 * q), cos = Math.cos(w0);
  const c = type === 'highshelf'
    ? [A * ((A + 1) + (A - 1) * cos + 2 * Math.sqrt(A) * alpha), -2 * A * ((A - 1) + (A + 1) * cos), A * ((A + 1) + (A - 1) * cos - 2 * Math.sqrt(A) * alpha),
      (A + 1) - (A - 1) * cos + 2 * Math.sqrt(A) * alpha, 2 * ((A - 1) - (A + 1) * cos), (A + 1) - (A - 1) * cos - 2 * Math.sqrt(A) * alpha]
    : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
  return c.map((value) => value / c[3]);
}
function filter(x: Float32Array, [b0, b1, b2, , a1, a2]: number[]) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const out = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = out; y[i] = out;
  }
  return y;
}
