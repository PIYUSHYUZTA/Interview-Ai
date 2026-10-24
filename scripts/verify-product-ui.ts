// Real browser + authenticated API + saved reports; deterministic evaluation, no mocked history.
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ApiServer } from '../src/api/server.js';
import { DeterministicProvider } from '../src/core/provider/DeterministicProvider.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ?? 'C:/Users/piyus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { createServer } = await import('../frontend/node_modules/vite/dist/node/index.js');
const apiOptions = { provider: new DeterministicProvider(), dataDirectory: path.resolve(process.env.VERIFICATION_DATA_DIR ?? '.browser-verification/product-ui-data') };
let running = await new ApiServer(apiOptions).listen(0);
const target = `http://127.0.0.1:${running.port}`;
const vite = await createServer({ root: path.resolve('frontend'), server: { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/auth', '/resumes', '/interviews'].map((key) => [key, { target, changeOrigin: false }])) } });
await vite.listen();
const origin = `http://127.0.0.1:${(vite.httpServer!.address() as { port: number }).port}`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  assert.equal((await context.request.post(`${origin}/auth/register`, { data: { name: 'Progress verification', email: `progress-${Date.now()}@example.test`, password: 'BrowserTestPass!2026' } })).status(), 201);
  const page = await context.newPage(); const errors: string[] = [];
  page.on('pageerror', (error: Error) => errors.push(error.message));
  await page.goto(origin); await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByRole('heading', { name: 'Progress over time' }).waitFor();
  await page.locator('.skip-link').focus();
  assert.equal(await page.locator('.skip-link').evaluate((e: HTMLElement) => e === document.activeElement), true);
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#candidate-main').evaluate((e: HTMLElement) => e === document.activeElement), true);
  assert.equal(await page.locator('.page').evaluate((e: HTMLElement) => getComputedStyle(e).animationName), 'none');
  const sessions: string[] = [];
  for (let iteration = 0; iteration < 2; iteration++) {
    await page.getByRole('button', { name: 'New interview', exact: true }).click();
    if (!iteration) {
      await page.getByRole('button', { name: 'Use sample resume' }).click();
      await page.getByRole('button', { name: 'Analyze resume', exact: true }).click();
    }
    await page.getByText('Ready for your review', { exact: true }).waitFor();
    if (!iteration) {
      await page.screenshot({ path: path.resolve('.browser-verification/phase8-resume.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.setViewportSize({ width: 1440, height: 1050 });
    }
    await page.getByRole('button', { name: /Confirm .*continue/ }).click();
    await page.getByLabel('Rounds', { exact: true }).selectOption('1');
    await page.getByLabel('Questions per round').selectOption('2');
    const creation = page.waitForResponse((r: any) => r.url().endsWith('/interviews') && r.request().method() === 'POST' && r.status() === 201);
    await page.getByRole('button', { name: 'Build my interview plan' }).click();
    sessions.push((await (await creation).json()).sessionId);
    await page.getByRole('button', { name: 'Enter interview room' }).click();
    await page.getByRole('switch', { name: 'Read each question aloud' }).uncheck();
    await page.getByRole('button', { name: 'Start interview', exact: true }).click();
    if (!iteration) {
      await page.getByRole('textbox', { name: /Live transcript/ }).waitFor();
      await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
      await page.screenshot({ path: path.resolve('.browser-verification/phase8-room.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.resolve('.browser-verification/phase8-room-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1050 });
    }
    for (let answer = 0; answer < 2; answer++) {
      await page.getByRole('textbox', { name: /Live transcript/ }).fill('I do not know how to explain the mechanism yet.');
      await page.getByRole('button', { name: 'Submit answer', exact: true }).click();
      await page.getByText('Answer reviewed', { exact: true }).waitFor();
      if (!answer) await page.getByRole('button', { name: 'Next question', exact: true }).click();
    }
    await page.getByRole('button', { name: 'View my assessment', exact: true }).click();
    await page.getByRole('heading', { name: 'Difficulty progression', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await page.getByRole('heading', { name: 'Progress over time' }).waitFor();
  }
  await page.getByRole('img', { name: 'Saved overall scores from zero to one hundred, oldest to newest' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Open report', exact: true }).count(), 2);
  const measure = page.getByLabel('Progress measure');
  const skill = await measure.locator('option').nth(1).getAttribute('value');
  await measure.selectOption(skill!);
  await page.getByRole('img', { name: /scores from zero to ten/ }).waitFor();
  await measure.selectOption('overall');
  const progress = await (await context.request.get(`${origin}/interviews/progress`)).json();
  assert.deepEqual(progress.reports.map((r: any) => r.sessionId), sessions);
  assert.ok(progress.repeatedWeaknesses.length > 0);
  await page.screenshot({ path: path.resolve('.browser-verification/phase8-dashboard.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.resolve('.browser-verification/phase8-dashboard-mobile.png'), fullPage: true });
  const port = running.port; await running.close(); running = await new ApiServer(apiOptions).listen(port);
  assert.deepEqual(await (await context.request.get(`${origin}/interviews/progress`)).json(), progress);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto(origin); await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Open report', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Difficulty progression', exact: true }).waitFor();
  await page.screenshot({ path: path.resolve('.browser-verification/phase8-report.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.resolve('.browser-verification/phase8-report-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: complete candidate flow; keyboard skip link; reduced motion; overall/skill chart controls; desktop and mobile setup, room, dashboard and report fit; real saved reports persist; no page errors. Deterministic provider only.');
} finally { await browser.close(); await vite.close(); await running.close(); }
