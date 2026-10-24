import { visemeAt } from '../frontend/src/components/avatar-speech.js';
// Real synchronized TTS/WAV/visemes + Chromium test-device capture. Recognition results are explicitly injected contract events.
import { createRequire } from 'node:module';
import path from 'node:path';
import { installFaceFixture } from './browser-face-fixture.js';
import assert from 'node:assert/strict';
import { ApiServer } from '../src/api/server.js';
import { DeterministicProvider } from '../src/core/provider/DeterministicProvider.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ?? 'C:/Users/piyus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { createServer, preview } = await import('../frontend/node_modules/vite/dist/node/index.js');
const api = await new ApiServer({ provider: new DeterministicProvider(), dataDirectory: path.resolve('.browser-verification/voice-room-data') }).listen(0);
const options = { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/auth','/interviews','/resumes'].map((key) => [key, { target: `http://127.0.0.1:${api.port}`, changeOrigin: false }])) };
const production = process.env.VERIFY_PRODUCTION === 'true';
const verifyVision = process.env.VERIFY_VISION !== 'false';
const web = production ? await preview({ root: path.resolve('frontend'), preview: options }) : await createServer({ root: path.resolve('frontend'), server: options });
if (!production) await (web as Awaited<ReturnType<typeof createServer>>).listen();
const base = `http://127.0.0.1:${(web.httpServer!.address() as { port: number }).port}`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--enable-unsafe-swiftshader'] });
try {
  const context = await browser.newContext({ permissions: ['camera','microphone'], viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const registered = await context.request.post(`${base}/auth/register`, { data: { name: 'Voice verifier', email: `voice-${Date.now()}@example.test`, password: 'VoiceVerifyPass!2026' } }); assert.equal(registered.status(), 201);
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('response', (r: any) => { if (/start$|answer$|next-question$/.test(r.url())) console.log('API',r.status(),r.url()); });
  page.on('console', (m: any) => { if(m.type()==='error') console.log('Browser error',m.text()); });
  const speechPayloads:any[]=[];page.on('response',async(response:any)=>{if(response.url().endsWith('/speech')&&response.status()===200)speechPayloads.push(await response.json());});
  const errors: string[] = []; page.on('pageerror', (e: Error) => errors.push(e.message));
  await page.addInitScript({ content: `window.speechInstances=[]; window.SpeechRecognition=class {start(){ window.speechInstances.push(this); this.onstart?.();this.onaudiostart?.(); } stop(){setTimeout(()=>this.onend?.(),30);} abort(){} }; window.allTracks=[]; const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia=async function(c){const stream=await capture(c); window.allTracks.push(...stream.getTracks()); return stream;}; window.spokenQuestions=[];const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(!(this instanceof HTMLAudioElement))return play.call(this);const record={started:false,ended:false};window.spokenQuestions.push(record);this.addEventListener('playing',()=>record.started=true,{once:true});this.addEventListener('ended',()=>record.ended=true,{once:true});return play.call(this);}; const speak=speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak=function(u){ const start=u.onstart,end=u.onend; u.onstart=function(e){window.spokenQuestions.push({text:u.text,started:true,ended:false});start?.(e);}; u.onend=function(e){window.spokenQuestions.at(-1).ended=true;end?.(e);}; speak(u);};` });
  if(verifyVision) await installFaceFixture(page);
  console.log('Opening candidate journey', base);
  await page.goto(base); await page.getByRole('button', { name: 'Workspace', exact: true }).click(); await page.getByRole('button', { name: 'New interview', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample resume' }).click(); await page.getByRole('button', { name: 'Analyze resume', exact: true }).click();
  await page.getByRole('button', { name: /Confirm .*continue/ }).click(); await page.getByLabel('Rounds', { exact: true }).selectOption('1'); await page.getByLabel('Questions per round').selectOption('2');
  const creation = page.waitForResponse((r: any) => r.url().endsWith('/interviews') && r.request().method() === 'POST' && r.status() === 201);
  await page.getByRole('button', { name: 'Build my interview plan' }).click(); const session = await (await creation).json();
  console.log('Plan created');
  let failAvatar=true;await page.route('**/models/human-interview-studio.glb',async(route:any)=>{if(failAvatar){failAvatar=false;await route.fulfill({status:503,body:'Render recovery test'});}else await route.continue();});
  await page.getByRole('button', { name: 'Enter interview room', exact: true }).click();
  await page.getByRole('button',{name:'Retry 3D view',exact:true}).waitFor();await page.getByRole('button',{name:'Retry 3D view',exact:true}).click();
  await page.locator('.blender-studio[data-scene-state="ready"]').waitFor();
  assert.ok(Number(await page.locator('.blender-studio').getAttribute('data-triangles')) > 0);
  assert.equal(await page.locator('.blender-studio').getAttribute('data-rigged'),'true');
  assert.ok(Number(await page.locator('.blender-studio').getAttribute('data-morph-targets')) > 20);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    (window as any).avatarStates = [];
    new MutationObserver(() => { const state = document.querySelector('.blender-studio')?.getAttribute('data-state'); if (state) (window as any).avatarStates.push(state); }).observe(document.querySelector('.blender-studio')!, { attributes: true, attributeFilter: ['data-state'] });
  });
  assert.equal(await page.locator('textarea').count(), 0); assert.equal(await page.locator('.sidebar,.topbar').count(), 0);
  if (verifyVision) await page.getByLabel('Allow sampled Python visual monitoring with my camera').check();
  else { await page.getByRole('button',{name:'Request camera',exact:true}).click();await page.getByRole('button',{name:'Turn camera off',exact:true}).waitFor().catch(async(error:Error)=>{console.error('Camera preview diagnostics',await page.getByRole('alert').allTextContents(),await page.evaluate(()=>({tracks:(window as any).allTracks.map((track:MediaStreamTrack)=>({kind:track.kind,state:track.readyState})),videoReady:document.querySelector('video')?.readyState})));throw error;}); }
  const analyzed = verifyVision ? page.waitForResponse((r: any) => r.url().endsWith('/proctoring-frame') && r.status() === 200).catch(async(error:Error)=>{console.error('Browser sampling state',await page.evaluate(()=>({visible:document.visibilityState,videoReady:document.querySelector('video')?.readyState,videoWidth:document.querySelector('video')?.videoWidth,tracks:(document.querySelector('video')?.srcObject as MediaStream|null)?.getTracks().map(t=>({kind:t.kind,state:t.readyState})),status:document.querySelector('.proctoring-diagnostics')?.textContent})));console.error('Python diagnostics',await(await context.request.get(`${base}/interviews/${session.sessionId}/diagnostics`)).json());throw error;}) : null;
  if(verifyVision){await page.getByRole('button',{name:'Check face readiness',exact:true}).click();await page.getByText('Face readiness confirmed for this session. Identity has not been verified.',{exact:true}).waitFor();}
  await page.getByLabel('Speech transcription',{exact:true}).selectOption('browser');
  console.log('Starting voice room');
  await page.getByRole('button', { name: 'Start voice interview', exact: true }).click();
  console.log('Start clicked');
  console.log('Waiting fullscreen');
  await page.waitForFunction(() => document.fullscreenElement?.classList.contains('immersive-room'), undefined, {timeout:15000});
  await page.waitForFunction(() => {
    const scene = document.querySelector('.blender-studio') as HTMLElement | null;
    return scene?.dataset.state === 'streaming' && Number(scene.dataset.mouthWeight) > .1 && Number(scene.dataset.audioTime) > 0;
  });
  for(let sample=0;sample<5;sample++){const snapshot=await page.locator('.blender-studio').evaluate((element:HTMLElement)=>({time:Number(element.dataset.audioTime),viseme:element.dataset.viseme}));const cues=speechPayloads[0].visemes; if(!cues.some((cue:any)=>Math.abs(cue.time-snapshot.time)<.002))assert.equal(snapshot.viseme,visemeAt(cues,snapshot.time));await page.waitForTimeout(90);}
  await page.waitForTimeout(300);await page.screenshot({path:path.resolve('.browser-verification/human-interviewer-speaking.png')});
  console.log(verifyVision ? 'Fullscreen entered; waiting Python' : 'Fullscreen entered; voice-only verification');
  if (analyzed) assert.equal((await (await analyzed).json()).observation.faceCount >= 0, true);
  console.log(verifyVision ? 'Python frame analyzed; waiting speech end' : 'Waiting for native speech playback to finish');
  await page.getByRole('button', { name: 'Done speaking', exact: true }).waitFor().catch(async (error: Error) => { console.error('Voice state:', await page.locator('.immersive-room').innerText(), await page.evaluate(() => (window as any).spokenQuestions)); throw error; });
  await page.locator('.blender-studio[data-state="listening"]').waitFor();
  assert.ok(await page.evaluate(() => (window as any).avatarStates.includes('streaming')));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.evaluate(() => (window as any).allTracks.some((t: MediaStreamTrack) => t.kind === 'audio' && t.readyState === 'live')), true);
  // Empty recognition must not consume an answer.
  await page.getByRole('button', { name: 'Done speaking', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'No completed transcript' }).waitFor();
  assert.equal((await (await context.request.get(`${base}/interviews`)).json()).interviews[0].answered, 0);
  await page.getByRole('button', { name: 'Retry spoken answer', exact: true }).click();
  await page.getByRole('button', { name: 'Done speaking', exact: true }).waitFor();
  let answered = page.waitForResponse((r: any) => r.url().endsWith('/answer') && r.status() === 200);
  await page.evaluate(`window.speechInstances.at(-1).onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:'I designed an idempotent payments API using unique constraints, transactions, retries and production latency measurements.'}}]});`);
  await page.getByRole('button', { name: 'Done speaking', exact: true }).click(); await answered;
  await page.waitForFunction(() => (window as any).spokenQuestions.length >= 2);
  await page.getByRole('button', { name: 'Done speaking', exact: true }).waitFor();
  console.log('Two synchronized spoken questions and first evaluation verified');
  await page.evaluate(() => document.exitFullscreen());
  await page.getByText('Fullscreen exited. You are still in the dedicated interview room.', { exact: true }).waitFor();
  assert.equal(await page.locator('.sidebar,.topbar,textarea').count(), 0);
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); const cameraBox = await page.locator('.voice-candidate .camera-preview').boundingBox(); assert.ok(cameraBox && cameraBox.x >= 0 && cameraBox.y >= 0 && cameraBox.x + cameraBox.width <= 390 && cameraBox.y + cameraBox.height <= 844); await page.screenshot({path:path.resolve('.browser-verification/voice-immersive-mobile.png')}); await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page.locator('.proctoring-diagnostics > summary').click(); await page.getByRole('button', { name: 'Refresh diagnostics' }).click();
  await page.getByText(/Frames analyzed:/).waitFor();
  const diagnostics = await (await context.request.get(`${base}/interviews/${session.sessionId}/diagnostics`)).json(); if (verifyVision) assert.ok(diagnostics.python.framesAnalyzed > 0);
  await page.screenshot({ path: path.resolve('.browser-verification/voice-immersive-room.png'), fullPage: true });
  answered = page.waitForResponse((r: any) => r.url().endsWith('/answer') && r.status() === 200);
  await page.evaluate(`window.speechInstances.at(-1).onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:'I do not yet understand that concept and would verify it with a small worked example.'}}]});`);
  // Do not click Done speaking this time: the real five-second silence timer finalizes the answer.
  await answered;
  await page.getByRole('heading', { name: 'Difficulty progression', exact: true }).waitFor();
  const report = await (await context.request.get(`${base}/interviews/${session.sessionId}/results`)).json(); assert.equal(report.evidence.length, 2); assert.ok(report.evidence[0].answer.includes('idempotent'));
  const spoken = await page.evaluate(() => (window as any).spokenQuestions); assert.ok(spoken.length >= 2); assert.ok(spoken.slice(0,2).every((q: any) => q.started && q.ended));
  assert.equal(await page.evaluate(() => (window as any).allTracks.every((t: MediaStreamTrack) => t.readyState === 'ended')), true); assert.equal(await page.evaluate(() => document.fullscreenElement === null), true);
  assert.equal(await page.locator('.blender-studio').count(), 0);
  assert.deepEqual(errors, []);
  console.log('Python frame verification:',verifyVision ? 'enabled' : 'not included in this voice-only run');
  console.log('PASS: actual SAPI WAV playback start/end and facial visemes, real test-device camera/audio, automatically connected listening, no text inputs, empty-speech rejection, real evaluation/adaptive next question, silence auto-submit, fullscreen isolation/exit/reentry, assessment and cleanup. Recognition events injected: live spoken STT is not claimed.');
} catch (error) { console.error(error); throw error; } finally { console.log('Closing verification servers'); await browser.close(); await web.close(); await api.close(); }
