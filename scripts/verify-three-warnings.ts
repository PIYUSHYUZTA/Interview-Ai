// Three-warning policy, live through the real pipeline (browser camera fixture -> API -> Python -> engine
// -> state machine -> room). The camera is a controllable fixture stream through the real permission path,
// not a physical webcam; detections are genuine Python results for the images shown.
// Sequence: two faces -> warning 1; camera failures (blank image, disconnect) -> no warning; no face ->
// warning 2 (final); two faces -> interview ends with the recorded reason; capture stops; results 410.
// The camera-incident threshold is shortened to 5 s (policy prompt + 10 s recovery and 60 s cooldown are real).
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
const apiServer = new ApiServer({ provider: new DeterministicProvider(), dataDirectory: path.resolve('.browser-verification/three-warnings-data'), config: { visionNoticeMs: 5000 } });
const api = await apiServer.listen(0);
const web = await preview({ root: path.resolve('frontend'), preview: { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/auth','/interviews','/resumes'].map((key) => [key, { target: `http://127.0.0.1:${api.port}`, changeOrigin: false }])) } });
const base = `http://127.0.0.1:${(web.httpServer!.address() as { port: number }).port}`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
const log: string[] = []; const started = Date.now();
const note = (line: string) => { const entry = `${((Date.now() - started) / 1000).toFixed(0).padStart(4)} s  ${line}`; log.push(entry); console.log(entry); };
try {
  const context = await browser.newContext({ permissions: ['camera','microphone'], viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  assert.equal((await context.request.post(`${base}/auth/register`, { data: { name: 'Three warnings verifier', email: `three-${Date.now()}@example.test`, password: `Three-${Date.now()}-Verify!` } })).status(), 201);
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  const errors: string[] = []; page.on('pageerror', (error: Error) => errors.push(error.message));
  let sessionId = ''; let lastFrameRequestAt = 0;
  const warnings: { at: number; warningCount: number; terminated: boolean; message: string }[] = [];
  page.on('request', (request: any) => { if (/\/proctoring-frame$/.test(request.url())) lastFrameRequestAt = Date.now(); });
  page.on('response', async (response: any) => {
    const match = /\/interviews\/([^/]+)\/proctoring-frame$/.exec(response.url()); if (!match) return;
    sessionId = match[1];
    const body = await response.json().catch(() => ({}));
    if (body.warning) { warnings.push({ at: Date.now(), ...body.warning }); note(`backend: ${body.warning.message.slice(0, 110)}…`); }
  });
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
  const setMode = async (mode: string) => { await page.evaluate((m) => { (window as any).fixtureImageMode = m; }, mode); note(`camera shows: ${mode}`); };
  const panelText = () => page.locator('.integrity-warning-panel').innerText().catch(() => '');
  const counter = () => page.evaluate(() => [...document.querySelectorAll('.monitoring-summary div')].find((d) => d.textContent?.startsWith('Policy warnings'))?.querySelector('dd')?.textContent ?? '');
  const waitForWarning = async (count: number, ms = 120000) => { const t = Date.now(); while (!warnings.some(w => w.warningCount === count)) { assert.ok(Date.now() - t < ms, `warning ${count} not issued`); await page.waitForTimeout(250); } return warnings.find(w => w.warningCount === count)!; };
  const sm = async () => (apiServer as any).store.load(sessionId);

  // Warning 1: two faces (sustained 5 s -> recovery prompt -> still there 10 s later).
  await setMode('two');
  await page.getByText(/^More than one face is in view\. Please make sure you are alone/).first().waitFor({ timeout: 70000 });
  note('room shows the recovery prompt before any warning');
  const first = await waitForWarning(1);
  await page.waitForFunction((m) => (document.querySelector('.integrity-warning-panel')?.textContent ?? '').includes(m), first.message, { timeout: 10000 });
  assert.match(first.message, /^Warning 1 of 2: more than one face was visible for \d+ s\./);
  note(`room panel shows warning 1 verbatim; counter "${await counter()}"`);
  await setMode('portrait');

  // Camera failures between warnings: an unusable (blank) image and a disconnection. Neither may count.
  await page.waitForTimeout(4000);
  await setMode('blank'); await page.waitForTimeout(14000);
  await setMode('portrait');
  await page.evaluate(() => { const v = document.querySelector('video[aria-label="Local camera preview"]') as HTMLVideoElement; for (const t of (v.srcObject as MediaStream).getVideoTracks()) { t.stop(); t.dispatchEvent(new Event('ended')); } });
  note('camera track ended (simulated unplug)');
  await page.getByText(/^The camera disconnected\. Reconnecting automatically/).first().waitFor({ timeout: 5000 });
  await page.waitForFunction(() => /^Face detected/.test(document.querySelector('.camera-preview > small[role="status"]')?.textContent ?? ''), undefined, { timeout: 20000 });
  note('camera reconnected and face tracked again');
  const afterFailures = await sm();
  assert.equal(afterFailures.toPublicState().integrity.warningCount, 1, 'camera failures must not add warnings');
  assert.ok(afterFailures.integrityEvents.some((e: any) => e.eventType === 'camera_obstructed' && !e.warningNumber), 'the blank image should be recorded as technical camera_obstructed');
  note('blank image recorded as technical camera_obstructed; warning count still 1');

  // Warning 2: no face in a usable image, timed to qualify just after the 60 s cooldown.
  const startSecond = first.at + 60000 - 15000 + 2000 - Date.now();
  if (startSecond > 0) await page.waitForTimeout(startSecond);
  await setMode('hands');
  const second = await waitForWarning(2);
  await page.waitForFunction((m) => (document.querySelector('.integrity-warning-panel')?.textContent ?? '').includes(m), second.message, { timeout: 10000 });
  assert.match(second.message, /^Warning 2 of 2 — final warning: no face was visible for \d+ s while the camera image was usable\./);
  assert.match(await panelText(), /Final integrity warning/);
  note(`room panel shows the final warning; counter "${await counter()}"`);
  await setMode('portrait');

  // Third qualifying incident: the interview ends.
  const startThird = second.at + 60000 - 15000 + 2000 - Date.now();
  if (startThird > 0) await page.waitForTimeout(startThird);
  await setMode('two');
  const third = await waitForWarning(3);
  assert.equal(third.terminated, true);
  const card = page.locator('.integrity-termination-card');
  await card.waitFor({ timeout: 15000 });
  const cardText = await card.innerText();
  assert.match(cardText, /This interview has ended\./);
  assert.match(cardText, /The interview ended after three separate qualifying incidents: 1\) more than one face was visible for \d+ s; 2\) no face was visible for \d+ s while the camera image was usable; 3\) more than one face was visible for \d+ s\./);
  note('room shows the termination card with the recorded reason');
  const terminatedAt = Date.now(); await page.waitForTimeout(5000);
  assert.ok(lastFrameRequestAt <= terminatedAt + 1000, 'camera sampling must stop after termination');
  const final = await sm();
  assert.equal(final.state, 'TERMINATED_FOR_INTEGRITY');
  const results = await context.request.get(`${base}/interviews/${sessionId}/results`);
  assert.equal(results.status(), 410);
  const body = await results.json();
  assert.deepEqual(body.integrityReview.incidents.filter((i: any) => i.counted).map((i: any) => [i.eventType, i.warningNumber]), [['multiple_faces', 1], ['face_absent', 2], ['multiple_faces', 3]]);
  note(`state ${final.state}; sampling stopped; results 410 with the integrity record (3 counted incidents)`);
  await page.screenshot({ path: path.resolve('.browser-verification/three-warnings-terminated.png') });
  assert.deepEqual(errors, []);
  console.log('PASS: live three-warning policy: prompt, warning 1, camera failures not counted, final warning 2, termination with recorded reason, capture stopped, results 410 with record.');
} finally {
  await browser.close(); await web.close(); await api.close();
}
