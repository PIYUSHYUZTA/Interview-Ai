// End-to-end trace of the camera pipeline, with nothing mocked between the browser and Python:
//   browser getUserMedia (permission-based; the stream is a controllable canvas fixture, not a live webcam)
//   -> <video> preview -> canvas -> JPEG (toBlob) -> POST /interviews/:id/proctoring-frame (existing HTTP API)
//   -> Node API -> ProctoringWorker (JSON lines over stdin/stdout) -> Python worker.py (OpenCV decode, MediaPipe)
//   -> VisionIntegrityEngine -> JSON response -> React monitoring indicators.
// Checks: frames reach Python; JPEG format and dimensions match end to end; results update continuously;
// the UI shows what Python returned; audio and video keep playing; errors are logged; tracking recovers.
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

// Server log capture: every [vision] line the API prints.
const serverLog: string[] = [];
for (const level of ['info', 'warn', 'error'] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => { const line = args.map(String).join(' '); if (line.startsWith('[vision]')) serverLog.push(`${level}: ${line}`); original(...args); };
}

/** Width/height from a JPEG's SOF marker: what any decoder would see. */
function jpegSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < bytes.length;) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1], length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
    i += 2 + length;
  }
  return null;
}

const apiServer = new ApiServer({ provider: new DeterministicProvider(), dataDirectory: path.resolve('.browser-verification/vision-pipeline-data') });
const api = await apiServer.listen(0);
const web = await preview({ root: path.resolve('frontend'), preview: { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/auth','/interviews','/resumes'].map((key) => [key, { target: `http://127.0.0.1:${api.port}`, changeOrigin: false }])) } });
const base = `http://127.0.0.1:${(web.httpServer!.address() as { port: number }).port}`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
const results: Record<string, unknown> = {};
try {
  const context = await browser.newContext({ permissions: ['camera','microphone'], viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  assert.equal((await context.request.post(`${base}/auth/register`, { data: { name: 'Pipeline verifier', email: `pipeline-${Date.now()}@example.test`, password: `Pipe-${Date.now()}-Verify!` } })).status(), 201);
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  const errors: string[] = []; page.on('pageerror', (error: Error) => errors.push(error.message));
  // Every frame request and its response, paired.
  type Exchange = { at: number; sent?: { width: number; height: number; bytes: number; jpeg: boolean }; status?: number; observation?: any };
  const exchanges = new Map<any, Exchange>(); const done: Exchange[] = [];
  page.on('request', (request: any) => {
    if (!/\/proctoring-frame$/.test(request.url())) return;
    const image = Buffer.from(JSON.parse(request.postData() ?? '{}').image ?? '', 'base64');
    const size = jpegSize(image);
    exchanges.set(request, { at: Date.now(), sent: size ? { ...size, bytes: image.length, jpeg: true } : { width: 0, height: 0, bytes: image.length, jpeg: false } });
  });
  page.on('response', async (response: any) => {
    const exchange = exchanges.get(response.request()); if (!exchange) return;
    exchange.status = response.status();
    exchange.observation = (await response.json().catch(() => ({}))).observation;
    done.push(exchange);
  });
  // Media continuity probes: long main-thread tasks, animation-frame gaps, and playing <audio> progress.
  await page.addInitScript({ content: `
    window.SpeechRecognition=class{start(){this.onstart?.();}stop(){setTimeout(()=>this.onend?.(),30);}abort(){}};
    window.__probe={longTasks:[],gaps:[],audio:[]};
    try{new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__probe.longTasks.push(Math.round(e.duration)))).observe({type:'longtask',buffered:true});}catch(e){}
    let last=performance.now();const tick=t=>{window.__probe.gaps.push(t-last);last=t;requestAnimationFrame(tick);};requestAnimationFrame(tick);
    const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(this instanceof HTMLAudioElement&&!window.__probe.audio.includes(this))window.__probe.audio.push(this);return play.apply(this,arguments);};
  ` });
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
  const badge = () => page.evaluate(() => document.querySelector('.camera-preview > small[role="status"]')?.textContent ?? '');
  const statusLine = () => page.evaluate(() => [...document.querySelectorAll('p')].map(p => p.textContent ?? '').find(t => /^(Connected ·|Visual analysis unavailable|Analyzing sampled frame|Waiting for an active camera frame)/.test(t)) ?? '');
  const setMode = (mode: string) => page.evaluate((m) => { (window as any).fixtureImageMode = m; }, mode);

  // 1–2. Frames reach Python intact: the JPEG the browser sent is the image Python decoded.
  await page.waitForTimeout(8000);
  const window1 = done.filter(e => e.status === 200 && e.observation);
  assert.ok(window1.length >= 10, `expected continuous samples, got ${window1.length}`);
  const video = await page.evaluate(() => { const v = document.querySelector('video[aria-label="Local camera preview"]') as HTMLVideoElement; return { width: v.videoWidth, height: v.videoHeight }; });
  for (const e of window1) {
    assert.ok(e.sent!.jpeg, 'sample must be a JPEG');
    assert.deepEqual({ width: e.observation.frame.width, height: e.observation.frame.height, bytes: e.observation.frame.bytes }, { width: e.sent!.width, height: e.sent!.height, bytes: e.sent!.bytes }, 'Python decoded a different image than was sent');
    const scale = Math.min(1, 640 / Math.max(video.width, video.height));
    assert.deepEqual([e.sent!.width, e.sent!.height], [Math.round(video.width * scale), Math.round(video.height * scale)], 'sample size must follow the camera size, bounded to 640 px');
  }
  const transport = await page.evaluate(() => (document.querySelector('.vision-transport') as HTMLElement | null)?.dataset.match ?? null);
  assert.equal(transport, 'true', 'the room\'s transport check should report a match');
  const processing = window1.map(e => e.observation.frame.processingMs).sort((a, b) => a - b);
  results.framesReachPython = `${window1.length} samples in 8 s; camera ${video.width}×${video.height} → every sample a JPEG of ${window1[0].sent!.width}×${window1[0].sent!.height}, ${Math.round(window1[0].sent!.bytes / 1024)} KB; Python decoded the identical size and byte count for all; Python analysis median ${processing[Math.floor(processing.length / 2)]} ms`;

  // 3. Continuous updates.
  const gaps = window1.slice(1).map((e, i) => e.at - window1[i].at);
  assert.ok(Math.max(...gaps) < 2000, `results stalled for ${Math.max(...gaps)} ms`);
  results.continuous = `${(window1.length / 8).toFixed(1)} results/s, longest gap between results ${Math.max(...gaps)} ms`;

  // 4. Genuine results shown: change what the camera sees and the UI follows Python's answer for that image.
  const scenes: [string, RegExp, (o: any) => boolean][] = [
    ['two', /^2 faces in view/, (o) => o.faceCount === 2 && o.faceTracks.length === 2],
    ['blank', /^(No face in view|Face lost)/, (o) => o.faceCount === 0],
    ['portrait', /^Face detected/, (o) => o.faceCount === 1 && o.faceTracks[0].landmarks.length > 0],
  ];
  const shown: string[] = [];
  for (const [mode, pattern, check] of scenes) {
    const from = done.length; await setMode(mode);
    await page.waitForFunction((p) => new RegExp(p).test(document.querySelector('.camera-preview > small[role="status"]')?.textContent ?? ''), pattern.source, { timeout: 15000 });
    // The page may render a result before this listener has finished reading the same response body.
    let matching: Exchange[] = [];
    for (let waited = 0; waited < 3000 && !(matching = done.slice(from).filter(e => e.observation && check(e.observation))).length; waited += 100) await page.waitForTimeout(100);
    assert.ok(matching.length >= 1, `Python never returned the ${mode} result`);
    const overlayFaces = await page.locator('.vision-overlay .face-track').count();
    assert.equal(overlayFaces, matching.at(-1)!.observation.faceTracks.length, 'overlay must draw the face tracks Python returned');
    shown.push(`${mode}: Python faceCount ${matching.at(-1)!.observation.faceCount} → badge "${await badge()}", ${overlayFaces} face track(s) drawn`);
  }
  results.genuineResults = shown;

  // 5. No freeze: preview video and interviewer audio keep time while sampling; main-thread stalls measured.
  const media = await page.evaluate(async () => {
    const v = document.querySelector('video[aria-label="Local camera preview"]') as HTMLVideoElement;
    const probe = (window as any).__probe; probe.gaps.length = 0; probe.longTasks.length = 0;
    const audio = (probe.audio as HTMLAudioElement[]).filter(a => !a.paused && !a.ended);
    const t0 = performance.now(), v0 = v.currentTime, a0 = audio.map(a => a.currentTime);
    await new Promise(r => setTimeout(r, 5000));
    const wall = (performance.now() - t0) / 1000;
    return { wall, video: (v.currentTime - v0) / wall, audio: audio.map((a, i) => a.paused ? null : (a.currentTime - a0[i]) / wall), audioElements: probe.audio.length,
      maxGap: Math.round(Math.max(...probe.gaps)), p95Gap: Math.round([...probe.gaps].sort((x: number, y: number) => x - y)[Math.floor(probe.gaps.length * .95)]), longTasks: [...probe.longTasks] };
  });
  const samplesDuring = done.filter(e => e.at >= Date.now() - 5500).length;
  assert.ok(media.video > .9, `camera preview advanced only ${media.video.toFixed(2)} s per second`);
  for (const rate of media.audio.filter((r: number | null) => r !== null)) assert.ok(rate! > .9, `interviewer audio advanced only ${rate!.toFixed(2)} s per second`);
  assert.ok(media.maxGap < 500, `main thread stalled ${media.maxGap} ms`);
  results.noFreeze = `${samplesDuring} samples during 5 s: preview video ${media.video.toFixed(2)}× real time; interviewer audio ${media.audio.length ? media.audio.map((r: number | null) => r === null ? 'ended' : `${r!.toFixed(2)}×`).join(', ') : `not playing at that moment (${media.audioElements} played earlier)`}; animation frames p95 ${media.p95Gap} ms, worst ${media.maxGap} ms; long tasks ${media.longTasks.length ? media.longTasks.join(', ') + ' ms' : 'none'}`;

  // 6. Errors are logged clearly, and analysis recovers by itself: kill the real Python process.
  const worker = () => (apiServer as any).vision;
  const waitFor = async (condition: () => boolean, what: string, ms = 30000) => {
    const started = Date.now();
    while (!condition()) { assert.ok(Date.now() - started < ms, `timed out waiting for ${what}`); await new Promise(r => setTimeout(r, 20)); }
    return Date.now() - started;
  };
  // 6a. Killed between samples: the exit is logged and the next sample starts a fresh process; nothing is lost.
  await waitFor(() => !worker().busy && !!worker().child, 'an idle worker');
  const idlePid = worker().child.pid; let mark = done.length, logMark = serverLog.length;
  worker().child.kill();
  await waitFor(() => done.slice(mark).filter(e => e.status === 200).length >= 3, 'samples after an idle kill');
  const idle = { killedPid: idlePid, restartedPid: worker().child?.pid, statuses: done.slice(mark).map(e => e.status), log: serverLog.slice(logMark) };
  assert.ok(idle.log.some(l => l.includes('Python worker stopped (terminated by')), 'idle exit should be logged');
  assert.ok(idle.statuses.every(s => s === 200) && idle.restartedPid && idle.restartedPid !== idlePid, 'next sample should run on a fresh process');
  // 6b. Killed while a frame is inside Python: that sample fails (503, no warning), it is logged, the room says it is
  // retrying, and the following sample recovers on a fresh process.
  mark = done.length; logMark = serverLog.length;
  const retryShown = page.waitForFunction(() => [...document.querySelectorAll('p')].some(p => /^Visual analysis unavailable · retrying/.test(p.textContent ?? '')), undefined, { timeout: 20000, polling: 20 }).then(() => true).catch(() => false);
  await waitFor(() => worker().busy && !!worker().pending, 'a frame inside Python');
  const busyPid = worker().child.pid;
  worker().child.kill();
  const recoveredIn = await waitFor(() => { const tail = done.slice(mark), fail = tail.findIndex(e => e.status !== 200); return fail >= 0 && tail.slice(fail + 1).some(e => e.status === 200 && e.observation?.faceCount === 1); }, 'failure then recovery');
  await page.waitForFunction(() => /^Face detected/.test(document.querySelector('.camera-preview > small[role="status"]')?.textContent ?? ''), undefined, { timeout: 15000 });
  const busy = { killedPid: busyPid, restartedPid: worker().child?.pid, statuses: done.slice(mark).map(e => e.status), log: serverLog.slice(logMark) };
  assert.ok(busy.statuses.includes(503), `the in-flight sample should fail with 503, got ${busy.statuses.join(',')}`);
  assert.ok(busy.log.some(l => l.includes('Python worker stopped')) && busy.log.some(l => l.includes('Frame analysis failed')) && busy.log.some(l => l.includes('Frame analysis recovered')), `expected stopped/failed/recovered logs, got: ${busy.log.join(' | ')}`);
  const sm = await (apiServer as any).store.load([...exchanges.keys()][0].url().split('/').at(-2));
  assert.equal(sm.toPublicState().integrity.warningCount, 0, 'a crashed worker must never add a warning');
  results.errorsAndRecovery = {
    killedWhileIdle: `pid ${idle.killedPid} → ${idle.restartedPid}; samples after: ${idle.statuses.join(',')}; log: ${idle.log.join(' | ')}`,
    killedMidFrame: `pid ${busy.killedPid} → ${busy.restartedPid}; samples after: ${busy.statuses.join(',')}; recovered in ${recoveredIn} ms; room showed "retrying": ${await retryShown}; warnings added: 0`,
    serverLog: busy.log,
  };

  // 7. Tracking resumes when the candidate returns to the frame.
  await setMode('blank');
  await page.waitForFunction(() => /^(No face in view|Face lost)/.test(document.querySelector('.camera-preview > small[role="status"]')?.textContent ?? ''), undefined, { timeout: 15000 });
  const returned = Date.now(); await setMode('portrait');
  await page.waitForFunction(() => /^Face detected/.test(document.querySelector('.camera-preview > small[role="status"]')?.textContent ?? ''), undefined, { timeout: 15000 });
  results.returnToFrame = `face tracked again ${((Date.now() - returned) / 1000).toFixed(1)} s after returning; badge "${await badge()}"`;

  // 8. Camera disconnection: the track ends as if unplugged; the room says so, reconnects by itself (no new
  // permission prompt), sampling and tracking resume, and no warning is added.
  const disconnectedAt = Date.now(), beforeUnplug = done.length;
  await page.evaluate(() => { const v = document.querySelector('video[aria-label="Local camera preview"]') as HTMLVideoElement; for (const track of (v.srcObject as MediaStream).getVideoTracks()) { track.stop(); track.dispatchEvent(new Event('ended')); } });
  await page.getByText(/^The camera disconnected\. Reconnecting automatically/).first().waitFor({ timeout: 5000 });
  await page.waitForFunction(() => { const v = document.querySelector('video[aria-label="Local camera preview"]') as HTMLVideoElement; return !!v?.srcObject && (v.srcObject as MediaStream).getVideoTracks().some(t => t.readyState === 'live'); }, undefined, { timeout: 15000 });
  const reconnectedMs = Date.now() - disconnectedAt;
  await page.waitForFunction(() => /^Face detected/.test(document.querySelector('.camera-preview > small[role="status"]')?.textContent ?? ''), undefined, { timeout: 15000 });
  // The badge can still show the pre-unplug result for a moment; require a fresh successful sample with a face.
  let resumed: Exchange[] = [];
  for (let waited = 0; waited < 15000 && !(resumed = done.slice(beforeUnplug).filter(e => e.status === 200 && e.observation?.faceCount === 1)).length; waited += 250) await page.waitForTimeout(250);
  if (!resumed.length) {
    const evidence = await page.evaluate(() => { const v = document.querySelector('video[aria-label="Local camera preview"]') as HTMLVideoElement; return { tracks: v?.srcObject ? (v.srcObject as MediaStream).getVideoTracks().map(t => `${t.readyState}/${t.enabled}/${t.muted}`) : [], readyState: v?.readyState, badge: document.querySelector('.camera-preview > small[role="status"]')?.textContent, status: [...document.querySelectorAll('p')].map(p => p.textContent ?? '').find(t => /^(Connected|Visual|Waiting|Analyzing|Sampling)/.test(t)) }; });
    assert.fail(`sampling did not resume after the camera reconnected: requests after unplug ${done.length - beforeUnplug} (${done.slice(beforeUnplug).map(e => e.status).join(',')}); ${JSON.stringify(evidence)}`);
  }
  const unplugged = await (apiServer as any).store.load([...exchanges.keys()][0].url().split('/').at(-2));
  assert.equal(unplugged.toPublicState().integrity.warningCount, 0, 'a camera disconnection must never add a warning');
  results.cameraDisconnect = `camera reconnected automatically ${(reconnectedMs / 1000).toFixed(1)} s after the track ended; face tracked again ${((Date.now() - disconnectedAt) / 1000).toFixed(1)} s after; warnings ${unplugged.toPublicState().integrity.warningCount}`;

  const diagnostics = await (await context.request.get(`${base}/interviews/${[...exchanges.keys()][0].url().split('/').at(-2)}/diagnostics`)).json();
  results.serverCounters = diagnostics.python;
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(results, null, 2));
  console.log('PASS: browser camera → JPEG over the existing HTTP API → Node → Python decode/analysis → engine → UI, verified end to end.');
} finally {
  await browser.close(); await web.close(); await api.close();
}
