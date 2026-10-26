// Real SAPI WAV + viseme playback driving the Blender interviewer: pause/resume keeps sync,
// interruption stops audio and mouth promptly, replay restarts in sync, the mouth settles to
// rest after speech, and status labels only claim speaking/listening while that is true.
// Recognition is the injected browser contract used by verify-voice-room; live STT is not claimed.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ApiServer } from '../src/api/server.js';
import { DeterministicProvider } from '../src/core/provider/DeterministicProvider.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ?? 'playwright');
const { preview } = await import(pathToFileURL(path.resolve('frontend/node_modules/vite/dist/node/index.js')).href);
const api = await new ApiServer({ provider: new DeterministicProvider(), dataDirectory: path.resolve('.browser-verification/avatar-turns-data') }).listen(0);
const web = await preview({ root: path.resolve('frontend'), preview: { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/auth','/interviews','/resumes'].map((key) => [key, { target: `http://127.0.0.1:${api.port}`, changeOrigin: false }])) } });
const base = `http://127.0.0.1:${(web.httpServer!.address() as { port: number }).port}`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const results: Record<string, string> = {};
try {
  const context = await browser.newContext({ permissions: ['camera','microphone'], viewport: { width: 1440, height: 1000 } });
  assert.equal((await context.request.post(`${base}/auth/register`, { data: { name: 'Avatar verifier', email: `avatar-${Date.now()}@example.test`, password: 'AvatarVerifyPass!2026' } })).status(), 201);
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  const errors: string[] = []; page.on('pageerror', (error: Error) => errors.push(error.message));
  await page.addInitScript({ content: `window.SpeechRecognition=class{start(){this.onstart?.();this.onaudiostart?.();}stop(){setTimeout(()=>this.onend?.(),30);}abort(){}};window.allTracks=[];const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async function(c){const stream=await capture(c);window.allTracks.push(...stream.getTracks());return stream;};` });
  await page.goto(base); await page.getByRole('button', { name: 'Workspace', exact: true }).click(); await page.getByRole('button', { name: 'New interview', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample resume' }).click(); await page.getByRole('button', { name: 'Analyze resume', exact: true }).click();
  await page.getByRole('button', { name: /Confirm .*continue/ }).click(); await page.getByLabel('Rounds', { exact: true }).selectOption('1'); await page.getByLabel('Questions per round').selectOption('2');
  await page.getByRole('button', { name: 'Build my interview plan' }).click();
  await page.getByRole('button', { name: 'Enter interview room', exact: true }).click();
  await page.locator('.blender-studio[data-scene-state="ready"]').waitFor();
  await page.getByRole('button', { name: 'Request camera', exact: true }).click(); await page.getByRole('button', { name: 'Turn camera off', exact: true }).waitFor();
  await page.getByLabel('Speech transcription', { exact: true }).selectOption('browser');
  await page.getByRole('button', { name: 'Start voice interview', exact: true }).click();

  const scene = page.locator('.blender-studio');
  const face = () => scene.evaluate((element: HTMLElement) => ({ state: element.dataset.state, mouth: Number(element.dataset.mouthWeight), jaw: Number(element.dataset.jawOpen), time: Number(element.dataset.audioTime), gaze: element.dataset.gaze, blink: Number(element.dataset.blink) }));
  const status = () => page.locator('.voice-console-status strong').innerText();
  const speakingNow = () => page.waitForFunction(() => { const s = document.querySelector('.blender-studio') as HTMLElement; return s.dataset.state === 'streaming' && Number(s.dataset.mouthWeight) > .1 && Number(s.dataset.audioTime) > .3; }, undefined, { timeout: 20000 });

  await speakingNow();
  assert.equal(await status(), 'AI Speaking');
  let jawSeen = 0, gazes = new Set<string>();
  for (let sample = 0; sample < 12; sample++) { const now = await face(); jawSeen = Math.max(jawSeen, now.jaw); gazes.add(now.gaze ?? ''); await page.waitForTimeout(80); }
  assert.ok(jawSeen > .03, `jaw should open with speech (max ${jawSeen})`);
  results.speaking = `SAPI audio plays with visemes; jaw opening reached ${jawSeen.toFixed(3)}; status reads AI Speaking only while audio plays.`;
  await page.screenshot({ path: path.resolve('.browser-verification/avatar-room-speaking.png') });

  // Pause: audio clock freezes, mouth returns to rest, no speaking/listening claim.
  await page.getByRole('button', { name: 'Pause interview', exact: true }).click();
  await page.waitForTimeout(650);
  const paused = await face(); await page.waitForTimeout(400); const stillPaused = await face();
  assert.equal(await status(), 'Interview paused');
  assert.notEqual(paused.state, 'streaming'); assert.equal(paused.mouth, 0); assert.equal(paused.jaw, 0);
  assert.equal(stillPaused.time, paused.time, 'audio clock must not advance while paused');
  assert.equal(await page.locator('.voice-console-status strong', { hasText: /Speaking|Listening/ }).count(), 0);
  results.pause = `Pause froze audio at ${paused.time.toFixed(2)}s; mouth at rest; indicator reads Interview paused.`;

  // Resume continues the same WAV from where it stopped, back in sync.
  await page.getByRole('button', { name: 'Resume interview', exact: true }).click();
  await speakingNow();
  const resumed = await face();
  assert.ok(resumed.time >= paused.time - .05 && resumed.time < paused.time + 1.5, `resume should continue near ${paused.time}, got ${resumed.time}`);
  assert.equal(await status(), 'AI Speaking');
  results.resume = `Resume continued at ${resumed.time.toFixed(2)}s (paused at ${paused.time.toFixed(2)}s) with the mouth moving again.`;

  // Interruption: the candidate takes the turn; audio and mouth stop promptly.
  await page.waitForTimeout(400);
  const before = Date.now();
  await page.getByRole('button', { name: 'Interrupt and answer', exact: true }).click();
  await page.waitForFunction(() => { const s = document.querySelector('.blender-studio') as HTMLElement; return s.dataset.state !== 'streaming' && Number(s.dataset.mouthWeight) === 0; }, undefined, { timeout: 1500 });
  const stopMs = Date.now() - before;
  await page.getByRole('button', { name: 'Done speaking', exact: true }).waitFor();
  assert.match(await status(), /^(Listening|You are speaking)$/); // Chromium's fake microphone emits a tone, so candidate input is genuinely detected.
  assert.equal(await page.evaluate(() => Array.from(document.querySelectorAll('audio')).every((audio) => audio.paused)), true);
  results.interrupt = `Interrupt and answer stopped audio and mouth within ${stopMs} ms (including click round trip) and opened listening.`;

  // Replay restarts the question from the beginning in sync; natural end settles to rest and listens.
  await page.getByRole('button', { name: 'Replay question', exact: true }).click();
  await speakingNow();
  const replay = await face(); assert.ok(replay.time < 3, `replay should restart near the beginning, got ${replay.time}`);
  await page.locator('.blender-studio[data-state="listening"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
  const rest = await face();
  assert.equal(rest.mouth, 0); assert.equal(rest.jaw, 0);
  assert.match(await status(), /^(Listening|You are speaking)$/); // Chromium's fake microphone emits a tone, so candidate input is genuinely detected.
  for (let sample = 0; sample < 25; sample++) { gazes.add((await face()).gaze ?? ''); await page.waitForTimeout(200); }
  assert.ok(gazes.size > 3, 'gaze should move between saccades');
  results.replayAndRest = `Replay restarted at ${replay.time.toFixed(2)}s; after the natural end the mouth settled to rest and listening began; ${gazes.size} distinct gaze samples observed.`;

  await page.screenshot({ path: path.resolve('.browser-verification/avatar-room-listening.png') });

  // End interview: confirmation, then every audio element, microphone and camera track stops.
  await page.getByRole('button', { name: 'Exit interview', exact: true }).click();
  await page.getByRole('button', { name: 'Leave interview', exact: true }).click();
  await page.getByRole('button', { name: 'New interview', exact: true }).waitFor();
  assert.equal(await page.locator('.immersive-room').count(), 0);
  const ended = await page.evaluate(() => ({ tracks: (window as any).allTracks.length, live: (window as any).allTracks.filter((track: MediaStreamTrack) => track.readyState === 'live').length, playing: Array.from(document.querySelectorAll('audio')).filter((audio) => !audio.paused).length }));
  assert.ok(ended.tracks > 0); assert.equal(ended.live, 0); assert.equal(ended.playing, 0);
  results.endInterview = `Exit interview → Leave interview returned to the workspace; ${ended.tracks} camera/microphone tracks all ended; no audio playing.`;
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(results, null, 2));
  console.log('PASS: avatar turn-taking, synchronized pause/resume, interruption, replay and rest pose.');
} finally {
  await browser.close(); await web.close(); await api.close();
}
