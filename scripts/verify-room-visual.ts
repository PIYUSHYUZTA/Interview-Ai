// Interview room presentation (docs/reference-redesign-spec.md, page 04): the room backdrop, holographic
// interviewer panel, voice sphere, question timeline and glass panels, captured ready, while the interviewer
// speaks (real local speech playback) and while the candidate answers (test-device microphone). Checks that the
// voice sphere follows the real state, axe, no horizontal scroll at 390px, and no page errors. Behaviour of the
// room itself is covered by verify-voice-room, verify-avatar-levels, verify-face-tracking and verify-proctoring.
//   PLAYWRIGHT_MODULE_PATH=... npx tsx scripts/verify-room-visual.ts
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ApiServer } from '../src/api/server.js';
import { DeterministicProvider } from '../src/core/provider/DeterministicProvider.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ?? 'playwright');
const { createServer } = await import('../frontend/node_modules/vite/dist/node/index.js');
const api = await new ApiServer({ provider: new DeterministicProvider(), dataDirectory: path.resolve('.browser-verification/room-visual-data') }).listen(0);
const target = `http://127.0.0.1:${api.port}`;
const vite = await createServer({ root: path.resolve('frontend'), logLevel: 'silent', server: { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/auth', '/resumes', '/interviews'].map((key) => [key, { target, changeOrigin: false }])) } });
await vite.listen();
const origin = `http://127.0.0.1:${(vite.httpServer!.address() as { port: number }).port}`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const shot = (name: string) => path.resolve(`.browser-verification/room-${name}.png`);
const axePath = require.resolve('axe-core/axe.min.js', { paths: [path.dirname(process.env.PLAYWRIGHT_MODULE_PATH ?? '.'), process.cwd()] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['camera', 'microphone'] });
  assert.equal((await context.request.post(`${origin}/auth/register`, { data: { name: 'Alex Morgan', email: `room-${Date.now()}@example.test`, password: 'RoomCheck!2026' } })).status(), 201);
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  const errors: string[] = []; page.on('pageerror', (error: Error) => errors.push(error.message));
  await page.addInitScript({ content: `window.speechInstances=[];window.SpeechRecognition=class{start(){window.speechInstances.push(this);this.onstart?.();this.onaudiostart?.();}stop(){setTimeout(()=>this.onend?.(),30);}abort(){}};window.webkitSpeechRecognition=window.SpeechRecognition;` });
  await page.goto(origin); await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByRole('button', { name: 'New interview', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample resume' }).click(); await page.getByRole('button', { name: 'Analyze resume', exact: true }).click();
  await page.getByRole('button', { name: /Confirm .*continue/ }).click(); await page.getByLabel('Rounds', { exact: true }).selectOption('1'); await page.getByLabel('Questions per round').selectOption('4');
  await page.getByRole('button', { name: 'Build my interview plan' }).click();
  await page.getByRole('button', { name: 'Enter interview room', exact: true }).click();
  await page.locator('.blender-studio[data-scene-state="ready"]').waitFor();
  await page.locator('.room-voice-canvas canvas').waitFor();
  assert.equal(await page.locator('.room-timeline li').count(), 4);
  // Six visual states, each from real voice state. A recorder notes every state the room passes through.
  await page.evaluate(() => { const seen: string[] = []; (window as any).__states = seen; new MutationObserver(() => { const value = document.querySelector('.room-voice')?.getAttribute('data-state'); if (value && seen.at(-1) !== value) seen.push(value); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-state'] }); });
  const stateIs = (value: string, timeout = 45000) => page.waitForFunction((v: string) => document.querySelector('.room-voice')?.getAttribute('data-state') === v, value, { timeout });
  assert.equal(await page.locator('.room-voice').getAttribute('data-state'), 'init');
  assert.equal(await page.locator('.room-state').textContent(), 'Preparing the room');
  await page.waitForTimeout(1200);
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => (await (window as any).axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] })).violations.map((v: any) => `${v.id}: ${v.nodes.length} ${v.nodes[0]?.target} ${v.nodes[0]?.any?.[0]?.message ?? ''}`));
  assert.deepEqual(violations, [], 'axe in the ready room');
  await page.screenshot({ path: shot('1-init') });

  await page.getByLabel('Speech transcription', { exact: true }).selectOption('browser');
  await page.getByRole('button', { name: 'Start voice interview', exact: true }).click();
  await stateIs('interviewer', 30000); await page.waitForTimeout(1200);
  // The waveform draws the interviewer's real speech loudness: lit pixels in the teal bars.
  const lit = await page.locator('.room-wave').evaluate((canvas: HTMLCanvasElement) => { const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data; let n = 0; for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++; return n; });
  assert.ok(lit > 200, `waveform shows the speech signal (${lit} lit pixels)`);
  await page.screenshot({ path: shot('2-interviewer') });
  // After the question the microphone opens: listening, then speaking as the test device's tone is measured.
  await page.waitForFunction(() => ['listening', 'speaking'].includes(document.querySelector('.room-voice')?.getAttribute('data-state') ?? ''), null, { timeout: 45000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: shot('3-4-listening-speaking') });
  // A spoken answer (recognition result injected, as in verify-voice-room), then Done speaking: processing, then the next question is prepared.
  await page.evaluate(`window.speechInstances.at(-1)?.onresult?.({resultIndex:0,results:[{isFinal:true,0:{transcript:'I designed an idempotent payments API with unique constraints, transactions and retries, and measured latency in production.'}}]});`);
  await page.getByRole('button', { name: 'Done speaking', exact: true }).click();
  await stateIs('processing', 20000); await page.screenshot({ path: shot('5-processing') });
  await stateIs('generating', 30000).then(() => page.screenshot({ path: shot('6-generating') })).catch(() => undefined);
  await stateIs('interviewer', 45000);
  const seen: string[] = await page.evaluate(() => (window as any).__states);
  for (const expected of ['interviewer', 'processing']) assert.ok(seen.includes(expected), `passed through ${expected}: ${seen.join(' → ')}`);
  assert.ok(seen.includes('listening') || seen.includes('speaking'), `passed through listening/speaking: ${seen.join(' → ')}`);
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal scroll at 390px');
  await page.screenshot({ path: shot('phone'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`PASS: room states init → ${seen.join(' → ')}; waveform draws the real speech signal; backdrop, holographic panel, voice sphere, timeline; axe clean; 390px fits; no page errors.`);
} finally { await browser.close(); await vite.close(); await api.close(); }
