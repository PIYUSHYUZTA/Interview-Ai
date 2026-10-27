import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEBOUNCE_MS, MAX_INTERACTION_SECONDS, MAX_LUFS, loudness, recipes, renderCue, type Cue } from '../../frontend/src/design-system/sound';

// Guards the sound design: the brief's sound map, measured on the exact samples the browser plays,
// and the player's rules (off by default, remembered, debounced, silent in the interview room).
const RATES = [44100, 48000];
const cues = Object.keys(recipes) as Cue[];
const read = (file: string) => readFileSync(`frontend/src/${file}`, 'utf8').replace(/\r\n/g, '\n');
const peak = (s: Float32Array) => s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
/** Dominant frequency of a slice: interpolated zero-crossing times, first to last (exact for pure tones). */
function frequency(s: Float32Array, rate: number, from: number, to: number) {
  const times: number[] = [];
  for (let i = Math.round(from * rate) + 1; i < Math.round(to * rate); i++) {
    if ((s[i - 1] < 0) !== (s[i] < 0)) times.push((i - 1 + s[i - 1] / (s[i - 1] - s[i])) / rate);
  }
  return (times.length - 1) / 2 / (times.at(-1)! - times[0]);
}
/** Brightness of a slice: the share of energy in the sample-to-sample difference (rises with pitch). */
function brightness(s: Float32Array, rate: number, from: number, to: number) {
  let diff = 0, energy = 0;
  for (let i = Math.round(from * rate) + 1; i < Math.round(to * rate); i++) { diff += (s[i] - s[i - 1]) ** 2; energy += s[i] ** 2; }
  return diff / energy;
}

describe('sound design', () => {
  it('implements every cue in the sound map with its specified length', () => {
    const lengths: Record<Cue, number> = { click: 0.06, success: 0.2, error: 0.15, notify: 0.08, modalOpen: 0.18, modalClose: 0.12, toggle: 0.04, page: 0.2, copy: 0.1, remove: 0.25, done: 0.4 };
    expect(cues.sort()).toEqual(Object.keys(lengths).sort());
    for (const rate of RATES) for (const cue of cues) {
      expect([cue, renderCue(cue, rate).length / rate]).toEqual([cue, lengths[cue]]);
      if (cue !== 'done') expect(lengths[cue]).toBeLessThan(MAX_INTERACTION_SECONDS); // done is the 400 ms chime
    }
  });

  it('every cue is quiet and refined: at most -18 LUFS, peaks below -6 dBFS, no clicks at either end', () => {
    for (const rate of RATES) for (const cue of cues) {
      const samples = renderCue(cue, rate);
      expect([cue, loudness(samples, rate) <= MAX_LUFS]).toEqual([cue, true]);
      expect([cue, 20 * Math.log10(peak(samples)) < -6]).toEqual([cue, true]);
      expect(Math.abs(samples[0])).toBeLessThan(0.01);
      expect(Math.abs(samples[samples.length - 1])).toBe(0);
    }
  });

  it('the tones have the specified pitches', () => {
    const rate = 48000;
    expect(frequency(renderCue('click', rate), rate, 0, 0.05)).toBeCloseTo(80, -1);
    expect(frequency(renderCue('notify', rate), rate, 0, 0.07)).toBeCloseTo(440, -1);
    expect(frequency(renderCue('error', rate), rate, 0, 0.14)).toBeCloseTo(120, -1);
    const success = renderCue('success', rate);
    expect(frequency(success, rate, 0.005, 0.085)).toBeCloseTo(523.25, -1); // C5
    expect(frequency(success, rate, 0.11, 0.19)).toBeCloseTo(659.25, -1); // then E5
    const remove = renderCue('remove', rate);
    expect(frequency(remove, rate, 0, 0.04)).toBeGreaterThan(280);
    expect(frequency(remove, rate, 0.2, 0.24)).toBeLessThan(215); // 300 Hz descending to 200 Hz
    const done = renderCue('done', rate);
    const notes = [frequency(done, rate, 0.01, 0.11), frequency(done, rate, 0.17, 0.23), frequency(done, rate, 0.3, 0.39)];
    expect(notes[0] < notes[1] && notes[1] < notes[2]).toBe(true); // three ascending notes
    // The thud is distorted, so it differs from a clean 120 Hz sine of the same envelope.
    const error = renderCue('error', rate);
    const sine = Float32Array.from(error, (_, i) => Math.sin(2 * Math.PI * 120 * i / rate));
    const correlation = error.reduce((sum, v, i) => sum + v * sine[i], 0) / Math.sqrt(error.reduce((s, v) => s + v * v, 0) * sine.reduce((s, v) => s + v * v, 0));
    expect(correlation).toBeLessThan(0.99);
  });

  it('the whooshes sweep: the modal opening rises, its close falls; noise is deterministic', () => {
    const rate = 48000;
    const open = renderCue('modalOpen', rate), close = renderCue('modalClose', rate);
    expect(brightness(open, rate, 0.12, 0.17)).toBeGreaterThan(brightness(open, rate, 0.01, 0.05) * 2);
    expect(brightness(close, rate, 0.01, 0.04)).toBeGreaterThan(brightness(close, rate, 0.08, 0.11) * 2);
    expect(Array.from(renderCue('page', rate))).toEqual(Array.from(renderCue('page', rate)));
  });
});

