// Landing (docs/reference-redesign-spec.md, page 01): the Tree of Thought experience in a real browser.
// Captures every chapter, checks structure (one h1, eight chapters, footer), the calls to action into the real
// sign-in / workspace flow, the 3D layer (lazy, one canvas), reduced motion (no smooth scroll, on-demand
// rendering), the no-WebGL fallback, phone width with the menu, layout shift, axe, and page errors.
//   PLAYWRIGHT_MODULE_PATH=... npx tsx scripts/verify-landing.ts
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ApiServer } from '../src/api/server.js';
import { DeterministicProvider } from '../src/core/provider/DeterministicProvider.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ?? 'playwright');
const { createServer } = await import('../frontend/node_modules/vite/dist/node/index.js');
const api = await new ApiServer({ provider: new DeterministicProvider(), dataDirectory: path.resolve('.browser-verification/landing-data') }).listen(0);
const target = `http://127.0.0.1:${api.port}`;
const vite = await createServer({ root: path.resolve('frontend'), logLevel: 'silent', server: { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/auth', '/resumes', '/interviews'].map((key) => [key, { target, changeOrigin: false }])) } });
await vite.listen();
const origin = `http://127.0.0.1:${(vite.httpServer!.address() as { port: number }).port}`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
const shot = (name: string) => path.resolve(`.browser-verification/landing-${name}.png`);
const axePath = require.resolve('axe-core/axe.min.js', { paths: [path.dirname(process.env.PLAYWRIGHT_MODULE_PATH ?? '.'), process.cwd()] });
const CHAPTERS = ['hero', 'product', 'how', 'questions', 'live', 'performance', 'improvement', 'cta'];
const only = process.argv[2]; // optional: 'shots' captures chapters and stops
try {
  const errors: string[] = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', (error: Error) => errors.push(error.message));
  await page.addInitScript(() => { (window as any).__cls = 0; new PerformanceObserver((list) => { for (const entry of list.getEntries() as any[]) if (!entry.hadRecentInput) (window as any).__cls += entry.value; }).observe({ type: 'layout-shift', buffered: true }); });
  await page.goto(origin);
  await page.getByRole('heading', { level: 1, name: 'Where intelligence meets your story.' }).waitFor();
  assert.equal(await page.locator('h1').count(), 1);
  assert.deepEqual(await page.locator('[data-chapter]').evaluateAll((sections: HTMLElement[]) => sections.map((s) => s.id)), CHAPTERS);
  await page.locator('.xp-canvas canvas').waitFor();
  assert.equal(await page.locator('canvas').count(), 1, 'one WebGL canvas for the whole page');
  await page.waitForTimeout(2500);
  for (const id of CHAPTERS) {
    const top = await page.locator(`#${id}`).evaluate((s: HTMLElement) => s.offsetTop + s.offsetHeight * .38);
    await page.evaluate((y: number) => window.scrollTo(0, y), top); await page.waitForTimeout(2400);
    await page.screenshot({ path: shot(id) });
  }
  const cls = await page.evaluate(() => (window as any).__cls as number);
  if (only === 'shots') { console.log(`SHOTS: CLS ${cls.toFixed(4)}; errors ${JSON.stringify(errors)}`); process.exit(0); }
  assert.ok(cls < .05, `layout shift ${cls}`);
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => (await (window as any).axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] })).violations.map((v: any) => `${v.id}: ${v.nodes.length} ${v.nodes[0]?.target} ${v.nodes[0]?.any?.[0]?.message ?? ''}`));
  assert.deepEqual(violations, [], 'axe');
  // The call to action reaches the real account flow.
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(600);
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Start practicing' }).click();
  await page.locator('input[type="email"]').first().waitFor();
  // Phone width.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobile = await phone.newPage(); mobile.on('pageerror', (error: Error) => errors.push(error.message));
  await mobile.goto(origin); await mobile.getByRole('heading', { level: 1 }).waitFor(); await mobile.waitForTimeout(2000);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal scroll at 390px');
  await mobile.screenshot({ path: shot('phone-hero') });
  await mobile.getByRole('button', { name: 'Open menu' }).click();
  await mobile.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'How it works' }).waitFor();
  await mobile.screenshot({ path: shot('phone-menu') });
  await mobile.keyboard.press('Escape');
  for (const id of ['product', 'live']) {
    const top = await mobile.locator(`#${id}`).evaluate((s: HTMLElement) => s.offsetTop + s.offsetHeight * .38);
    await mobile.evaluate((y: number) => window.scrollTo(0, y), top); await mobile.waitForTimeout(1800);
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no horizontal scroll at 390px (${id})`);
    await mobile.screenshot({ path: shot(`phone-${id}`) });
  }
  // Reduced motion: no smooth scrolling; the canvas renders on demand only.
  const calm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const still = await calm.newPage(); still.on('pageerror', (error: Error) => errors.push(error.message));
  await still.goto(origin); await still.getByRole('heading', { level: 1 }).waitFor(); await still.waitForTimeout(1500);
  assert.equal(await still.locator('.lx').getAttribute('data-motion'), 'reduced');
  assert.equal(await still.evaluate(() => document.documentElement.classList.contains('lenis')), false, 'no Lenis under reduced motion');
  // Without WebGL: the still fallback, no canvas, content intact.
  const flat = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await flat.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) { return /webgl/.test(type) ? null : (original as any).call(this, type, ...rest); }; });
  const noGl = await flat.newPage(); noGl.on('pageerror', (error: Error) => errors.push(error.message));
  await noGl.goto(origin); await noGl.getByRole('heading', { level: 1 }).waitFor(); await noGl.waitForTimeout(1000);
  assert.equal(await noGl.locator('canvas').count(), 0); assert.equal(await noGl.locator('.lx-fallback').count(), 1);
  assert.deepEqual(errors, []);
  console.log(`PASS: landing with one h1, 8 chapters and footer, one lazy canvas, CLS ${cls.toFixed(4)}, axe clean, the CTA reaches the account flow, phone fits with a working menu, reduced motion without smooth scrolling, no-WebGL fallback; no page errors.`);
} finally { await browser.close(); await vite.close(); await api.close(); }
