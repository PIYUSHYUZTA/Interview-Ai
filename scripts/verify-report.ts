// Intelligence report (docs/reference-redesign-spec.md, page 05): seeds a real saved interview through the API
// (deterministic provider), opens its report in a real browser and checks the analytics canvas, the 3D neural
// map, keyboard access to every answer, both themes, desktop and phone width, and axe.
//   PLAYWRIGHT_MODULE_PATH=... npx tsx scripts/verify-report.ts
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ApiServer } from '../src/api/server.js';
import { DeterministicProvider } from '../src/core/provider/DeterministicProvider.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ?? 'playwright');
const { createServer } = await import('../frontend/node_modules/vite/dist/node/index.js');
const api = await new ApiServer({ provider: new DeterministicProvider(), dataDirectory: path.resolve('.browser-verification/report-data') }).listen(0);
const target = `http://127.0.0.1:${api.port}`;
const vite = await createServer({ root: path.resolve('frontend'), logLevel: 'silent', server: { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/auth', '/resumes', '/interviews'].map((key) => [key, { target, changeOrigin: false }])) } });
await vite.listen();
const origin = `http://127.0.0.1:${(vite.httpServer!.address() as { port: number }).port}`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const shot = (name: string) => path.resolve(`.browser-verification/report-${name}.png`);
const RESUME = 'Alex Morgan\nSenior Backend Engineer\n\nEXPERIENCE\nStaff Engineer, Ledgerline: led the migration to event-driven services on Kafka and PostgreSQL; cut p99 latency by 40%.\n\nSKILLS\nGo, TypeScript, PostgreSQL, Kafka, Redis, Kubernetes, system design';
const ANSWERS = [
  'I would clarify the consistency requirement, then use an outbox table so the write and the event commit together, with idempotency keys on the consumer and a retry with backoff.',
  'I measured p99 latency per endpoint, found lock contention in the ledger table, and moved balance updates to a single-writer queue; latency fell by forty percent.',
  'I am not sure yet how I would handle that.',
];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  assert.equal((await context.request.post(`${origin}/auth/register`, { data: { name: 'Alex Morgan', email: `report-${Date.now()}@example.test`, password: 'ReportCheck!2026' } })).status(), 201);
  const post = async (url: string, data?: unknown) => { const r = await context.request.post(`${origin}${url}`, data === undefined ? {} : { data }); return { ok: r.ok(), body: await r.json().catch(() => ({})) }; };
  const resume = (await post('/resumes/upload', { resumeText: RESUME, candidateName: 'Alex Morgan' })).body;
  const created = (await post('/interviews', { resumeId: resume.resumeId, numRounds: 2, answerMode: 'text', questionsPerRound: 4 })).body;
  await post(`/interviews/${created.sessionId}/start`, { proctored: false });
  for (let turn = 0; turn < 12; turn++) {
    if (!(await post(`/interviews/${created.sessionId}/answer`, { text: ANSWERS[turn % ANSWERS.length], elapsedSec: 70 })).ok) break;
    if (!(await post(`/interviews/${created.sessionId}/next-question`)).ok) break;
  }
  assert.ok((await post(`/interviews/${created.sessionId}/complete`)).ok);
  const results = await (await context.request.get(`${origin}/interviews/${created.sessionId}/results`)).json();
  const errors: string[] = [];
  for (const theme of ['dark', 'light'] as const) {
    const page = await context.newPage();
    page.on('pageerror', (error: Error) => errors.push(error.message));
    await page.addInitScript(`localStorage.setItem('interview-ai.theme', '${theme}')`);
    await page.goto(origin); await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByRole('button', { name: /^Open the report for / }).first().click();
    await page.getByRole('heading', { name: 'Your thinking, mapped' }).waitFor();
    await page.locator('.rp-map-canvas canvas').waitFor();
    await page.waitForTimeout(1500);
    if (theme === 'dark') {
      // Every answer is a keyboard-reachable bar that names its score and opens the scored answer.
      const bars = page.locator('.rp-bars a');
      assert.equal(await bars.count(), results.evidence.length);
      await bars.first().focus();
      assert.match((await page.locator('.rp-map-tip').textContent()) ?? '', /\/10/);
      assert.equal(await page.getByRole('img', { name: /^Overall: / }).count(), 1);
      assert.equal(await page.locator('.rp-bubbles li').count(), Object.keys(results.skillMap).length);
      await page.getByRole('heading', { name: 'Difficulty progression', exact: true }).waitFor(); // the detailed sections remain
    }
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js', { paths: [path.dirname(process.env.PLAYWRIGHT_MODULE_PATH ?? '.'), process.cwd()] }) });
    const violations = await page.evaluate(async () => (await (window as any).axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] })).violations.map((v: any) => `${v.id}: ${v.nodes.length} ${v.nodes[0]?.target}`));
    assert.deepEqual(violations, [], `${theme}: axe`);
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
    await page.screenshot({ path: shot(`${theme}-desktop`) });
    await page.screenshot({ path: shot(`${theme}-desktop-full`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${theme}: no horizontal scroll at 390px`);
    await page.screenshot({ path: shot(`${theme}-phone`), fullPage: true });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: report for a real saved interview (${results.evidence.length} answers): gauges, metrics, component donut, 3D neural map, skill bubbles, keyboard histogram linked to the map, detailed sections kept; dark and light; 1440 and 390 wide; axe clean; no page errors.`);
} finally { await browser.close(); await vite.close(); await api.close(); }
