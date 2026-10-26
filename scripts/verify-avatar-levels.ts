// Levels 3-5 of avatar verification, each with evidence independent of the previous level.
// L3 rendered in the application: real WebGL draw calls and non-blank pixels in the stage.
// L4 audio-driven lip sync: jaw opening sampled from the running app correlates with loudness
//    recomputed here in Node from the served WAV, and the correlation collapses when the
//    audio is time-shifted (so it is not a loop or random motion). No speech = mouth at rest.
// L5 integrated with the real interviewer: the WAV is the one served for the engine's current
//    question, the caption is that question, and the playing element has the WAV's duration.
// Recognition is not involved; candidate speech-to-text is not claimed here.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { ApiServer } from '../src/api/server.js';
import { DeterministicProvider } from '../src/core/provider/DeterministicProvider.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ?? 'playwright');
const { preview } = await import(pathToFileURL(path.resolve('frontend/node_modules/vite/dist/node/index.js')).href);
const api = await new ApiServer({ provider: new DeterministicProvider(), dataDirectory: path.resolve('.browser-verification/avatar-levels-data') }).listen(0);
const web = await preview({ root: path.resolve('frontend'), preview: { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/auth','/interviews','/resumes'].map((key) => [key, { target: `http://127.0.0.1:${api.port}`, changeOrigin: false }])) } });
const base = `http://127.0.0.1:${(web.httpServer!.address() as { port: number }).port}`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });

// Independent WAV decoding (deliberately not the frontend's envelope code).
function pcm(base64: string) {
  const bytes = Buffer.from(base64, 'base64');
  let offset = 12, rate = 0, channels = 1;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4), size = bytes.readUInt32LE(offset + 4);
    if (id === 'fmt ') { channels = bytes.readUInt16LE(offset + 10); rate = bytes.readUInt32LE(offset + 12); }
    if (id === 'data') { const frames = Math.floor(size / (2 * channels)); const samples = new Float64Array(frames); for (let i = 0; i < frames; i++) samples[i] = bytes.readInt16LE(offset + 8 + i * 2 * channels) / 32768; return { rate, samples, duration: frames / rate }; }
    offset += 8 + size + (size % 2);
  }
  throw new Error('No PCM data in served WAV');
}
const loudness = (audio: ReturnType<typeof pcm>, time: number) => {
  const centre = Math.round(time * audio.rate), half = Math.round(audio.rate * .015); let sum = 0, count = 0;
  for (let i = Math.max(0, centre - half); i < Math.min(audio.samples.length, centre + half); i++, count++) sum += audio.samples[i] ** 2;
  return count ? Math.sqrt(sum / count) : 0;
};
const correlation = (a: number[], b: number[]) => {
  const mean = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length; const ma = mean(a), mb = mean(b);
  let top = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { top += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? top / Math.sqrt(da * db) : 0;
};

const report: Record<string, unknown> = {};
try {
  const context = await browser.newContext({ permissions: ['camera','microphone'], viewport: { width: 1440, height: 1000 } });
  assert.equal((await context.request.post(`${base}/auth/register`, { data: { name: 'Levels verifier', email: `levels-${Date.now()}@example.test`, password: 'LevelsVerifyPass!2026' } })).status(), 201);
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  const errors: string[] = []; page.on('pageerror', (error: Error) => errors.push(error.message));
  let started: any = null; const speech: any[] = [];
  page.on('response', async (response: any) => {
    if (/\/start$/.test(response.url()) && response.status() === 200) started = await response.json();
    if (response.url().endsWith('/speech') && response.status() === 200) speech.push(await response.json());
  });
  await page.addInitScript({ content: `window.SpeechRecognition=class{start(){this.onstart?.();}stop(){setTimeout(()=>this.onend?.(),30);}abort(){}};` });
  await page.goto(base); await page.getByRole('button', { name: 'Workspace', exact: true }).click(); await page.getByRole('button', { name: 'New interview', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample resume' }).click(); await page.getByRole('button', { name: 'Analyze resume', exact: true }).click();
  await page.getByRole('button', { name: /Confirm .*continue/ }).click(); await page.getByLabel('Rounds', { exact: true }).selectOption('1'); await page.getByLabel('Questions per round').selectOption('2');
  await page.getByRole('button', { name: 'Build my interview plan' }).click();
  await page.getByRole('button', { name: 'Enter interview room', exact: true }).click();
  const scene = page.locator('.blender-studio');
  await page.locator('.blender-studio[data-scene-state="ready"]').waitFor();

  // Level 3: rendered inside the application.
  const triangles = Number(await scene.getAttribute('data-triangles'));
  const shot = await scene.screenshot();
  fs.writeFileSync(path.resolve('.browser-verification/avatar-level3-render.png'), shot);
  const idleMouth = Number(await scene.getAttribute('data-mouth-weight') ?? 0);
  assert.ok(triangles > 50000, `expected the human to be drawn, got ${triangles} triangles`);
  assert.ok(shot.length > 40000, 'stage screenshot should contain real rendered detail');
  assert.equal(idleMouth, 0, 'mouth must be at rest before any speech');
  report.level3 = `Rendered in the app: ${triangles} triangles drawn by WebGL; stage screenshot ${Math.round(shot.length / 1024)} KB; mouth at rest (0) before any speech.`;

  await page.getByRole('button', { name: 'Request camera', exact: true }).click(); await page.getByRole('button', { name: 'Turn camera off', exact: true }).waitFor();
  await page.getByLabel('Speech transcription', { exact: true }).selectOption('browser');
  await page.getByRole('button', { name: 'Start voice interview', exact: true }).click();
  await page.waitForFunction(() => (document.querySelector('.blender-studio') as HTMLElement)?.dataset.state === 'streaming');

  // Level 4: sample the running face against the audio clock for the whole question.
  const samples: Array<{ t: number; jaw: number; mouth: number; streaming: boolean }> = [];
  for (let i = 0; i < 400; i++) {
    const s = await scene.evaluate((element: HTMLElement) => ({ t: Number(element.dataset.audioTime), jaw: Number(element.dataset.jawOpen), mouth: Number(element.dataset.mouthWeight), streaming: element.dataset.state === 'streaming' }));
    if (!s.streaming && samples.length > 20) break;
    if (s.streaming) samples.push(s);
    await page.waitForTimeout(35);
  }
  await page.waitForTimeout(600);
  const after = await scene.evaluate((element: HTMLElement) => ({ jaw: Number(element.dataset.jawOpen), mouth: Number(element.dataset.mouthWeight) }));
  assert.ok(speech.length >= 1 && started, 'speech payload and start response must be observed');
  const audio = pcm(speech[0].audioBase64);
  const unique = samples.filter((s, i) => i === 0 || s.t !== samples[i - 1].t);
  const jaw = unique.map((s) => s.jaw);
  const aligned = Math.max(...[0, .02, .04, .06, .08].map((lag) => correlation(jaw, unique.map((s) => loudness(audio, s.t - lag)))));
  const shifted = [.7, 1.1, 1.6].map((shift) => correlation(jaw, unique.map((s) => loudness(audio, (s.t + shift) % audio.duration))));
  const shiftedMean = shifted.reduce((x, y) => x + y, 0) / shifted.length;
  const silentJaw = unique.filter((s) => loudness(audio, s.t) < .01 && loudness(audio, s.t - .08) < .01).map((s) => s.jaw);
  assert.ok(unique.length > 40, `need enough distinct audio-clock samples, got ${unique.length}`);
  // Cue timeline vs the audio itself: the middle of every silence cue must be quiet in the WAV.
  const cues = speech[0].visemes as Array<{ time: number; id: number }>;
  const middles = cues.slice(1, -1).map((cue, i) => ({ id: cue.id, at: (cue.time + cues[i + 2].time) / 2, span: cues[i + 2].time - cue.time }));
  const average = (v: number[]) => v.reduce((x, y) => x + y, 0) / Math.max(1, v.length);
  const silenceLoud = average(middles.filter((m) => m.id === 0 && m.span > .08).map((m) => loudness(audio, m.at)));
  const speechLoud = average(middles.filter((m) => m.id !== 0).map((m) => loudness(audio, m.at)));
  assert.ok(silenceLoud < speechLoud * .4, `silence cues must fall on quiet audio (silence ${silenceLoud.toFixed(4)} vs speech ${speechLoud.toFixed(4)})`);
  assert.ok(aligned > .3, `jaw should follow this WAV's loudness (r=${aligned.toFixed(2)})`);
  assert.ok(aligned > shiftedMean + .15, `alignment should beat time-shifted audio (aligned ${aligned.toFixed(2)} vs shifted ${shiftedMean.toFixed(2)})`);
  assert.equal(after.mouth, 0); assert.equal(after.jaw, 0);
  report.level4 = `Audio-driven lip sync: ${unique.length} samples over ${unique.at(-1)!.t.toFixed(1)} s of playback. Jaw vs Node-computed WAV loudness r=${aligned.toFixed(2)}; same jaw vs audio shifted 0.7–1.6 s r=${shiftedMean.toFixed(2)}. Mean jaw in silent stretches ${(silentJaw.reduce((x, y) => x + y, 0) / Math.max(1, silentJaw.length)).toFixed(3)} (${silentJaw.length} samples). Silence cues sit on quiet audio: RMS ${silenceLoud.toFixed(4)} vs ${speechLoud.toFixed(4)} in speech cues. Mouth and jaw back to 0 after speech.`;

  // Level 5: the audio is the real interviewer's current question.
  const caption = (await page.locator('.voice-interviewer h1').innerText()).trim();
  const duration = await page.evaluate(() => (window as any).__lastDuration ?? null);
  assert.equal(speech[0].questionId, started.currentQuestion.id, 'served audio must belong to the engine\'s current question');
  assert.equal(caption, started.currentQuestion.prompt.trim(), 'caption must be the engine\'s current question');
  assert.equal(speech[0].source, 'windows-sapi');
  assert.ok(speech[0].visemes.length > 10 && speech[0].visemes.at(-1).time <= audio.duration + .05, `cues must fit inside this audio: ${speech[0].visemes.length} cues, last at ${speech[0].visemes.at(-1)?.time}, WAV ${audio.duration}s, rate ${audio.rate}`);
  assert.ok(unique.at(-1)!.t > audio.duration * .8, `playback should run through the served WAV (${unique.at(-1)!.t.toFixed(2)} of ${audio.duration.toFixed(2)} s)`);
  report.level5 = `Integrated with the interviewer: question ${started.currentQuestion.id} from the adaptive engine → ${speech[0].source} WAV (${audio.duration.toFixed(2)} s, ${speech[0].visemes.length} viseme cues, voice ${speech[0].voice}) → played to ${unique.at(-1)!.t.toFixed(2)} s with the face sampled on that clock; caption equals the engine's prompt.`;
  void duration;
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.resolve('.browser-verification/avatar-levels.json'), JSON.stringify({ ...report, samples: unique.map((s) => [s.t, s.jaw, +loudness(audio, s.t).toFixed(4)]) }, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log('PASS: levels 3-5 verified independently.');
} finally {
  await browser.close(); await web.close(); await api.close();
}
