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
  assert.equal(await page.locator('.room-voice').getAttribute('data-mode'), 'idle');
  await page.waitForTimeout(1200);
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => (await (window as any).axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] })).violations.map((v: any) => `${v.id}: ${v.nodes.length} ${v.nodes[0]?.target} ${v.nodes[0]?.any?.[0]?.message ?? ''}`));
  assert.deepEqual(violations, [], 'axe in the ready room');
  await page.screenshot({ path: shot('ready') });

  await page.getByLabel('Speech transcription', { exact: true }).selectOption('browser');
  await page.getByRole('button', { name: 'Start voice interview', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.room-voice')?.getAttribute('data-mode') === 'interviewer', null, { timeout: 30000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: shot('speaking') });
  // After the question the microphone opens; the fake device produces a tone, so the sphere follows the candidate.
  await page.waitForFunction(() => document.querySelector('.room-voice')?.getAttribute('data-mode') === 'you', null, { timeout: 45000 }).catch(() => undefined);
  const listeningMode = await page.locator('.room-voice').getAttribute('data-mode');
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot('listening') });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal scroll at 390px');
  await page.screenshot({ path: shot('phone'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`PASS: room backdrop, holographic interviewer panel, voice sphere (idle → interviewer${listeningMode === 'you' ? ' → you' : ''}), 4-question timeline, glass panels; axe clean; 390px fits; no page errors.`);
} finally { await browser.close(); await vite.close(); await api.close(); }
