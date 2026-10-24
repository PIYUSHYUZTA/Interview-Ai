import fs from 'node:fs';
// Actual browser speech-service probe with generated audio; no fabricated recognition or playback events.
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ApiServer } from '../src/api/server.js';
import { DeterministicProvider } from '../src/core/provider/DeterministicProvider.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ?? 'C:/Users/piyus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { createServer, preview } = await import('../frontend/node_modules/vite/dist/node/index.js');
const api = await new ApiServer({ provider: new DeterministicProvider(), dataDirectory: path.resolve('.browser-verification/native-speech-data') }).listen(0);
const options = { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/auth','/interviews','/resumes'].map((key) => [key, { target: `http://127.0.0.1:${api.port}`, changeOrigin: false }])) };
const production = process.env.VERIFY_PRODUCTION === 'true';
const web = production ? await preview({ root: path.resolve('frontend'), preview: options }) : await createServer({ root: path.resolve('frontend'), server: options });
if (!production) await (web as Awaited<ReturnType<typeof createServer>>).listen();
const base = `http://127.0.0.1:${(web.httpServer!.address() as { port: number }).port}`;console.log('Native audio probe',base);
const autoFinish=process.env.VERIFY_AUTO_FINISH==='true';
const fixturePath=path.resolve(autoFinish?'.browser-verification/native-speech-with-pause.wav':'.browser-verification/native-speech.wav');
if(autoFinish){
  const original=fs.readFileSync('.browser-verification/native-speech.wav');
  const dataAt=original.indexOf(Buffer.from('data'));assert.ok(dataAt>=36);
  const count=original.readUInt32LE(dataAt+4),bytesPerSecond=original.readUInt32LE(28);
  const paused=Buffer.concat([original.subarray(0,dataAt+8+count),Buffer.alloc(bytesPerSecond*7)]);
  paused.writeUInt32LE(paused.length-8,4);paused.writeUInt32LE(count+bytesPerSecond*7,dataAt+4);fs.writeFileSync(fixturePath,paused);
}
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${fixturePath}`] });
// No recognition/TTS callbacks are fabricated. Audio is an explicitly generated test fixture.
try {
  const context=await browser.newContext({permissions:['microphone'],viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  assert.equal((await context.request.post(`${base}/auth/register`,{data:{name:'Native speech probe',email:`native-${Date.now()}@example.test`,password:'NativeSpeechProbe!2026'}})).status(),201);
  const page=await context.newPage();page.on('console',(message:any)=>{if(message.type()==='error')console.log('Browser error',message.text());});page.on('response',(response:any)=>{if(/start$|speech$|transcribe$|answer$/.test(response.url()))console.log('Audio pipeline',response.status(),response.url());});page.on('response',async(response:any)=>{if(response.url().endsWith('/transcribe')){const payload=response.request().postDataJSON();fs.writeFileSync('.browser-verification/captured-synthetic-audio.wav',Buffer.from(payload.audioBase64,'base64'));if(response.status()!==200)console.log('Transcription response',await response.text());}if(response.url().endsWith('/transcribe')&&response.status()===200){const result=await response.json();await page.evaluate((text:string)=>(window as any).nativeProbe.transcripts.push(text),result.text);}}); page.setDefaultTimeout(45000);
  await page.addInitScript({content:`window.capturedTracks=[];window.captureContexts=[];const OriginalContext=window.AudioContext;window.AudioContext=class extends OriginalContext{constructor(...args){super(...args);window.captureContexts.push(this);}};const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async function(options){const stream=await capture(options);window.capturedTracks.push(...stream.getTracks());return stream;};window.nativeProbe={supported:false,started:false,transcripts:[],errors:[]};const Native=window.SpeechRecognition||window.webkitSpeechRecognition;if(Native){window.nativeProbe.supported=true;window.SpeechRecognition=function(){const instance=new Native();instance.addEventListener('start',()=>window.nativeProbe.started=true);instance.addEventListener('error',e=>window.nativeProbe.errors.push(e.error));instance.addEventListener('result',e=>{for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)window.nativeProbe.transcripts.push(e.results[i][0].transcript);});return instance;};}`});
  const recovery = process.env.VERIFY_VOICE_RECOVERY === 'true';
  let startCalls=0;page.on('request',(request:any)=>{if(request.url().endsWith('/start'))startCalls++;});
  if(recovery){
    await page.addInitScript({content:`const getMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);let deny=true;navigator.mediaDevices.getUserMedia=function(options){if(deny&&options.audio){deny=false;return Promise.reject(new DOMException('Permission denied for recovery test','NotAllowedError'));}return getMedia(options);};`});
    let rejectOnce=true;await page.route('**/interviews/*/transcribe',async(route:any)=>{if(rejectOnce){rejectOnce=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Transcription temporarily unavailable'})});}else await route.continue();});
  }
  const transcriptionOnly = process.env.VERIFY_TRANSCRIPTION_WITHOUT_TTS === 'true';
  if(transcriptionOnly) await page.route('**/interviews/*/speech', (route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Speech unavailable for regression test'})}));
  await page.goto(base);await page.getByRole('button',{name:'Workspace',exact:true}).click();await page.getByRole('button',{name:'New interview',exact:true}).click();
  await page.getByRole('button',{name:'Use sample resume'}).click();await page.getByRole('button',{name:'Analyze resume',exact:true}).click();await page.getByRole('button',{name:/Confirm .*continue/}).click();
  await page.getByLabel('Rounds',{exact:true}).selectOption('1');await page.getByLabel('Questions per round').selectOption('2');
  const created=page.waitForResponse((r:any)=>r.url().endsWith('/interviews')&&r.status()===201);
  await page.getByRole('button',{name:'Build my interview plan'}).click();const session=await(await created).json();
  await page.getByRole('button',{name:'Enter interview room',exact:true}).click();
  const unavailable = transcriptionOnly ? page.waitForResponse((response:any)=>response.url().endsWith('/speech')&&response.status()===503) : null;
  await page.getByRole('button',{name:'Start voice interview',exact:true}).click();
  if(recovery){
    await page.getByRole('alert').filter({hasText:'Microphone permission denied'}).waitFor();
    assert.equal(startCalls,0,'Permission denial must not consume the first question');
    await page.getByRole('button',{name:'Start voice interview',exact:true}).click();
  }
  if(transcriptionOnly) {
    // Request capture while playback is unavailable: local dictation must remain selected.
    await unavailable;
    if(!await page.getByRole('button',{name:'Done speaking',exact:true}).isVisible()) await page.getByRole('button',{name:'Unmute microphone',exact:true}).click();
  }
  const speechIds:string[]=[];
  page.on('response',async(response:any)=>{if(response.url().endsWith('/speech')&&response.status()===200)speechIds.push((await response.json()).questionId);});
  for(let answer=0;answer<2;answer++){
    console.log('Waiting for microphone capture',answer+1);
    await page.getByRole('button',{name:'Done speaking',exact:true}).waitFor().catch(async(error:Error)=>{console.error(await page.locator('.immersive-room').innerText());throw error;});
    assert.equal(await page.locator('textarea,input[type=text]').count(),0);
    await page.waitForFunction(()=>Number(document.querySelector('meter[aria-label="Microphone input level"]')?.getAttribute('value'))>0);
    if(answer===0){
      // Discard actual captured audio, then retry without consuming a backend answer.
      await page.getByRole('button',{name:'Record answer again',exact:true}).click();
      await page.getByRole('button',{name:'Done speaking',exact:true}).waitFor();
      assert.equal((await(await context.request.get(`${base}/interviews`)).json()).interviews.find((item:any)=>item.sessionId===session.sessionId).answered,0);
    }
    console.log('Recording actual test-device audio',answer+1);
    if(answer===0)await page.screenshot({path:path.resolve('.browser-verification/live-voice-controls.png')});
    const evaluated=page.waitForResponse((r:any)=>r.url().endsWith('/answer')&&r.status()===200);
    if(!autoFinish){
      await page.waitForTimeout(10000);
      if(await page.getByRole('button',{name:'Done speaking',exact:true}).isVisible())await page.getByRole('button',{name:'Done speaking',exact:true}).click();
    }
    if(recovery&&answer===0){
      await page.getByRole('button',{name:'Retry spoken answer',exact:true}).waitFor();
      assert.equal((await(await context.request.get(`${base}/interviews`)).json()).interviews.find((item:any)=>item.sessionId===session.sessionId).answered,0);
      await page.getByRole('button',{name:'Retry spoken answer',exact:true}).click();
      await page.getByRole('button',{name:'Done speaking',exact:true}).waitFor();
      await page.waitForTimeout(10000);
      if(await page.getByRole('button',{name:'Done speaking',exact:true}).isVisible())await page.getByRole('button',{name:'Done speaking',exact:true}).click();
    }
    await evaluated;
  }
  await page.getByRole('heading',{name:'Difficulty progression',exact:true}).waitFor();
  const observed=await page.evaluate(()=>(window as any).nativeProbe);
  assert.equal(observed.started,false,'Local dictation must never silently switch to browser recognition');
  assert.equal(observed.transcripts.length,2);
  const expectedTerms=['implemented','api','latency','recovery','transactions','constraints','payments'];
  for(const transcript of observed.transcripts)assert.ok(expectedTerms.filter(term=>transcript.toLowerCase().includes(term)).length>=3,'Actual audio must produce matching words');
  const report=await(await context.request.get(`${base}/interviews/${session.sessionId}/results`)).json();
  assert.equal(report.evidence.length,2);
  assert.equal(await page.evaluate(()=>(window as any).capturedTracks.every((track:MediaStreamTrack)=>track.readyState==='ended')),true);
  assert.equal(await page.evaluate(()=>(window as any).captureContexts.every((context:AudioContext)=>context.state==='closed')),true);
  assert.equal(await page.locator('.blender-studio').count(),0);
  if(!transcriptionOnly)assert.ok(speechIds.length>=1,'The backend follow-up must produce real spoken audio');
  fs.writeFileSync('.browser-verification/native-audio-checks.json',JSON.stringify({speechSource:'windows-sapi',audioSource:'generated test fixture through Chromium microphone capture',transcripts:observed.transcripts,answerCount:2,reportEvidence:report.evidence.length,repeatAnswerVerified:true,automaticEndDetection:autoFinish,followUpSpoken:!transcriptionOnly,physicalMicrophoneVerified:false},null,2));
  console.log('PASS: actual audio capture, moving input meter, record-again, two real transcriptions/evaluations, spoken adaptive follow-up, completed report and cleanup. Physical device accuracy remains unverified.');
  if(await page.getByRole('button',{name:'Exit interview',exact:true}).count()){await page.getByRole('button',{name:'Exit interview',exact:true}).click();await page.getByRole('button',{name:'Leave interview',exact:true}).click();}
} finally {await browser.close();await web.close();await api.close();}
