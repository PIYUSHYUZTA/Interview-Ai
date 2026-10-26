// Live hand tracking through the real pipeline: browser camera stream (controllable fixture, not a
// live webcam) -> canvas JPEG samples -> POST /proctoring-frame -> Node API -> Python worker -> UI.
// The portrait's real hand rests ~1.3 face widths from the face, so the near-face distance is widened
// to 1.5 here to exercise detection -> threshold -> notice -> UI on a real detection; the default (0.3)
// is checked to NOT flag it. No hand is pasted or synthesised in the image.
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
const distance = process.argv.includes('--default-distance') ? undefined : '1.5';
if (distance) process.env.PROCTORING_HAND_FACE_DISTANCE = distance; else delete process.env.PROCTORING_HAND_FACE_DISTANCE;
const api = await new ApiServer({ provider: new DeterministicProvider(), dataDirectory: path.resolve('.browser-verification/hand-tracking-data'), config: { visionHandFaceNoticeMs: 5000 } }).listen(0);
const web = await preview({ root: path.resolve('frontend'), preview: { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/auth','/interviews','/resumes'].map((key) => [key, { target: `http://127.0.0.1:${api.port}`, changeOrigin: false }])) } });
const base = `http://127.0.0.1:${(web.httpServer!.address() as { port: number }).port}`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
const results: Record<string, unknown> = { nearFaceDistance: distance ?? 'default (0.3)' };
try {
  const context = await browser.newContext({ permissions: ['camera','microphone'], viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  assert.equal((await context.request.post(`${base}/auth/register`, { data: { name: 'Hand tracking verifier', email: `hand-${Date.now()}@example.test`, password: `Hand-${Date.now()}-Verify!` } })).status(), 201);
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  const errors: string[] = []; page.on('pageerror', (error: Error) => errors.push(error.message));
  let sessionId = ''; const observations: any[] = []; const frameTimes: number[] = []; const frameStatuses: number[] = [];
  page.on('response', async (response: any) => {
    const match = /\/interviews\/([^/]+)\/proctoring-frame$/.exec(response.url());
    if (match) frameStatuses.push(response.status());
    if (match && response.status() === 200) { sessionId = match[1]; frameTimes.push(Date.now()); observations.push((await response.json().catch(() => ({}))).observation); }
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
  const status = () => page.locator('.camera-preview > small[role="status"]').innerText();

  // Hands only, no face: hands are tracked, but with no head region nothing is "near the face".
  await page.evaluate(() => { (window as any).fixtureImageMode = 'hands'; });
  const deadline = Date.now() + 15000;
  while (!observations.some((o) => o?.faceCount === 0 && o.movementObservation?.handTracks.length >= 2)) { assert.ok(Date.now() < deadline, 'hands-only frame not analysed'); await page.waitForTimeout(250); }
  await page.waitForFunction(() => document.querySelectorAll('.vision-overlay .hand-track').length >= 2, undefined, { timeout: 15000 });
  const handsOnly = observations.find((o) => o?.faceCount === 0 && o.movementObservation?.handTracks.length >= 2).movementObservation;
  assert.equal(handsOnly.handNearFace, false); assert.equal(handsOnly.headRegionSource ?? null, null);
  results.handsOnly = `${handsOnly.handTracks.length} hands tracked, ${await page.locator('.vision-overlay .hand-track line').count()} skeleton lines drawn, near face: ${handsOnly.handNearFace}`;

  await page.evaluate(() => { (window as any).fixtureImageMode = 'portrait'; });
  if (distance) {
    await page.waitForFunction(() => /· hand near face/.test(document.querySelector('.camera-preview > small[role="status"]')?.textContent ?? ''), undefined, { timeout: 15000 });
    assert.ok(await page.locator('.vision-overlay .hand-track.near-face').count() >= 1, 'near-face hand should be highlighted');
    const near = observations.at(-1).movementObservation;
    results.portraitNear = `${await status()} — faceDistance ${near.handTracks.map((t: any) => t.faceDistance).join(', ')}, source ${near.handNearFaceSource}`;
    // Sustained: after the 30 s start grace plus the 5 s notice threshold, one context-only event, no warning.
    // Diagnostics list only the latest 30 events, so read the record as soon as it appears.
    const started = Date.now(); let diagnostics: any; let events: any[] = [];
    while (!events.length) {
      assert.ok(Date.now() - started < 60000, 'hand_near_face notice not recorded within 60 s');
      await page.waitForTimeout(1000);
      diagnostics = await (await context.request.get(`${base}/interviews/${sessionId}/diagnostics`)).json();
      events = diagnostics.events.filter((e: any) => e.eventType === 'hand_near_face');
    }
    assert.ok(events.every((e: any) => e.policyDecision === 'context_only' && !e.warningNumber), JSON.stringify(events)); assert.equal(diagnostics.warningCount, 0);
    results.sustainedNotice = `hand_near_face recorded after ${((Date.now() - started) / 1000).toFixed(0)} s of portrait frames (30 s start grace + 5 s threshold), context only, warnings ${diagnostics.warningCount}`;
  } else {
    await page.waitForFunction(() => /^Face detected · facing forward$/.test(document.querySelector('.camera-preview > small[role="status"]')?.textContent ?? ''), undefined, { timeout: 15000 });
    await page.waitForTimeout(3000);
    const recent = observations.slice(-4).map((o) => o.movementObservation);
    assert.ok(recent.every((m) => m.handNearFace === false), 'resting hand must not count as near the face at the default distance');
    assert.equal(await page.locator('.vision-overlay .hand-track.near-face').count(), 0);
    results.portraitDefault = `${await status()} — faceDistance ${recent.at(-1).handTracks.map((t: any) => t.faceDistance).join(', ')}, not near`;
  }
  const sinceLast = Date.now() - (frameTimes.at(-1) ?? 0);
  const state = await (await context.request.get(`${base}/interviews/${sessionId}`)).json().catch(() => ({}));
  results.sampling = { lastAnalysedMsAgo: sinceLast, statuses: Object.entries(frameStatuses.reduce((a: any, c) => (a[c] = (a[c] ?? 0) + 1, a), {})), interviewState: state?.publicState?.state ?? state?.state };
  assert.ok(sinceLast < 3000, `sampling stopped: last analysed frame ${sinceLast} ms ago`);
  // The monitoring panel must read Active throughout live sampling (regression: it flickered to Unavailable at ~2 samples/s).
  const badges: string[] = [];
  for (let i = 0; i < 8; i++) { badges.push(await page.locator('.monitoring-badge').innerText()); await page.waitForTimeout(400); }
  assert.ok(badges.every((badge) => badge === 'Active'), `monitoring badge: ${badges.join(', ')}`);
  results.monitoringBadge = 'Active on 8 of 8 checks over 3.2 s';
  await page.locator('.voice-candidate').screenshot({ path: path.resolve(`.browser-verification/hand-tracking-${distance ? 'near' : 'default'}.png`) });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(results, null, 2));
  console.log('PASS: live hand tracking through browser → API → Python: hands-only frame, near-face threshold, overlay highlight, status badge and context-only notice.');
} finally {
  await browser.close(); await web.close(); await api.close();
}
