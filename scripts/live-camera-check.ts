// Guided LIVE-CAMERA check: the real app in a visible browser, your real webcam (no fake device), a person
// following on-screen prompts. Each step measures what Python actually returned and the report says
// PASS / FAIL / SKIPPED per step. Nothing here is simulated unless you pass --fixture, which swaps in the
// test camera stream to check this harness itself (its results are NOT live-camera evidence).
//   npx tsx scripts/live-camera-check.ts            (needs a webcam and a person; ~2 minutes)
//   npx tsx scripts/live-camera-check.ts --fixture  (harness self-test only)
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { installFaceFixture } from './browser-face-fixture.js';
import { ApiServer } from '../src/api/server.js';
import { DeterministicProvider } from '../src/core/provider/DeterministicProvider.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ?? 'playwright');
const { preview } = await import(pathToFileURL(path.resolve('frontend/node_modules/vite/dist/node/index.js')).href);
const fixture = process.argv.includes('--fixture');

type Obs = any;
interface Step {
  id: string; prompt: string; seconds: number; optional?: boolean; fixtureMode?: string;
  judge: (samples: Obs[], rest: { yaw: number; pitch: number }) => { status: 'PASS' | 'FAIL' | 'SKIPPED'; measured: string };
}
const pct = (n: number, d: number) => d ? Math.round(n / d * 100) : 0;
const values = (s: Obs[], pick: (o: Obs) => number | undefined | null) => s.map(pick).filter((v): v is number => typeof v === 'number');
const range = (v: number[]) => v.length ? Math.max(...v) - Math.min(...v) : 0;
const STEPS: Step[] = [
  { id: 'face', prompt: 'Sit normally and look at the screen.', seconds: 8, fixtureMode: 'portrait',
    judge: (s) => { const ok = s.filter(o => o.faceCount === 1).length; return { status: pct(ok, s.length) >= 70 ? 'PASS' : 'FAIL', measured: `one face in ${ok}/${s.length} samples; ${s.find(o => o.faceTracks?.[0])?.faceTracks[0].landmarks?.length ?? 0} overlay landmark points sent to the room (from 478 detected)` }; } },
  { id: 'head-turn', prompt: 'Slowly turn your head to the LEFT, then to the RIGHT, then back to the screen.', seconds: 12,
    judge: (s) => { const yaw = values(s, o => o.headPoseDegrees?.yaw); return { status: range(yaw) >= 30 ? 'PASS' : 'FAIL', measured: `head yaw ranged ${yaw.length ? Math.min(...yaw).toFixed(0) : '?'}° to ${yaw.length ? Math.max(...yaw).toFixed(0) : '?'}° over ${yaw.length} samples` }; } },
  { id: 'look-down', prompt: 'Look DOWN at your desk for a few seconds, then back at the screen.', seconds: 10,
    judge: (s, rest) => { const pitch = values(s, o => o.headPoseDegrees?.pitch); const low = pitch.length ? Math.min(...pitch) : NaN; return { status: low <= rest.pitch - 12 ? 'PASS' : 'FAIL', measured: `pitch went from ~${rest.pitch.toFixed(0)}° at rest down to ${Number.isFinite(low) ? low.toFixed(0) : '?'}° (negative = looking down)` }; } },
  { id: 'eyes-only', prompt: 'Keep your head still. Move only your EYES: far left of the screen, far right, then centre.', seconds: 12,
    judge: (s) => { const h = values(s, o => o.directionEstimate?.gazeOffset?.horizontal); const yaw = values(s, o => o.headPoseDegrees?.yaw); return { status: h.length >= 5 && range(h) >= .05 ? 'PASS' : 'FAIL', measured: `iris offset ranged ${range(h).toFixed(3)} eye widths over ${h.length} readable samples (head yaw range ${range(yaw).toFixed(0)}°); off-centre label shown in ${s.filter(o => (o.directionEstimate?.gazeDirections ?? []).some((d: string) => d !== 'unavailable')).length} samples` }; } },
  { id: 'hands', prompt: 'Raise BOTH hands in front of you, open, and move them slowly.', seconds: 8, fixtureMode: 'hands',
    judge: (s) => { const most = Math.max(0, ...values(s, o => o.movementObservation?.handTracks?.length)); return { status: most >= 1 ? 'PASS' : 'FAIL', measured: `up to ${most} hand(s) with 21 landmarks; seen in ${s.filter(o => o.movementObservation?.handTracks?.length).length}/${s.length} samples` }; } },
  { id: 'leave', prompt: 'Step OUT of the camera view for about 8 seconds.', seconds: 10, fixtureMode: 'hands',
    judge: (s) => { const none = s.filter(o => o.faceCount === 0).length; return { status: none >= 3 ? 'PASS' : 'FAIL', measured: `no face in ${none}/${s.length} samples; states ${[...new Set(s.map(o => o.faceState))].join(', ')}` }; } },
  { id: 'return', prompt: 'Come BACK and look at the screen.', seconds: 8, fixtureMode: 'portrait',
    judge: (s) => { const firstFace = s.findIndex(o => o.faceCount === 1); return { status: firstFace >= 0 ? 'PASS' : 'FAIL', measured: firstFace >= 0 ? `face tracked again from sample ${firstFace + 1} of ${s.length}` : 'face not found again' }; } },
  { id: 'cover', prompt: 'COVER the camera with your hand or a sticky note for a few seconds.', seconds: 8, fixtureMode: 'blank',
    judge: (s) => { const unusable = s.filter(o => o.frameQuality?.usable === false).length; return { status: unusable >= 2 ? 'PASS' : 'FAIL', measured: `image marked unusable (technical, never a warning) in ${unusable}/${s.length} samples` }; } },
  { id: 'second-person', prompt: 'OPTIONAL: if someone is with you, ask them to lean into view next to you. Otherwise just wait.', seconds: 10, optional: true, fixtureMode: 'two',
    judge: (s) => { const most = Math.max(0, ...values(s, o => o.faceCount)); return { status: most >= 2 ? 'PASS' : 'SKIPPED', measured: `up to ${most} face(s) at once` }; } },
  { id: 'phone', prompt: 'OPTIONAL: hold a phone up in front of you, screen toward you, back toward the camera. Otherwise wait.', seconds: 12, optional: true, fixtureMode: 'phone',
    judge: (s) => { const seen = s.filter(o => o.phoneObservation?.status === 'seen').length; const best = Math.max(0, ...values(s, o => o.phoneObservation?.score)); return { status: seen ? 'PASS' : 'SKIPPED', measured: `phone confirmed in ${seen}/${s.length} samples (best score ${best.toFixed(2)}); not detected is reported as skipped, not as working` }; } },
];

