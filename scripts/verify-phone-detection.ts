// Live phone detection through the real pipeline: browser camera stream (controllable fixture, not a
// live webcam) -> canvas JPEG samples -> POST /proctoring-frame -> Node API -> Python worker
// (EfficientDet-Lite0, COCO 'cell phone') -> UI. The phone frame is a real CC0 photograph
// (proctoring/fixtures/phones/iphone-cc0.jpg); nothing is pasted or synthesised.
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
const api = await new ApiServer({ provider: new DeterministicProvider(), dataDirectory: path.resolve('.browser-verification/phone-detection-data'), config: { visionPhoneNoticeMs: 3000 } }).listen(0);
const web = await preview({ root: path.resolve('frontend'), preview: { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/auth','/interviews','/resumes'].map((key) => [key, { target: `http://127.0.0.1:${api.port}`, changeOrigin: false }])) } });
const base = `http://127.0.0.1:${(web.httpServer!.address() as { port: number }).port}`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
const results: Record<string, unknown> = {};
try {
  const context = await browser.newContext({ permissions: ['camera','microphone'], viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  assert.equal((await context.request.post(`${base}/auth/register`, { data: { name: 'Phone detection verifier', email: `phone-${Date.now()}@example.test`, password: `Phone-${Date.now()}-Verify!` } })).status(), 201);
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  const errors: string[] = []; page.on('pageerror', (error: Error) => errors.push(error.message));
  let sessionId = ''; const observations: { at: number; mode: string; observation: any }[] = []; let mode = 'portrait';
  page.on('response', async (response: any) => {
    const match = /\/interviews\/([^/]+)\/proctoring-frame$/.exec(response.url());
    if (match && response.status() === 200) { sessionId = match[1]; const sentMode = mode; observations.push({ at: Date.now(), mode: sentMode, observation: (await response.json().catch(() => ({}))).observation }); }
  });
  const setMode = async (value: string) => { mode = value; await page.evaluate((m) => { (window as any).fixtureImageMode = m; }, value); };
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
  const status = () => page.locator('.camera-preview > small[role="status"]').innerText();

  // No phone: several seconds of the portrait (hands visible, no phone) never confirm one.
  await page.waitForTimeout(6000);
  const portrait = observations.filter((o) => o.mode === 'portrait').map((o) => o.observation?.phoneObservation);
  assert.ok(portrait.length >= 6 && portrait.every((p) => p && p.status !== 'seen'), `portrait phone states: ${portrait.map((p) => p?.status).join(',')}`);
  assert.equal(portrait.at(-1).method, 'efficientdet-lite0-coco-cell-phone');
  results.noPhone = `${portrait.length} portrait samples, phone states: ${[...new Set(portrait.map((p) => p.status))].join('/')}; badge "${await status()}"`;

  const switched = Date.now(); await setMode('phone');
  await page.waitForFunction(() => /possible phone in view/.test(document.querySelector('.camera-preview > small[role="status"]')?.textContent ?? ''), undefined, { timeout: 20000 });
  const phone = observations.filter((o) => o.mode === 'phone').at(-1)!.observation.phoneObservation;
  assert.equal(phone.status, 'seen'); assert.ok(await page.locator('.vision-overlay rect.phone-box').count() === 1, 'phone box drawn');
  results.phone = `"${await status()}" after ${((Date.now() - switched) / 1000).toFixed(1)} s · score ${phone.score} · ${phone.positiveScans}/${phone.recentScans} scans · held in hand: ${phone.heldInHand} · box ${phone.box.join(', ')}`;
  await page.locator('.voice-candidate').screenshot({ path: path.resolve('.browser-verification/phone-detection.png') });

  // Three-warning policy: after the 30 s start grace and the (shortened) 3 s threshold the candidate gets a
  // recovery prompt; only if the phone is still there after the 10 s recovery window does it count, once.
  let prompt = '';
  const started = Date.now(); let diagnostics: any; let events: any[] = [];
  while (!events.some((e: any) => e.details?.phase === 'observed')) {
    assert.ok(Date.now() - started < 70000, 'phone_visible warning not recorded within 70 s');
    const notice = await page.locator('.monitoring-camera-notice').innerText().catch(() => '');
    if (!prompt && notice.startsWith('A phone appears to be in view. Please put it away.')) prompt = notice;
    await page.waitForTimeout(500);
    diagnostics = await (await context.request.get(`${base}/interviews/${sessionId}/diagnostics`)).json();
    events = diagnostics.events.filter((e: any) => e.eventType === 'phone_visible');
  }
  assert.match(prompt, /^A phone appears to be in view\. Please put it away\. If this continues for about \d+ more seconds it will count as an integrity warning\.$/);
  const counted = events.find((e: any) => e.details?.phase === 'observed');
  assert.equal(counted.policyDecision, 'confirmed_violation'); assert.equal(counted.warningNumber, 1); assert.equal(diagnostics.warningCount, 1);
  // The room shows the same server-worded warning panel as for a hidden tab, and the shared counter.
  const panel = page.locator('.integrity-warning-panel');
  await panel.waitFor({ timeout: 10000 });
  const panelText = await panel.innerText();
  assert.match(panelText, /Warning 1 of 2: an object the detector classified as a phone was visible for \d+ s\./);
  const policyRow = page.locator('.monitoring-summary div', { hasText: 'Policy warnings' }).locator('dd');
  await page.waitForFunction(() => /^1 \/ 2 · 1 from camera$/.test([...document.querySelectorAll('.monitoring-summary div')].find((d) => d.textContent?.startsWith('Policy warnings'))?.querySelector('dd')?.textContent ?? ''), undefined, { timeout: 10000 });
  results.prompt = prompt;
  results.warning = `${panelText.replace(/\s+/g, ' ').slice(0, 160)}… · counter "${await policyRow.innerText()}"`;
  await page.locator('.voice-candidate').screenshot({ path: path.resolve('.browser-verification/phone-camera-warning.png') });
  await page.screenshot({ path: path.resolve('.browser-verification/phone-warning-panel.png') });

  // Phone gone: the cue clears once fewer than the required scans remain positive.
  const removed = Date.now(); await setMode('portrait');
  await page.waitForFunction(() => !/possible phone/.test(document.querySelector('.camera-preview > small[role="status"]')?.textContent ?? ''), undefined, { timeout: 15000 });
  assert.equal(await page.locator('.vision-overlay rect.phone-box').count(), 0);
  results.cleared = `cue cleared ${((Date.now() - removed) / 1000).toFixed(1)} s after the phone left the frame`;
  assert.equal(await page.locator('.monitoring-badge').innerText(), 'Active');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(results, null, 2));
  console.log('PASS: live phone detection through browser → API → Python object detector: no false phone on the portrait, a real phone confirmed and boxed, recovery prompt, then counted once as warning 1 of the shared three-warning policy with the server-worded panel, cue clears.');
} finally {
  await browser.close(); await web.close(); await api.close();
}
