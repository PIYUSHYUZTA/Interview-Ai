// Real browser/API/Python integration. Chromium test camera; visibility/time signals are simulated.
import { createRequire } from 'node:module';
import path from 'node:path';
import { installFaceFixture } from './browser-face-fixture.js';
import assert from 'node:assert/strict';
import { ApiServer } from '../src/api/server.js';
import { DeterministicProvider } from '../src/core/provider/DeterministicProvider.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ?? 'C:/Users/piyus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { createServer } = await import('../frontend/node_modules/vite/dist/node/index.js');
const realNow = Date.now;
let serverNow: number | null = null;
Date.now = () => serverNow ?? realNow();
const apiOptions = { provider: new DeterministicProvider(), dataDirectory: path.resolve('.browser-verification/proctoring-data') };
let running = await new ApiServer(apiOptions).listen(0);
const target = `http://127.0.0.1:${running.port}`;
const vite = await createServer({ root: path.resolve('frontend'), server: { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/auth', '/resumes', '/interviews'].map((key) => [key, { target, changeOrigin: false }])) } });
await vite.listen();
const port = (vite.httpServer!.address() as { port: number }).port;
const origin = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
try {
  const context = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  const registration = await context.request.post(`${origin}/auth/register`, { data: { name: 'Proctoring verification', email: `proctor-${realNow()}@example.test`, password: 'BrowserTestPass!2026' } });
  assert.equal(registration.status(), 201);
  const page = await context.newPage();
  await page.addInitScript({content:`window.cameraEvents=[];const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async function(options){const stream=await capture(options);for(const track of stream.getVideoTracks()){window.cameraEvents.push({event:'opened',state:track.readyState});track.addEventListener('ended',()=>window.cameraEvents.push({event:'native-ended',state:track.readyState}));const stop=track.stop.bind(track);track.stop=function(){window.cameraEvents.push({event:'app-stop',stack:new Error().stack});return stop();};}return stream;};`});
  await installFaceFixture(page);
  page.on('request',(request:any)=>{if(/\/(proctoring-frame|face-check)$/.test(request.url()) && request.method()==='POST'){const image=Buffer.from(request.postDataJSON().image,'base64');assert.ok(image.length<=180000);}});
  if (process.env.VERIFY_STALLED_VISION === 'true') {
    await page.addInitScript({content:`const nativeTimeout=window.setTimeout;let deadlines=0;window.setTimeout=function(fn,ms,...args){return nativeTimeout(fn,ms===25000&&window.stallArmed&&++deadlines===1?200:ms,...args);};`});
    let requests=0;
    await page.route('**/proctoring-frame',(route:any)=>{ if(++requests===1)return;return route.continue(); });
  }

  if(process.env.VERIFY_STALE_FRAME==='true') {
    let frames=0;
    await page.route('**/proctoring-frame',(route:any)=>{
      if(++frames!==1)return route.continue();
      const body=route.request().postDataJSON();body.capturedAt=new Date(realNow()-20000).toISOString();
      return route.continue({postData:JSON.stringify(body)});
    });
  }
  let heldFrame:any;let notifyHeld!:()=>void;const frameHeld=new Promise<void>(resolve=>notifyHeld=resolve);
  if(process.env.VERIFY_TRACKING_FRESHNESS==='true') {
    let frames=0;await page.route('**/proctoring-frame',(route:any)=>{if(++frames===2){heldFrame=route;notifyHeld();return;}return route.continue();});
  }
  const errors: string[] = [];
  page.on('pageerror', (error: Error) => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByRole('button', { name: 'New interview', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample resume' }).click();
  await page.getByRole('button', { name: 'Analyze resume', exact: true }).click();
  await page.getByText('Ready for your review', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Confirm .*continue/ }).click();
  await page.getByLabel('Rounds', { exact: true }).selectOption('1');
  await page.getByLabel('Questions per round').selectOption('3');
  const createdResponse = page.waitForResponse((response: any) => response.url().endsWith('/interviews') && response.request().method() === 'POST' && response.status() === 201);
  await page.getByRole('button', { name: 'Build my interview plan' }).click();
  const session = await (await createdResponse).json();
  assert.equal(session.integrityPolicy.maximumWarnings, 2);
  await page.getByRole('button', { name: 'Enter interview room' }).click();
  await page.getByLabel('Allow sampled Python visual monitoring with my camera').check();
  await page.getByRole('button', { name: 'Request camera', exact: true }).click();
  await page.getByRole('button', { name: 'Turn camera off', exact: true }).waitFor().catch(async (error: Error) => { console.error('Camera lifecycle',await page.evaluate(()=>(window as any).cameraEvents));console.error('Test-camera diagnostics:', await page.locator('.notice.error').allTextContents()); await page.screenshot({ path: path.resolve('.browser-verification/proctoring-camera-failure.png'), fullPage: true }); throw error; });
  await page.evaluate(() => { (window as any).capturedTracks = (document.querySelector('video')!.srcObject as MediaStream).getTracks(); });
  await page.evaluate(`window.fixtureImageMode='blank';`);await page.waitForTimeout(250);
  await page.getByRole('button',{name:'Check face readiness',exact:true}).click();
  await page.getByText('No face is currently detected. Look toward the camera and check its position.',{exact:true}).waitFor().catch(async(error:Error)=>{console.error('Initial readiness failure UI',await page.locator('.face-readiness-panel').textContent());console.error('Room errors',await page.locator('[role=alert]').allTextContents());console.error('Readiness status',await(await context.request.get(`${origin}/interviews/${session.sessionId}/face-check`,{headers:{Authorization:`Bearer ${session.integrityToken}`}})).json());throw error;});
  await page.getByRole('button',{name:'Start voice interview',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Complete the face-readiness check'}).waitFor();
  await page.evaluate(`window.fixtureImageMode='portrait';`);await page.waitForTimeout(250);
  await page.getByRole('button',{name:'Check face readiness',exact:true}).click();
  await page.getByText('Face readiness confirmed for this session. Identity has not been verified.',{exact:true}).waitFor().catch(async(error:Error)=>{console.error('Readiness UI',await page.locator('.face-readiness-panel').textContent());console.error('Readiness backend',await(await context.request.get(`${origin}/interviews/${session.sessionId}/face-check`,{headers:{Authorization:`Bearer ${session.integrityToken}`}})).json());throw error;});
  const readiness=await(await context.request.get(`${origin}/interviews/${session.sessionId}/face-check`,{headers:{Authorization:`Bearer ${session.integrityToken}`}})).json();assert.equal(readiness.ready,true);assert.equal(readiness.identityVerified,false);
  assert.equal(await page.locator('.vision-overlay').count(),0);
  await page.getByLabel('Show tracking guides',{exact:false}).check();
  assert.equal(await page.locator('.vision-overlay .face-track circle').count(),14);
  await page.getByLabel('Show tracking guides',{exact:false}).uncheck();
  assert.equal(await page.locator('.vision-overlay').count(),0);
  await page.getByLabel('Show tracking guides',{exact:false}).check();
  await page.locator('.face-readiness-panel').screenshot({path:path.resolve('.browser-verification/face-readiness.png')});
  await page.evaluate(`window.stallArmed=true;`);
  const sampleResponse = page.waitForResponse((response: any) => response.url().endsWith('/proctoring-frame') && response.status() === 200, { timeout: process.env.VERIFY_STALLED_VISION === 'true' ? 7000 : 30000 });
  const startedResponse = page.waitForResponse((response: any) => response.url().endsWith('/start') && response.status() === 200);
  await page.getByRole('button', { name: 'Start voice interview', exact: true }).click();
  const started = await (await startedResponse).json();
  if(process.env.VERIFY_PORTRAIT_CAMERA==='true')await page.evaluate(`window.fixtureCanvas.height=1920;`);
  const sample = await (await sampleResponse).json();
  assert.equal(typeof sample.observation.faceCount, 'number');
  assert.ok(Array.isArray(sample.observation.faceTracks));
  assert.ok(Array.isArray(sample.observation.handObservations));
  assert.equal(typeof sample.observation.gazeReliable,'boolean');
  assert.equal(sample.observation.movementObservation.interpretation,'neutral-observation');
  assert.ok(Array.isArray(sample.observation.movementObservation.handTracks));
  assert.ok(Array.isArray(sample.observation.movementObservation.body.landmarks));
  assert.equal(sample.observation.directionEstimate.method,'landmark-geometric-estimate');
  assert.equal(sample.observation.directionEstimate.calibrated,false);
  assert.equal(sample.observation.directionEstimate.coordinateSystem,'unmirrored-camera');
  assert.ok(Array.isArray(sample.observation.directionEstimate.headDirections));
  assert.ok(Array.isArray(sample.observation.directionEstimate.gazeDirections));
  console.log('First real observation',{faces:sample.observation.faceCount,tracks:sample.observation.faceTracks.length});
  if(process.env.VERIFY_PORTRAIT_CAMERA==='true') {
    const cameraSize=await page.evaluate(()=>({width:document.querySelector('video')!.videoWidth,height:document.querySelector('video')!.videoHeight}));
    assert.equal(cameraSize.height,1920);
    const sentImage=(await sampleResponse).request().postDataJSON().image;
    const encodedSize=await page.evaluate(async(base64:string)=>{
      const blob=await(await fetch(`data:image/jpeg;base64,${base64}`)).blob();
      const bitmap=await createImageBitmap(blob);
      const size={width:bitmap.width,height:bitmap.height};bitmap.close();return size;
    },sentImage);
    assert.ok(Math.max(encodedSize.width,encodedSize.height)<=640);
    assert.equal(sample.publicState.integrity.warningCount,0);
    if(sample.observation.faceState!=='FACE_PRESENT') {
      await page.getByRole('status',{name:/^Tracking: (Unavailable|Temporarily lost)$/}).waitFor();
    }
    const recovered=page.waitForResponse(async(response:any)=>response.url().endsWith('/proctoring-frame')&&response.status()===200&&(await response.json()).observation.faceState==='FACE_PRESENT');
    await page.evaluate(`window.fixtureCanvas.height=600;`);
    assert.equal((await(await recovered).json()).publicState.integrity.warningCount,0);
  }
  await page.getByRole('status',{name:'Tracking: Active',exact:true}).waitFor();
  assert.equal(await page.locator('.monitoring-summary').getByText('Not verified',{exact:true}).count(),1);
  if(process.env.VERIFY_TRACKING_FRESHNESS==='true') {
    await frameHeld;
    await page.getByRole('status',{name:'Tracking: Unavailable',exact:true}).waitFor();
    assert.equal(await page.locator('.vision-overlay').count(),0);
    await page.locator('.voice-candidate').screenshot({path:path.resolve('.browser-verification/monitoring-unavailable.png')});
    const recovered=page.waitForResponse((r:any)=>r.url().endsWith('/proctoring-frame')&&r.status()===200);
    await heldFrame.abort('timedout');await recovered;
    await page.getByRole('status',{name:'Tracking: Active',exact:true}).waitFor();
  }
  await page.locator('.voice-candidate').screenshot({path:path.resolve('.browser-verification/monitoring-panel.png')});
  if(process.env.VERIFY_FIXTURE_FACE==='true') {
    assert.equal(sample.observation.faceCount,1);
    await page.locator('.vision-overlay rect').waitFor();
    assert.equal(await page.locator('.vision-overlay').evaluate((el:SVGElement)=>el.getAttribute('preserveAspectRatio')),'xMidYMid slice');
    assert.equal(await page.locator('.vision-overlay').evaluate((el:SVGElement)=>getComputedStyle(el).transform),'matrix(-1, 0, 0, 1, 0, 0)');
    await page.locator('.camera-preview').screenshot({path:path.resolve('.browser-verification/anonymous-face-tracking.png')});
    const blank=page.waitForResponse((r:any)=>r.url().endsWith('/proctoring-frame')&&r.status()===200);
    await page.evaluate(`window.fixtureImageMode='blank';`);const absent=await(await blank).json();assert.equal(absent.observation.faceCount,0);
    await page.getByRole('status',{name:'Tracking: Temporarily lost',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelectorAll('.vision-overlay rect').length===0);
    const restored=page.waitForResponse((r:any)=>r.url().endsWith('/proctoring-frame')&&r.status()===200);
    await page.evaluate(`window.fixtureImageMode='portrait';`);const present=await(await restored).json();assert.equal(present.observation.faceCount,1);assert.equal(present.observation.faceTracks[0].trackId,sample.observation.faceTracks[0].trackId);
    assert.equal(present.publicState.integrity.warningCount,0);
  }
  if(process.env.VERIFY_FIXTURE_HANDS==='true') {
    await page.evaluate(`window.fixtureImageMode='hands';`);
    const handResponse=await page.waitForResponse(async(r:any)=>{
      if(!r.url().endsWith('/proctoring-frame')||r.status()!==200)return false;
      const result=await r.json();return result.observation.movementObservation.handTracks.length>0 && result.observation.events.some((event:any)=>event.eventType==='hand_tracking_changed');
    });
    const handResult=await handResponse.json();
    const hands=handResult.observation.movementObservation;
    const event=handResult.observation.events.find((event:any)=>event.eventType==='hand_tracking_changed');
    assert.equal(event.sessionId,session.sessionId);assert.equal(event.confidence,null);
    assert.ok(event.durationMs>=2000);
    const eventLog=await(await context.request.get(`${origin}/interviews/${session.sessionId}/diagnostics`)).json();
    assert.ok(eventLog.events.some((record:any)=>record.eventId===event.eventId&&record.details.source==='vision'));
    assert.equal(eventLog.warningCount,0);
    assert.ok(hands.handTracks.every((h:any)=>h.landmarks.length===21));
    await page.locator('.vision-overlay .hand-track').first().waitFor();
    await page.locator('.camera-preview').screenshot({path:path.resolve('.browser-verification/hand-body-tracking.png')});
    await page.evaluate(`window.fixtureImageMode='blank';`);
    const loss=await page.waitForResponse(async(r:any)=>r.url().endsWith('/proctoring-frame')&&r.status()===200&&(await r.json()).observation.movementObservation.lostHands.length>0);
    assert.equal((await loss.json()).publicState.integrity.warningCount,0);
    await page.waitForFunction(()=>document.querySelectorAll('.vision-overlay .hand-track').length===0);
    await page.evaluate(`window.fixtureImageMode='portrait';`);
    console.log('PASS: fixture hand video -> real Python landmarks and debounced event -> persisted backend diagnostics -> overlay/loss, without penalties.');
  }
  if(process.env.VERIFY_STALLED_VISION==='true') assert.ok(await page.locator('.proctoring-diagnostics').textContent().then((text:string)=>/failures [1-9]/.test(text)));

  await page.locator('.proctoring-diagnostics > summary').click();
  await page.getByText('Connected · sampled every 2 seconds', { exact: true }).waitFor();

  // Exercise the actual frontend event handler and backend policy using synthetic
  // visibility episodes with accelerated timestamps. No server responses are mocked.
  await page.evaluate(`window.integrityNow = Date.now();
    const NativeDate=Date;
    window.Date=class extends NativeDate { constructor(...args) { if(args.length) super(...args); else super(window.integrityNow); } static now(){return window.integrityNow;} };
    window.hiddenForTest = false;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: function() { return window.hiddenForTest ? 'hidden' : 'visible'; } });`);
  const startAt = started.publicState.timing.sessionStartedAt;
  if(process.env.VERIFY_REMOTE_TERMINATION==='true') {
    // Simulate another authorized client delivering incidents; this page receives
    // no integrity-event response, so only the real frame response can end its room.
    for(let index=0;index<3;index++) {
      serverNow=startAt+61000+index*25000;
      const response=await context.request.post(`${origin}/interviews/${session.sessionId}/integrity-events`,{headers:{Authorization:`Bearer ${session.integrityToken}`},data:{eventId:crypto.randomUUID(),eventType:'tab_hidden',occurredAt:new Date(serverNow).toISOString(),durationMs:5500}});
      assert.equal(response.status(),200);assert.equal((await response.json()).warningCount,index+1);
      if(index<2){serverNow+=2000;const recovered=await context.request.post(`${origin}/interviews/${session.sessionId}/integrity-events`,{headers:{Authorization:`Bearer ${session.integrityToken}`},data:{eventId:crypto.randomUUID(),eventType:'tab_visible',occurredAt:new Date(serverNow).toISOString(),durationMs:2000}});assert.equal(recovered.status(),200);}
    }
    console.log('Remote termination posted; waiting for authoritative frame error to stop the room.');
  } else {
  // Each observable context event crosses the real browser hook and API boundary.
  const contextual = async (eventType: string, begin: () => Promise<unknown>, end: () => Promise<unknown>) => {
    serverNow = startAt + 31_000;
    await page.evaluate((at: number) => { (window as any).integrityNow = at; }, serverNow);
    await begin();
    await page.waitForTimeout(1200); // Allow React technical-state effects and the monitoring tick to begin this incident.
    const accepted = page.waitForResponse((r: any) => r.url().endsWith('/integrity-events') && r.request().postDataJSON().eventType === eventType && r.status() === 200);
    serverNow += 5500;
    await page.evaluate((at: number) => { (window as any).integrityNow = at; }, serverNow);
    const result = await (await accepted).json();
    assert.equal(result.warningCount, 0); assert.equal(result.terminated, false);
    await end();
  };
  await contextual('window_unfocused',
    () => page.evaluate(`document.hasFocus = () => false; window.dispatchEvent(new Event('blur'));`),
    () => page.evaluate(`document.hasFocus = () => true; window.dispatchEvent(new Event('focus'));`));
  await contextual('fullscreen_exited', () => page.evaluate(() => document.exitFullscreen()),
    () => page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click());
  await contextual('connection_interrupted',
    () => page.evaluate(`Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'));`),
    () => page.evaluate(`Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'));`));
  await contextual('camera_interrupted',
    () => page.evaluate(() => { (document.querySelector('video')!.srcObject as MediaStream).getTracks()[0].dispatchEvent(new Event('ended')); }),
    async () => {});
  const contextualDiagnostics = await (await context.request.get(`${origin}/interviews/${session.sessionId}/diagnostics`)).json();
  for (const type of ['window_unfocused','fullscreen_exited','connection_interrupted','camera_interrupted']) assert.ok(contextualDiagnostics.events.some((e: any) => e.eventType === type));
  for (let incident = 0; incident < 3; incident++) {
    serverNow = startAt + 61_000 + incident * 25_000;
    await page.evaluate((now: number) => { (window as any).integrityNow = now; (window as any).hiddenForTest = true; document.dispatchEvent(new Event('visibilitychange')); }, serverNow);
    const response = page.waitForResponse((item: any) => item.url().endsWith('/integrity-events') && item.request().postDataJSON().eventType === 'tab_hidden' && item.status() === 200);
    serverNow += 5500;
    await page.evaluate((now: number) => { (window as any).integrityNow = now; }, serverNow);
    const result = await (await response).json();
    assert.equal(result.warningCount, incident + 1);
    assert.equal(result.terminated, incident === 2);
    if (incident === 0) {
      const payload = (await response).request().postDataJSON();
      const replay = await context.request.post(`${origin}/interviews/${session.sessionId}/integrity-events`, { headers: { Authorization: `Bearer ${session.integrityToken}` }, data: payload });
      const replayed = await replay.json(); assert.equal(replayed.duplicate, true); assert.equal(replayed.warningCount, 1);
      const continuous = await context.request.post(`${origin}/interviews/${session.sessionId}/integrity-events`, { headers: { Authorization: `Bearer ${session.integrityToken}` }, data: { ...payload, eventId: crypto.randomUUID() } });
      const suppressed = await continuous.json(); assert.equal(suppressed.suppressed, true); assert.equal(suppressed.warningCount, 1);
    }
    if (incident < 2) {
      await page.getByRole('heading', { name: incident === 1 ? 'Final integrity warning' : 'Interview integrity notice', exact: true }).waitFor();
      await page.screenshot({ path: path.resolve(`.browser-verification/phase8-warning-${incident + 1}.png`), fullPage: true });
    }
    await page.evaluate(() => { (window as any).hiddenForTest = false; document.dispatchEvent(new Event('visibilitychange')); });
    if(incident<2){const recovery=page.waitForResponse((r:any)=>r.url().endsWith('/integrity-events')&&r.request().postDataJSON().eventType==='tab_visible'&&r.status()===200);serverNow+=2500;await page.evaluate((at:number)=>{(window as any).integrityNow=at;document.dispatchEvent(new Event('visibilitychange'));},serverNow);await recovery;}
  }
  }
  await page.getByRole('heading', { name: 'This interview has ended.', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => (window as any).capturedTracks.every((track: MediaStreamTrack) => track.readyState === 'ended')), true);
  let postTerminalFrames=0;page.on('request',(request:any)=>{if(request.url().endsWith('/proctoring-frame'))postTerminalFrames++;});
  await page.waitForTimeout(2300);assert.equal(postTerminalFrames,0);
  const blocked = await context.request.post(`${origin}/interviews/${session.sessionId}/next-question`);
  assert.equal(blocked.status(), 410);
  assert.equal((await context.request.post(`${origin}/interviews/${session.sessionId}/answer`, { data: { questionId: started.currentQuestion.id, text: 'This late answer must be rejected.' } })).status(), 410);
  const savedPort = running.port; await running.close(); running = await new ApiServer(apiOptions).listen(savedPort);
  assert.equal((await context.request.post(`${origin}/interviews/${session.sessionId}/answer`, { data: { questionId: started.currentQuestion.id, text: 'Refresh cannot restore a terminated interview.' } })).status(), 410);
  assert.equal((await context.request.get(`${origin}/interviews/${session.sessionId}/results`)).status(), 410);
  await page.screenshot({ path: path.resolve('.browser-verification/phase5-termination.png'), fullPage: true });
  await page.getByRole('button', { name: /Return to your workspace/ }).click();
  await page.getByRole('button', { name: 'New interview', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.getByRole('button', { name: 'New interview', exact: true }).waitFor();
  assert.equal(await page.locator('.immersive-room').count(), 0);
  assert.equal((await context.request.post(`${origin}/interviews/${session.sessionId}/start`)).status(), 410);
  const reloadedTracks = await page.evaluate(() => ((window as any).capturedTracks ?? []).every((track: MediaStreamTrack) => track.readyState === 'ended'));
  assert.equal(reloadedTracks, true);
  assert.deepEqual(errors, []);
  console.log('Frame scenarios:',{stalledRequestRecovery:process.env.VERIFY_STALLED_VISION==='true',fixturePortraitVideo:process.env.VERIFY_PORTRAIT_CAMERA==='true',faceFixture:process.env.VERIFY_FIXTURE_FACE==='true',remoteTermination:process.env.VERIFY_REMOTE_TERMINATION==='true',staleFrameRecovery:process.env.VERIFY_STALE_FRAME==='true'});
  console.log('PASS: consent → browser fixture video → real Python face-readiness check and inference; simulated browser incidents → warning 1 → duplicate/continuous suppression → warning 2 → termination; tracks stopped; answers/progression rejected even after restart; dashboard returned.');
} finally { Date.now = realNow; await browser.close(); await vite.close(); await running.close(); }