const apiServer = new ApiServer({ provider: new DeterministicProvider(), dataDirectory: path.resolve('.browser-verification/live-camera-data') });
const api = await apiServer.listen(0);
const web = await preview({ root: path.resolve('frontend'), preview: { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/auth','/interviews','/resumes'].map((key) => [key, { target: `http://127.0.0.1:${api.port}`, changeOrigin: false }])) } });
const base = `http://127.0.0.1:${(web.httpServer!.address() as { port: number }).port}`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: fixture,
  args: fixture ? ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'] : ['--autoplay-policy=no-user-gesture-required'] });
const report: any = { kind: fixture ? 'HARNESS SELF-TEST (fixture camera, not live evidence)' : 'LIVE CAMERA', startedAt: new Date().toISOString(), camera: null, steps: [] };
try {
  const context = await browser.newContext({ permissions: ['camera','microphone'], viewport: { width: 1440, height: 900 } });
  assert.equal((await context.request.post(`${base}/auth/register`, { data: { name: 'Live camera check', email: `live-${Date.now()}@example.test`, password: `Live-${Date.now()}-Check!` } })).status(), 201);
  const page = await context.newPage(); page.setDefaultTimeout(60000);
  const samples: { at: number; observation: Obs }[] = [];
  page.on('response', async (response: any) => { if (/\/proctoring-frame$/.test(response.url()) && response.status() === 200) { const body = await response.json().catch(() => null); if (body?.observation) samples.push({ at: Date.now(), observation: body.observation }); } });
  await page.addInitScript({ content: `window.SpeechRecognition=window.SpeechRecognition||class{start(){this.onstart?.();}stop(){setTimeout(()=>this.onend?.(),30);}abort(){}};` });
  if (fixture) await installFaceFixture(page);
  await page.goto(base);
  report.camera = await page.evaluate(async () => (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput').map(d => d.label || '(label hidden until permission)'));
  if (!fixture && !report.camera.length) throw new Error('No webcam found. Connect a camera and run again.');
  await page.getByRole('button', { name: 'Workspace', exact: true }).click(); await page.getByRole('button', { name: 'New interview', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample resume' }).click(); await page.getByRole('button', { name: 'Analyze resume', exact: true }).click();
  await page.getByRole('button', { name: /Confirm .*continue/ }).click(); await page.getByLabel('Rounds', { exact: true }).selectOption('1'); await page.getByLabel('Questions per round').selectOption('2');
  await page.getByRole('button', { name: 'Build my interview plan' }).click();
  await page.getByRole('button', { name: 'Enter interview room', exact: true }).click();
  await page.getByLabel('Allow sampled Python visual monitoring with my camera').check();
  await page.getByRole('button', { name: 'Check face readiness', exact: true }).click();
  await page.getByText('Face readiness confirmed for this session. Identity has not been verified.', { exact: true }).waitFor({ timeout: 90000 });
  await page.getByLabel('Speech transcription', { exact: true }).selectOption('browser');
  await page.getByRole('button', { name: 'Start voice interview', exact: true }).click();
  report.camera = await page.evaluate(async () => (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput').map(d => d.label));
  const show = (text: string) => page.evaluate((t) => { let el = document.getElementById('live-check-prompt'); if (!el) { el = document.createElement('div'); el.id = 'live-check-prompt'; el.setAttribute('style', 'position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:2147483647;background:#031211;color:#E8E4D3;border:2px solid #00AEBB;padding:18px 28px;font:600 22px/1.4 system-ui;max-width:80vw;text-align:center;border-radius:12px'); document.body.appendChild(el); } el.textContent = t; }, text);
  for (let n = 5; n > 0; n--) { await show(`Live camera check starting in ${n}… Follow the instructions shown here.`); await page.waitForTimeout(1000); }
  await show('Sit normally and look at the screen (measuring your resting head position).'); await page.waitForTimeout(4000);
  const restSamples = samples.slice(-6).map(s => s.observation).filter(o => o.headPoseDegrees);
  const rest = { yaw: restSamples.length ? restSamples.reduce((a, o) => a + o.headPoseDegrees.yaw, 0) / restSamples.length : 0, pitch: restSamples.length ? restSamples.reduce((a, o) => a + o.headPoseDegrees.pitch, 0) / restSamples.length : 0 };
  for (const step of STEPS) {
    if (fixture) await page.evaluate((m) => { (window as any).fixtureImageMode = m; }, step.fixtureMode ?? 'portrait');
    for (let left = step.seconds; left > 0; left--) { await show(`${step.prompt}  (${left})`); await page.waitForTimeout(1000); }
    const from = Date.now() - (step.seconds - 2) * 1000; // ignore the first 2 s while the person reacts
    const window = samples.filter(s => s.at >= from).map(s => s.observation);
    const verdict = window.length ? step.judge(window, rest) : { status: 'FAIL' as const, measured: 'no analysed samples arrived' };
    const status = fixture && !step.fixtureMode ? 'SKIPPED' : verdict.status;
    report.steps.push({ id: step.id, prompt: step.prompt, status, measured: fixture && !step.fixtureMode ? 'not reproducible with a still fixture image' : verdict.measured, samples: window.length });
    console.log(`${status.padEnd(7)} ${step.id.padEnd(14)} ${report.steps.at(-1).measured}`);
  }
  await show('Done — thank you. You can close this window.');
  report.restPose = rest;
  report.samplesTotal = samples.length;
  report.finishedAt = new Date().toISOString();
  report.summary = { pass: report.steps.filter((s: any) => s.status === 'PASS').length, fail: report.steps.filter((s: any) => s.status === 'FAIL').length, skipped: report.steps.filter((s: any) => s.status === 'SKIPPED').length };
  mkdirSync(path.resolve('.browser-verification'), { recursive: true });
  const file = path.resolve(`.browser-verification/${fixture ? 'live-camera-harness-selftest' : 'live-camera-report'}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`${report.kind}: ${report.summary.pass} passed, ${report.summary.fail} failed, ${report.summary.skipped} skipped. Report: ${file}`);
} finally {
  await browser.close(); await web.close(); await api.close();
}
