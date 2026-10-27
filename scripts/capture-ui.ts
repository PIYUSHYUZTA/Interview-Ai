// Captures the main product screens (landing, workspace, interview setup, interview room) from the
// production build, for before/after comparison when the design system changes.
//   npx tsx scripts/capture-ui.ts <label>     -> .browser-verification/ui-<label>-<screen>.png
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ApiServer } from '../src/api/server.js';
import { DeterministicProvider } from '../src/core/provider/DeterministicProvider.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ?? 'playwright');
const { preview } = await import(pathToFileURL(path.resolve('frontend/node_modules/vite/dist/node/index.js')).href);
const label = process.argv[2] ?? 'current';
const api = await new ApiServer({ provider: new DeterministicProvider(), dataDirectory: path.resolve('.browser-verification/capture-ui-data') }).listen(0);
const web = await preview({ root: path.resolve('frontend'), preview: { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/auth','/interviews','/resumes'].map((key) => [key, { target: `http://127.0.0.1:${api.port}`, changeOrigin: false }])) } });
const base = `http://127.0.0.1:${(web.httpServer!.address() as { port: number }).port}`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'] });
const shot = (name: string) => path.resolve(`.browser-verification/ui-${label}-${name}.png`);
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', permissions: ['camera', 'microphone'] });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  await page.goto(base); await page.waitForTimeout(1500);
  await page.screenshot({ path: shot('landing') });
  assert.equal((await context.request.post(`${base}/auth/register`, { data: { name: 'Alex Morgan', email: `capture-${Date.now()}@example.test`, password: `Capture-${Date.now()}-UI!` } })).status(), 201);
  await page.goto(base); await page.getByRole('button', { name: 'Workspace', exact: true }).click(); await page.waitForTimeout(800);
  await page.screenshot({ path: shot('workspace') });
  await page.getByRole('button', { name: 'New interview', exact: true }).click(); await page.waitForTimeout(600);
  await page.screenshot({ path: shot('setup') });
  await page.getByRole('button', { name: 'Use sample resume' }).click(); await page.getByRole('button', { name: 'Analyze resume', exact: true }).click();
  await page.getByRole('button', { name: /Confirm .*continue/ }).click(); await page.getByLabel('Rounds', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Build my interview plan' }).click();
  await page.getByRole('button', { name: 'Enter interview room', exact: true }).click(); await page.waitForTimeout(2500);
  await page.screenshot({ path: shot('room') });
  const fonts = await page.evaluate(() => ({ body: getComputedStyle(document.body).fontFamily, heading: getComputedStyle(document.querySelector('h1, h2') ?? document.body).fontFamily,
    loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family).filter((v, i, a) => a.indexOf(v) === i) }));
  console.log(JSON.stringify({ label, fonts }, null, 2));
} finally {
  await browser.close(); await web.close(); await api.close();
}
