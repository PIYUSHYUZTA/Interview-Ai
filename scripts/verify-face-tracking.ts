// Live face tracking through the real pipeline: browser camera stream (controllable fixture, not a
// live webcam) -> canvas JPEG samples -> POST /proctoring-frame -> Node API -> Python worker -> UI.
// Checks: near-real-time sampling, landmarks overlay, face present / leaves frame / two faces /
// automatic recovery / dark scene / distant face, and that every state is shown on the preview.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { installFaceFixture } from './browser-face-fixture.js';
import { ApiServer } from '../src/api/server.js';
import { DeterministicProvider } from '../src/core/provider/DeterministicProvider.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ?? 'playwright');
const { preview } = await import(pathToFileURL(path.resolve('frontend/node_modules/vite/dist/node/index.js')).href);
const api = await new ApiServer({ provider: new DeterministicProvider(), dataDirectory: path.resolve('.browser-verification/face-tracking-data') }).listen(0);
const web = await preview({ root: path.resolve('frontend'), preview: { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/auth','/interviews','/resumes'].map((key) => [key, { target: `http://127.0.0.1:${api.port}`, changeOrigin: false }])) } });
const base = `http://127.0.0.1:${(web.httpServer!.address() as { port: number }).port}`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
const results: Record<string, string> = {};
try {
  const context = await browser.newContext({ permissions: ['camera','microphone'], viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  assert.equal((await context.request.post(`${base}/auth/register`, { data: { name: 'Face tracking verifier', email: `face-${Date.now()}@example.test`, password: `Face-${Date.now()}-Verify!` } })).status(), 201);
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  const errors: string[] = []; page.on('pageerror', (error: Error) => errors.push(error.message));
  const frames: number[] = []; page.on('response', (response: any) => { if (/\/proctoring-frame$/.test(response.url()) && response.status() === 200) frames.push(Date.now()); });
  await page.addInitScript({ content: `window.SpeechRecognition=class{start(){this.onstart?.();}stop(){setTimeout(()=>this.onend?.(),30);}abort(){}};` });
  await installFaceFixture(page);
  await page.goto(base); await page.getByRole('button', { name: 'Workspace', exact: true }).click(); await page.getByRole('button', { name: 'New interview', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample resume' }).click(); await page.getByRole('button', { name: 'Analyze resume', exact: true }).click();
  await page.getByRole('button', { name: /Confirm .*continue/ }).click(); await page.getByLabel('Rounds', { exact: true }).selectOption('1'); await page.getByLabel('Questions per round').selectOption('2');
  await page.getByRole('button', { name: 'Build my interview plan' }).click();
  await page.getByRole('button', { name: 'Enter interview room', exact: true }).click();
  await page.getByLabel('Allow sampled Python visual monitoring with my camera').check();
  await page.getByRole('button', { name: 'Check face readiness', exact: true }).click();
  await page.getByText('Face readiness confirmed for this session. Identity has not been verified.', { exact: true }).waitFor({ timeout: 60000 });
  await page.getByLabel('Speech transcription', { exact: true }).selectOption('browser');
  await page.getByRole('button', { name: 'Start voice interview', exact: true }).click();
  await page.waitForFunction(() => document.fullscreenElement?.classList.contains('immersive-room'), undefined, { timeout: 15000 });

  const status = page.locator('.camera-preview > small[role="status"]');
  const show = async (mode: string, expected: RegExp, label: string, timeout = 12000) => {
    await page.evaluate((value) => { (window as any).fixtureImageMode = value; }, mode);
    const started = Date.now();
    await page.waitForFunction((pattern) => new RegExp(pattern).test(document.querySelector('.camera-preview > small[role="status"]')?.textContent ?? ''), expected.source, { timeout })
      .catch(async (error: Error) => { console.error(`Step ${label} (${mode}) expected ${expected}; preview status was: "${await page.locator('.camera-preview > small').first().innerText().catch(() => '(none)')}"`); throw error; });
    results[label] = `${(await status.innerText()).trim()} (after ${((Date.now() - started) / 1000).toFixed(1)} s)`;
  };

  await show('portrait', /^Face detected · facing forward$/, 'faceDetected', 30000);
  // Rate: count real analysed samples over 5 s.
  const before = frames.length; await page.waitForTimeout(5000); const perSecond = (frames.length - before) / 5;
  assert.ok(perSecond >= 1, `expected near-real-time sampling, got ${perSecond.toFixed(2)} analysed frames/s`);
  results.sampling = `${perSecond.toFixed(1)} analysed camera samples per second (was 0.5)`;
  assert.ok(await page.locator('.vision-overlay .face-track circle').count() >= 10, 'landmark overlay should be drawn');
  results.overlay = `${await page.locator('.vision-overlay .face-track circle').count()} landmark points and a face box drawn on the preview`;
  await page.locator('.voice-candidate').screenshot({ path: path.resolve('.browser-verification/face-tracking-present.png') });

  await show('blank', /^(Face lost · tracking resumes when you return|No face in view)$/, 'faceLeft');
  await show('two', /^2 faces in view$/, 'multipleFaces');
  await page.locator('.voice-candidate').screenshot({ path: path.resolve('.browser-verification/face-tracking-two.png') });
  await show('portrait', /^Face detected · facing forward$/, 'recovered');
  // Each later scene starts from "no face", so a stale status can never satisfy it.
  await show('blank', /^(Face lost · tracking resumes when you return|No face in view)$/, 'faceLeftAgain');
  await show('dark', /^Face detected · .* · low light$/, 'darkScene');
  await show('blank', /^(Face lost · tracking resumes when you return|No face in view)$/, 'faceLeftThirdTime');
  await show('distant', /^Face detected · move closer$/, 'distantFace', 15000);
  await show('portrait', /^Face detected · facing forward$/, 'recoveredAgain');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(results, null, 2));
  console.log('PASS: live face detection, landmarks overlay, leave/return recovery, two faces, dark and distant scenes through browser → API → Python.');
} finally {
  await browser.close(); await web.close(); await api.close();
}