describe('sound player', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  async function load(stored: string | null) {
    const started: string[] = [];
    const storage = new Map<string, string>(stored === null ? [] : [['interview-ai.sound', stored]]);
    class FakeContext {
      static created = 0;
      state = 'running'; sampleRate = 48000; destination = {};
      constructor() { FakeContext.created++; }
      resume() { return Promise.resolve(); }
      close() { this.state = 'closed'; return Promise.resolve(); }
      createBuffer(_c: number, length: number) { return { length, copyToChannel() {} }; }
      createGain() { return { connect: (node: unknown) => node, disconnect() {} }; }
      createBufferSource() { const source = { buffer: null as unknown, onended: null, connect: (node: unknown) => node, disconnect() {}, start: () => { started.push(String((source.buffer as { length: number }).length)); } }; return source; }
    }
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) }, AudioContext: FakeContext, setTimeout, clearTimeout });
    vi.stubGlobal('document', { hidden: false, addEventListener() {} });
    vi.stubGlobal('navigator', {});
    const sound = await import('../../frontend/src/components/sound/sound');
    return { sound, started, storage, FakeContext };
  }
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('is off by default and creates no audio context until switched on', async () => {
    const { sound, started, FakeContext } = await load(null);
    sound.playSound('click'); await flush();
    expect([started.length, FakeContext.created]).toEqual([0, 0]);
  });

  it('remembers the choice, confirms with the toggle click and debounces repeats within 100 ms', async () => {
    const { sound, started, storage } = await load(null);
    await sound.enableSound();
    expect(storage.get('interview-ai.sound')).toBe('on');
    expect(started).toHaveLength(1); // the toggle confirmation
    await new Promise((resolve) => setTimeout(resolve, 260)); // past the priority window
    sound.playSound('notify'); sound.playSound('notify'); await flush();
    expect(started).toHaveLength(2);
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS + 20));
    sound.playSound('notify'); await flush();
    expect(started).toHaveLength(3);
    sound.disableSound();
    expect(storage.get('interview-ai.sound')).toBe('off');
    sound.playSound('success'); await flush();
    expect(started).toHaveLength(3);
  });

  it('a stored "on" is honoured after reload, but nothing plays on load by itself', async () => {
    const { sound, started } = await load('on');
    await flush();
    expect(started).toHaveLength(0);
    sound.playSound('click'); await flush();
    expect(started).toHaveLength(1);
  });
});

describe('sound integration', () => {
  it('pairs each cue with visual feedback, stays silent in the interview room, and uses no audio files or libraries', () => {
    expect(read('components/ui.tsx')).toContain("playSound(props['aria-pressed'] === undefined ? 'click' : 'toggle');");
    expect(read('components/ui.tsx')).toContain("playSound('modalOpen')");
    expect(read('components/ui.tsx')).toContain("playSound('modalClose')");
    const feedback = read('components/motion/feedback.tsx');
    for (const cue of ["playSound('success')", "playSound('error')", "'notify'", "playSound('remove')"]) expect(feedback).toContain(cue);
    const app = read('App.tsx');
    expect(app).toContain("playSound('done')");
    expect(app).toContain("playSound('page')");
    expect(app).toContain('<ThemeToggle tooltipSide="left" /><SoundToggle />');
    expect(read('components/InterviewRoom.tsx')).toContain('useSoundSuppressed();');
    expect(read('components/LandingPage.tsx')).toContain('<SoundToggle className="c-sound-toggle" />');
    const player = read('components/sound/sound.ts');
    expect(player).toContain("window.localStorage.getItem(STORAGE_KEY) === 'on'");
    expect(player).not.toMatch(/new Audio\(|fetch\(|\.mp3|\.wav|decodeAudioData/);
    const pkg = JSON.parse(readFileSync('frontend/package.json', 'utf8'));
    expect(Object.keys(pkg.dependencies).filter((d) => /howler|tone|sound|audio/.test(d))).toEqual([]);
  });
});
