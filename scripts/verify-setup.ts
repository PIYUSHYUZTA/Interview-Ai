// Interview setup (docs/reference-redesign-spec.md, page 03): drives the real three-stage setup in a browser
// (sample résumé → analysed profile → preferences → generated plan → interview room), with the deterministic
// provider. Checks the panel layout, the 3D stage discs, both themes, desktop and phone width, and axe at every stage.
//   PLAYWRIGHT_MODULE_PATH=... npx tsx scripts/verify-setup.ts
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ApiServer } from '../src/api/server.js';
import { DeterministicProvider } from '../src/core/provider/DeterministicProvider.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ?? 'playwright');
const { createServer } = await import('../frontend/node_modules/vite/dist/node/index.js');
const api = await new ApiServer({ provider: new DeterministicProvider(), dataDirectory: path.resolve('.browser-verification/setup-data') }).listen(0);
const target = `http://127.0.0.1:${api.port}`;
const vite = await createServer({ root: path.resolve('frontend'), logLevel: 'silent', server: { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/auth', '/resumes', '/interviews'].map((key) => [key, { target, changeOrigin: false }])) } });
await vite.listen();
const origin = `http://127.0.0.1:${(vite.httpServer!.address() as { port: number }).port}`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const shot = (name: string) => path.resolve(`.browser-verification/setup-${name}.png`);
const axePath = require.resolve('axe-core/axe.min.js', { paths: [path.dirname(process.env.PLAYWRIGHT_MODULE_PATH ?? '.'), process.cwd()] });
try {
  const errors: string[] = [];
  for (const theme of ['dark', 'light'] as const) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['camera', 'microphone'] });
    await context.addInitScript(`localStorage.setItem('interview-ai.theme', '${theme}')`);
    assert.equal((await context.request.post(`${origin}/auth/register`, { data: { name: 'Alex Morgan', email: `setup-${theme}-${Date.now()}@example.test`, password: 'SetupCheck!2026' } })).status(), 201);
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', (error: Error) => errors.push(error.message));
    const check = async (stage: string) => {
      await page.waitForTimeout(1200);
      assert.equal(await page.locator('.su-panel').count(), 1, `${stage}: one panel`);
      if (theme === 'dark') await page.locator('.su-discs-canvas canvas').waitFor();
      await page.addScriptTag({ path: axePath });
      const violations = await page.evaluate(async () => (await (window as any).axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] })).violations.map((v: any) => `${v.id}: ${v.nodes.length} ${v.nodes[0]?.target}`));
      assert.deepEqual(violations, [], `${theme} ${stage}: axe`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: shot(`${theme}-${stage}`) });
      await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${theme} ${stage}: no horizontal scroll at 390px`);
      if (stage === 'profile' || stage === 'plan') await page.screenshot({ path: shot(`${theme}-${stage}-phone`), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 900 });
    };
    await page.goto(origin); await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByRole('button', { name: 'New interview', exact: true }).click();
    await page.getByRole('heading', { name: 'Make practice personal.' }).waitFor();
    await check('start');
    await page.getByRole('button', { name: 'Use sample resume' }).click();
    await page.getByRole('button', { name: 'Analyze resume', exact: true }).click();
    await page.getByText('Ready for your review', { exact: true }).waitFor();
    await check('profile');
    await page.getByRole('button', { name: /Confirm .*continue/ }).click();
    await page.getByLabel('Rounds', { exact: true }).selectOption('1');
    await check('preferences');
    await page.getByRole('button', { name: 'Build my interview plan' }).click();
    await page.getByRole('heading', { name: 'Your interview, mapped out.' }).waitFor();
    await check('plan');
    await page.getByRole('button', { name: 'Enter interview room', exact: true }).click();
    await page.locator('.immersive-host').waitFor(); // the room opens; its own verifiers cover it
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: setup flow sample résumé → profile → preferences → plan → room; panel + 3D stage discs; dark and light; 1440 and 390 wide; axe clean at every stage; no page errors.');
} finally { await browser.close(); await vite.close(); await api.close(); }
