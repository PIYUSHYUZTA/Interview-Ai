// Candidate dashboard (docs/reference-redesign-spec.md, page 02): seeds real saved interviews through the API
// (deterministic provider, the same endpoints the app calls), then checks the dashboard in a real browser,
// in both themes, at desktop and phone widths, and writes screenshots for comparison with the reference.
//   PLAYWRIGHT_MODULE_PATH=... npx tsx scripts/verify-dashboard.ts
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ApiServer } from '../src/api/server.js';
import { DeterministicProvider } from '../src/core/provider/DeterministicProvider.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ?? 'playwright');
const { createServer } = await import('../frontend/node_modules/vite/dist/node/index.js');
const api = await new ApiServer({ provider: new DeterministicProvider(), dataDirectory: path.resolve('.browser-verification/dashboard-data') }).listen(0);
const target = `http://127.0.0.1:${api.port}`;
const vite = await createServer({ root: path.resolve('frontend'), logLevel: 'silent', server: { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/auth', '/resumes', '/interviews'].map((key) => [key, { target, changeOrigin: false }])) } });
await vite.listen();
const origin = `http://127.0.0.1:${(vite.httpServer!.address() as { port: number }).port}`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const shot = (name: string) => path.resolve(`.browser-verification/dashboard-${name}.png`);
const RESUME = `Alex Morgan
Senior Backend Engineer
alex.morgan@example.com

SUMMARY
Backend engineer with eight years building distributed payment systems in Go and TypeScript.

EXPERIENCE
Staff Engineer, Ledgerline (2021-present): led the migration of a monolith to event-driven services on Kafka and PostgreSQL; cut p99 latency by 40%.
Senior Engineer, Northwind (2017-2021): designed idempotent payment APIs, introduced contract testing and on-call runbooks.

SKILLS
Go, TypeScript, PostgreSQL, Kafka, Redis, Kubernetes, system design, observability, mentoring`;
const ANSWERS = [
  'I would start by clarifying the consistency requirement, then use an outbox table so the write and the event commit together, with idempotency keys on the consumer.',
  'I measured p99 latency per endpoint, found lock contention in the ledger table, and moved balance updates to a single-writer queue; latency fell by forty percent.',
  'I am not sure yet how I would handle that edge case.',
];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  assert.equal((await context.request.post(`${origin}/auth/register`, { data: { name: 'Alex Morgan', email: `dashboard-${Date.now()}@example.test`, password: 'DashboardCheck!2026' } })).status(), 201);
  const post = async (url: string, data?: unknown) => { const response = await context.request.post(`${origin}${url}`, data === undefined ? {} : { data }); return { ok: response.ok(), body: await response.json().catch(() => ({})) }; };
  const resume = (await post('/resumes/upload', { resumeText: RESUME, candidateName: 'Alex Morgan' })).body;
  assert.ok(resume.resumeId, 'résumé uploaded');
  // Three saved interviews in the same comparison group, with answers of varying quality.
  for (let interview = 0; interview < 3; interview++) {
    const created = (await post('/interviews', { resumeId: resume.resumeId, numRounds: 1, answerMode: 'text', questionsPerRound: 3 })).body;
    assert.ok(created.sessionId, 'interview created');
    await post(`/interviews/${created.sessionId}/start`, { proctored: false });
    for (let turn = 0; turn < 8; turn++) {
      const answered = await post(`/interviews/${created.sessionId}/answer`, { text: ANSWERS[interview === 0 ? 2 : interview === 1 ? turn % 2 : turn % 2 === 0 ? 0 : 1], elapsedSec: 60 });
      if (!answered.ok) break;
      const next = await post(`/interviews/${created.sessionId}/next-question`);
      if (!next.ok) break;
    }
    assert.ok((await post(`/interviews/${created.sessionId}/complete`)).ok, 'interview completed');
  }
  const progress = await (await context.request.get(`${origin}/interviews/progress`)).json();
  assert.equal(progress.reports.length, 3);

  const errors: string[] = [];
  for (const theme of ['dark', 'light'] as const) {
    const page = await context.newPage();
    page.on('pageerror', (error: Error) => errors.push(error.message));
    await page.addInitScript(`localStorage.setItem('interview-ai.theme', '${theme}')`);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(origin); await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await page.getByRole('heading', { name: 'Performance growth' }).waitFor();
    if (theme === 'dark') {
      assert.equal((await page.locator('.ws-kpi').first().locator('.ws-kpi-value .ds-visually-hidden').textContent())?.trim(), '3'); // CountUp's announced value
      await page.getByRole('img', { name: /^Overall score across 3 saved assessments/ }).waitFor();
      assert.equal(await page.locator('.ws-feed').getByRole('button', { name: /^Open the report for / }).count(), 3);
      assert.equal(await page.getByRole('button', { name: 'New interview', exact: true }).count(), 1); // one, in the sidebar
      const skills = page.getByRole('group', { name: 'Comparison skill' }).getByRole('button');
      await skills.last().click(); assert.equal(await skills.last().getAttribute('aria-pressed'), 'true');
      assert.ok(await page.locator('#sidebar-slot .ws-next').count() === 1, 'next best step in the sidebar card slot');
      // Candidate profile from the account; average score from completed interviews.
      await page.getByRole('region', { name: 'Candidate profile' }).getByText('Alex Morgan', { exact: true }).waitFor();
      const average = progress.reports.reduce((sum: number, r: any) => sum + r.overallScore, 0) / progress.reports.length;
      assert.equal((await page.locator('.ws-kpi').nth(1).locator('.ws-kpi-value .ds-visually-hidden').textContent())?.trim(), average.toFixed(1));
      // Skill progression, previous reports and recommended improvements, all from saved data.
      assert.equal(await page.locator('.ws-skill-row').count(), progress.currentSkills.length);
      assert.equal(await page.locator('.ws-report-row').count(), Math.min(6, progress.reports.length));
      assert.equal(await page.locator('.ws-improve-list li').count(), Math.min(3, progress.recommendations.length));
      // Chart micro-interaction: keyboard crosshair with a tooltip; Enter opens that report.
      await page.locator('.ws-chart').focus(); await page.keyboard.press('ArrowRight');
      await page.locator('.ws-tip').waitFor();
      assert.match((await page.locator('.ws-tip').textContent()) ?? '', /\/100/);
      await page.locator('.ws-chart').hover(); await page.mouse.move(900, 560);
    }
    // Accessibility: axe (WCAG 2.1 AA + best practice) on the full dashboard, in each theme.
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js', { paths: [path.dirname(process.env.PLAYWRIGHT_MODULE_PATH ?? '.'), process.cwd()] }) });
    const violations = await page.evaluate(async () => (await (window as any).axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] })).violations.map((v: any) => `${v.id}: ${v.nodes.length}`));
    assert.deepEqual(violations, [], `${theme}: axe`);
    await page.screenshot({ path: shot(`${theme}-desktop`) });
    await page.screenshot({ path: shot(`${theme}-desktop-full`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${theme}: no horizontal scroll at 390px`);
    await page.screenshot({ path: shot(`${theme}-phone`), fullPage: true });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: dashboard with 3 real saved interviews; stat tiles, growth chart, activity feed, sidebar next step; dark and light; 1440 and 390 wide; no page errors.');
} finally { await browser.close(); await vite.close(); await api.close(); }
