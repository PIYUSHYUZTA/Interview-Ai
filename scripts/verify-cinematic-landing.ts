// Production UI + real WebGL checks; no mocked rendering or product APIs.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { ApiServer } from '../src/api/server.js';
import { DeterministicProvider } from '../src/core/provider/DeterministicProvider.js';
import { landingMotion } from '../frontend/src/components/landing-motion.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ?? 'C:/Users/piyus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { preview } = await import('../frontend/node_modules/vite/dist/node/index.js');
const api = await new ApiServer({ provider: new DeterministicProvider(), dataDirectory: path.resolve('.browser-verification/landing-data') }).listen(0);
const server = await preview({root:path.resolve('frontend'),preview:{host:'127.0.0.1',port:0,proxy:Object.fromEntries(['/auth','/interviews','/resumes'].map(key=>[key,{target:`http://127.0.0.1:${api.port}`,changeOrigin:false}]))}});
const origin=`http://127.0.0.1:${(server.httpServer!.address() as {port:number}).port}`;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader']});
fs.mkdirSync('.browser-verification',{recursive:true});
const result:Record<string,unknown>={};
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
  await context.addInitScript({content:`window.firstCtaOpacity=null;new MutationObserver(()=>{const action=document.querySelector('.c-hero-actions');if(action&&window.firstCtaOpacity===null)window.firstCtaOpacity=Number(getComputedStyle(action).opacity);}).observe(document,{subtree:true,childList:true});window.sceneDraws=0;window.disposedScenePrograms=0;for(const Context of [WebGLRenderingContext,WebGL2RenderingContext]){const dispose=Context.prototype.deleteProgram;Context.prototype.deleteProgram=function(program){window.disposedScenePrograms++;return dispose.call(this,program);};for(const method of ['drawArrays','drawElements']){const draw=Context.prototype[method];Context.prototype[method]=function(...args){window.sceneDraws++;return draw.apply(this,args);};}}`});
  await context.addInitScript({content:`window.layoutShift=0;new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)window.layoutShift+=entry.value;}).observe({type:'layout-shift',buffered:true});`});
  const page=await context.newPage();page.setDefaultTimeout(30000);
  const errors:string[]=[];page.on('pageerror',(error:Error)=>errors.push(error.message));
  await page.goto(origin);
  await page.locator('[data-scene-state="ready"]').waitFor();
  await page.getByRole('img',{name:'Digital human interviewer framed by illuminated orbital rings',exact:true}).waitFor();
  const drawingBuffer=await page.locator('.c-sculpture canvas').evaluate((canvas:HTMLCanvasElement)=>({width:canvas.width,height:canvas.height}));
  assert.ok(drawingBuffer.width>0&&drawingBuffer.height>0&&Math.max(drawingBuffer.width,drawingBuffer.height)<=900);
  result.sceneBudget='Current sculptural scene has an accessible description and a real drawing buffer bounded to 900 pixels per side.';
  await page.getByRole('heading',{name:'Interview practice that feels real.'}).waitFor();
  await page.keyboard.press('Tab');assert.equal(await page.getByRole('link',{name:'Skip to content',exact:true}).evaluate((el:HTMLElement)=>el===document.activeElement),true);await page.keyboard.press('Tab');assert.equal(await page.locator('.c-skip').evaluate((el:HTMLElement)=>getComputedStyle(el).opacity),'0');
  assert.ok(await page.evaluate(()=>(window as any).firstCtaOpacity)>=.7);
  assert.equal(await page.locator('.cinema').evaluate((el:HTMLElement)=>getComputedStyle(el).getPropertyValue('--c-motion-fast').trim()),`${landingMotion.duration.fast}s`);
  assert.equal(await page.locator('.c-hero-actions').evaluate((el:HTMLElement)=>getComputedStyle(el).pointerEvents),'auto');
  assert.equal(await page.locator('#approach [data-reveal-group="single"]').first().evaluate((el:HTMLElement)=>getComputedStyle(el).opacity),'0');
  result.entrance='CTA is visible and usable on its first render; CSS/JS share motion tokens; below-fold sections wait for intersection.';
  await page.waitForTimeout(1500);
  const ctaBox=await page.getByRole('button',{name:'Start Your Interview',exact:true}).boundingBox();assert.ok(ctaBox&&ctaBox.y+ctaBox.height<=1000);
  assert.equal(await page.getByText('Realistic voice conversation',{exact:true}).count(),1);
  const artBox=await page.locator('.c-sculpture canvas').boundingBox();assert.ok(artBox);await page.mouse.move(artBox.x+artBox.width*.75,artBox.y+artBox.height*.4);await page.waitForTimeout(350);
  const rotation=await page.locator('.c-sculpture').getAttribute('data-rotation');assert.ok(rotation && Math.abs(Number(rotation.split(',')[1]))>.01);assert.ok(Number(await page.locator('.c-sculpture').getAttribute('data-triangles'))>0);assert.ok(Number(await page.locator('.c-sculpture').getAttribute('data-animation-clips'))>0);
  result.pointer='Pointer input changes the loaded Blender model rotation; exported animation clips and actual rendered triangles are present.';
  const cameraBefore=await page.locator('.c-sculpture').getAttribute('data-camera-position');
  await page.waitForTimeout(450);
  assert.notEqual(await page.locator('.c-sculpture').getAttribute('data-camera-position'),cameraBefore);
  result.camera='Actual perspective camera drifts smoothly while active; motion obeys pause and reduced-motion.';
  const before=await page.evaluate(()=>(window as any).sceneDraws);await page.waitForTimeout(400);assert.ok(await page.evaluate(()=>(window as any).sceneDraws)>before);
  await page.getByRole('button',{name:'Pause scene motion',exact:true}).click();
  await page.locator('.c-sculpture[data-motion="still"]').waitFor();await page.waitForTimeout(150);
  assert.equal(await page.locator('.c-hero-waveform i').first().evaluate((el:HTMLElement)=>getComputedStyle(el).animationPlayState),'paused');
  const pausedCamera=await page.locator('.c-sculpture').getAttribute('data-camera-position');
  const stopped=await page.evaluate(()=>(window as any).sceneDraws);await page.waitForTimeout(450);assert.equal(await page.evaluate(()=>(window as any).sceneDraws),stopped);
  assert.equal(await page.locator('.c-sculpture').getAttribute('data-camera-position'),pausedCamera);
  await page.screenshot({path:path.resolve('.browser-verification/cinematic-desktop.png')});
  result.webgl='Actual Blender GLB loaded and rendered in WebGL2; exported animation advances and pause stops draw calls.';
  console.log(result.webgl);
  // A real context loss must expose the static fallback and then recover.
  await page.evaluate(`window.lostContextTest=document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context');window.lostContextTest.loseContext();`);
  await page.locator('[data-scene-state="fallback"]').waitFor();
  await page.getByRole('button',{name:'Static visual',exact:true}).waitFor();
  await page.waitForTimeout(150);
  await page.evaluate(`window.lostContextTest.restoreContext();`);
  await page.locator('[data-scene-state="ready"]').waitFor();
  result.contextRecovery='Actual WebGL context loss/restoration passed.';console.log('Context recovery passed');
  await page.locator('.c-evidence-stack').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>{const rows=document.querySelectorAll('.c-evidence-stack article');return Number(getComputedStyle(rows[0]).opacity)>Number(getComputedStyle(rows[2]).opacity)+.01;},undefined,{timeout:3000});
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.c-evidence-stack article')).every(el=>Number(getComputedStyle(el).opacity)>.99));
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.locator('.c-evidence-stack').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('.c-evidence-stack article').first().evaluate((el:HTMLElement)=>Number(getComputedStyle(el).opacity)> .99),true);
  await page.getByRole('button',{name:'Start Practicing',exact:true}).focus();
  assert.equal(await page.locator('#start [data-reveal-group]').evaluate((el:HTMLElement)=>getComputedStyle(el).opacity),'1');
  result.scrollMotion='Real staggered row opacities observed; completed reveals do not replay; keyboard focus immediately exposes the closing CTA.';
  await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0);});await page.waitForTimeout(200);

  await page.getByRole('button',{name:'Resume scene motion',exact:true}).click();await page.waitForTimeout(150);
  await page.locator('#approach').scrollIntoViewIfNeeded();await page.waitForTimeout(450);const offscreen=await page.evaluate(()=>(window as any).sceneDraws);await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>(window as any).sceneDraws),offscreen);
  await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>(window as any).sceneDraws)>offscreen);
  result.visibility='Rendering suspends offscreen and restarts on return. Keyboard skip-link focus passed.';
  const programsBeforePreference=await page.evaluate(()=>(window as any).disposedScenePrograms);
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.cinema[data-motion-policy="reduced"]').waitFor();await page.waitForTimeout(150);
  const reducedDraws=await page.evaluate(()=>(window as any).sceneDraws);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>(window as any).sceneDraws),reducedDraws);
  assert.equal(await page.evaluate(()=>(window as any).disposedScenePrograms),programsBeforePreference);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>(window as any).sceneDraws)>reducedDraws);
  result.preferenceChange='Runtime reduced-motion changes stop/restart drawing without reallocating WebGL resources.';

  await page.getByText('Speak with a lifelike AI interviewer that adapts to your skills, challenges your thinking, and helps you improve with every answer.',{exact:true}).waitFor();
  // C. How it works: three distinct, implemented steps built from the real setup options.
  assert.equal(await page.locator('#how-it-works .c-step-card').count(),3);
  for(const name of ['Choose an interview type','Practice with the AI interviewer','Review feedback and improve'])await page.getByRole('heading',{name,exact:true}).waitFor();
  assert.equal(await page.locator('#how-it-works .c-available').count(),3);
  for(const label of ['Complete interview','Technical deep dive','Behavioral & communication'])assert.equal(await page.locator('#how-it-works .c-type strong',{hasText:label}).count(),1);
  assert.equal(await page.locator('.c-step-review .c-preview-example').innerText(),'EXAMPLE DATA');
  // D. Features: only the four implemented capabilities, plus what depends on configuration.
  assert.deepEqual(await page.locator('#capabilities .c-capability-grid h3').allInnerTexts(),['Voice-based interview practice','Technical and behavioral preparation','Feedback and performance analysis','History and progress tracking']);
  await page.locator('#capabilities .c-availability').getByText('deterministic demo mode',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Weak answer',exact:true}).click();await page.getByRole('heading',{name:'If a payment succeeds but its response is lost, what could happen when the client sends it again?'}).waitFor();
  await page.getByRole('button',{name:'Partial answer',exact:true}).click();await page.getByRole('heading',{name:'What should the server return when it receives the same idempotency key again?'}).waitFor();
  await page.getByRole('button',{name:'Strong answer',exact:true}).click();await page.getByRole('heading',{name:'How would you enforce idempotency when two identical requests arrive at the same time?'}).waitFor();
  assert.deepEqual(await page.locator('#candidate-fill stop').evaluateAll((stops:SVGStopElement[])=>stops.map(stop=>stop.getAttribute('stop-color'))),['#007ba7','#0a0a0a']);
  assert.equal(await page.locator('.c-room-preview video,.c-room-preview audio,.c-room-preview button').count(),0);
  await page.getByText('Illustrative report · these scores and answers are examples, not your results.',{exact:true}).waitFor();
  assert.equal(await page.locator('.c-report-preview progress').count(),3);
  assert.equal(await page.locator('.c-report-roadmap li').count(),3);
  assert.equal(await page.getByRole('heading',{name:'Walk into your next interview prepared.'}).count(),1);
  result.productSections='Three implemented how-it-works steps with real interview types; four implemented features with an availability note; three distinct labelled response paths; non-capturing room preview; labelled example skill breakdown, evidence, feedback and three-step roadmap passed.';
  // Motion: sticky condensed navigation, current-section marking, turn-taking cycle, bar fill.
  await page.locator('#capabilities').scrollIntoViewIfNeeded();await page.waitForTimeout(700);
  assert.equal(await page.locator('.cinema > .c-nav').evaluate((el:HTMLElement)=>({position:getComputedStyle(el).position,top:el.getBoundingClientRect().top,scrolled:el.classList.contains('is-scrolled')})).then(JSON.stringify),JSON.stringify({position:'sticky',top:0,scrolled:true}));
  await page.waitForFunction(()=>document.querySelector('.c-nav nav a[aria-current="location"]')?.getAttribute('href')==='#capabilities');
  await page.locator('.c-step-practice').scrollIntoViewIfNeeded();
  const firstTurn=await page.locator('.c-practice-states .is-on').innerText();
  await page.waitForFunction((first:string)=>document.querySelector('.c-practice-states .is-on')?.textContent!==first,firstTurn,{timeout:5000});
  await page.locator('.c-step-review').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.c-review-bar em')).every((el)=>new DOMMatrix(getComputedStyle(el).transform).a>.99),undefined,{timeout:4000}).catch(async(error:Error)=>{console.error('Bar state',await page.evaluate(()=>Array.from(document.querySelectorAll('.c-review-bar em')).map((el)=>({transform:getComputedStyle(el).transform,style:(el as HTMLElement).style.transform,top:Math.round(el.getBoundingClientRect().top),vh:innerHeight,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches}))));throw error;});
  result.motionSections='Sticky navigation condenses after scrolling and marks the current section; the illustrative turn-taking cycle advances while visible; example skill bars fill on reveal using transforms.';
  // Nine-colour identity: every brand colour is defined and used in its intended role.
  const palette=await page.evaluate(`(() => { const root = getComputedStyle(document.querySelector('.cinema')); const token = (name) => root.getPropertyValue(name).trim().toLowerCase(); const style = (selector, property) => { const el = document.querySelector(selector); return el ? getComputedStyle(el).getPropertyValue(property) : ''; };
    return { tokens: ['--ink','--ivory','--teal','--charcoal','--earth','--amber','--jet','--cerulean','--rose'].map(token),
      roles: { type: style('#c-hero-title','color'), page: style('.cinema','background-color'), steps: style('.c-steps','background-color'), features: style('.c-capabilities','background-color'), button: style('.c-hero-actions .c-primary','background-color'), number: style('.c-step-number','color'), footerRule: style('.c-footer','border-top-color') } }; })()`) as {tokens:string[];roles:Record<string,string>};
  assert.deepEqual(palette.tokens,['#031211','#e8e4d3','#00aebb','#090907','#6c5636','#b99d73','#0a0a0a','#007ba7','#ff2d95']);
  assert.deepEqual([palette.roles.type,palette.roles.page,palette.roles.steps,palette.roles.features,palette.roles.button,palette.roles.number],['rgb(232, 228, 211)','rgb(10, 10, 10)','rgb(3, 18, 17)','rgb(9, 9, 7)','rgb(0, 174, 187)','rgb(185, 157, 115)']);
  assert.ok(palette.roles.footerRule.startsWith('rgba(108, 86, 54'));
  assert.equal(await page.locator('.c-hero-bust').getAttribute('data-particles'),'520');
  // Cinematic film: lazy, plays only on screen, real pause/play, GSAP opens the frame.
  await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(300);
  const fresh=await context.newPage();await fresh.goto(origin);await fresh.locator('[data-scene-state="ready"],[data-scene-state="fallback"]').first().waitFor();await fresh.waitForTimeout(1500);
  const filmRequestedEarly=await fresh.evaluate(()=>performance.getEntriesByType('resource').some((entry)=>entry.name.endsWith('/media/hero-film.mp4')));await fresh.close();
  await page.locator('#the-interviewer').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>(document.getElementById('the-interviewer') as HTMLElement).dataset.film==='playing',undefined,{timeout:20000});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.c-film-frame')!).clipPath.replace(/\s/g,'').startsWith('inset(0'),undefined,{timeout:6000});
  const filmTime=await page.locator('.c-film-video').evaluate((video:HTMLVideoElement)=>video.currentTime);
  await page.getByRole('button',{name:'Pause film',exact:true}).click();
  await page.waitForFunction(()=>(document.querySelector('.c-film-video') as HTMLVideoElement).paused);
  await page.getByRole('button',{name:'Play film',exact:true}).waitFor();
  await page.locator('#capabilities').scrollIntoViewIfNeeded();await page.locator('#the-interviewer').scrollIntoViewIfNeeded();await page.waitForTimeout(600);
  assert.equal(await page.locator('.c-film-video').evaluate((video:HTMLVideoElement)=>video.paused),true,'a paused film stays paused when scrolled back into view');
  result.cinema=`All nine palette tokens defined and used by role (Ivory type, Jet page, Ink steps, Charcoal features, Teal buttons, Amber numerals, Earth Brown rules); 520 shader particles; film requested only near its section (early request: ${filmRequestedEarly}); plays on screen (${filmTime.toFixed(2)} s), GSAP opens the frame to full bleed, Pause film holds.`;
  assert.equal(filmRequestedEarly,false);
  await page.getByRole('link',{name:'About',exact:true}).click();assert.ok(page.url().endsWith('#approach'));
  await page.getByRole('heading',{name:'Structure sets the stage. Your thinking leads the way.'}).waitFor();
  for(const selector of ['#how-it-works','#capabilities','#approach','#interview-room','.c-development','.c-report-preview','#start','.c-footer']){await page.locator(selector).scrollIntoViewIfNeeded();await page.waitForTimeout(800);}
  // Performance: Three.js and the model are requested only after first contentful paint; layout stays stable.
  const loading=await page.evaluate(()=>{const fcp=performance.getEntriesByName('first-contentful-paint')[0]?.startTime??Infinity;const heavy=performance.getEntriesByType('resource').filter((entry)=>/three|GLTFLoader|RoomEnvironment|hero-bust\.glb/.test(entry.name));return {fcp,heavy:heavy.map((entry)=>({name:entry.name.split('/').pop(),start:entry.startTime})),cls:(window as any).layoutShift};});
  assert.ok(loading.heavy.length>=2,'3D chunks and model should be observed');
  assert.ok(loading.heavy.every((entry:any)=>entry.start>loading.fcp),`3D work must start after first contentful paint (${Math.round(loading.fcp)} ms): ${JSON.stringify(loading.heavy)}`);
  assert.ok(loading.cls<.05,`cumulative layout shift ${loading.cls}`);
  // Contrast: every visible text element meets WCAG AA (4.5:1, or 3:1 for large text).
  const contrastSource=fs.readFileSync(path.resolve('scripts/contrast-audit.js'),'utf8');
  const contrast=await page.evaluate(`${contrastSource}('.cinema')`) as {checked:number;failing:number;failures:unknown};
  assert.ok(contrast.checked>150);assert.equal(contrast.failing,0,`contrast failures: ${JSON.stringify(contrast.failures)}`);
  result.performance=`First contentful paint ${Math.round(loading.fcp)} ms; Three.js chunks and the hero model start afterwards (${Math.round(Math.min(...loading.heavy.map((entry:any)=>entry.start)))} ms); CLS ${loading.cls.toFixed(4)}; ${contrast.checked} visible text elements meet WCAG AA contrast.`;
  await page.screenshot({path:path.resolve('.browser-verification/cinematic-full.png'),fullPage:true});
  for(const [selector, name] of [['.c-adaptive-demo','adaptive'],['.c-room-preview','room'],['.c-report-preview','report']]) { await page.locator(selector).screenshot({path:path.resolve(`.browser-verification/landing-${name}.png`)}); }
  assert.equal(await page.locator('.cinema a[href^="#"]').evaluateAll((links:HTMLAnchorElement[])=>links.every(link=>!!document.getElementById(link.hash.slice(1)))),true);
  await page.getByRole('button',{name:'Set up an interview',exact:true}).click();await page.getByLabel('Email address',{exact:true}).waitFor();await page.goto(origin);
  await page.getByRole('button',{name:'Start Practicing',exact:true}).click();await page.getByLabel('Email address',{exact:true}).waitFor();await page.goto(origin);await page.locator('[data-scene-state="ready"]').waitFor();
  await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(300);
  const disposalCount=await page.evaluate(()=>(window as any).disposedScenePrograms);await page.getByRole('button',{name:'Start Your Interview',exact:true}).first().click();await page.getByLabel('Email address',{exact:true}).waitFor();assert.ok(await page.evaluate(()=>(window as any).disposedScenePrograms)>disposalCount);result.cleanup='Navigating into the product deletes scene GPU resources.';
  await page.goto(origin);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByLabel('Email address',{exact:true}).waitFor();
  assert.equal((await context.request.post(`${origin}/auth/register`,{data:{name:'Landing verifier',email:`landing-${Date.now()}@example.test`,password:'LandingVerify!2026'}})).status(),201);
  await page.goto(origin);await page.getByRole('button',{name:'Workspace',exact:true}).click();await page.getByRole('heading',{name:'Interview history',exact:true}).waitFor();
  await page.goto(origin);await page.getByRole('button',{name:'Start practicing',exact:true}).click();await page.getByLabel('Resume file',{exact:true}).waitFor({state:'attached'});
  const formContext=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});const form=await formContext.newPage();
  await form.goto(origin);await form.getByRole('button',{name:'Sign in',exact:true}).click();await form.getByLabel('Email address',{exact:true}).waitFor();
  if(!await form.getByLabel('Full name',{exact:true}).count())await form.getByRole('button',{name:'Create account',exact:true}).click();
  await form.getByLabel('Full name',{exact:true}).fill('Form verifier');await form.getByLabel('Email address',{exact:true}).fill(`form-${Date.now()}@example.test`);
  await form.getByLabel('Password',{exact:true}).fill('short');await form.getByRole('button',{name:'Create candidate account',exact:true}).click();
  assert.equal(await form.getByLabel('Password',{exact:true}).evaluate((el:HTMLInputElement)=>el.validity.valid),false);
  await form.getByLabel('Password',{exact:true}).fill(`Form-${Date.now()}-Verify!`);await form.getByRole('button',{name:'Create candidate account',exact:true}).click();
  await form.getByRole('heading',{name:'Interview history',exact:true}).waitFor();await formContext.close();
  result.navigation='Primary CTA, Sign in, the real sign-up form (short password rejected, valid account created and signed in), workspace and resume routes passed.';console.log('Existing app navigation and GPU cleanup passed');
  const mobile=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',isMobile:true,deviceScaleFactor:1});const phone=await mobile.newPage();
  await phone.goto(origin);await phone.locator('[data-scene-state="ready"][data-motion="still"]').waitFor();assert.equal(await phone.getByRole('button',{name:'Motion reduced',exact:true}).isDisabled(),true);
  assert.equal(await phone.locator('.cinema').getAttribute('data-motion-policy'),'reduced');
  assert.equal(await phone.locator('.c-method li,.c-evidence-stack article,.c-capability-grid article').evaluateAll((elements:Element[])=>elements.every(el=>Number(getComputedStyle(el).opacity)===1)),true);
  for(const selector of ['.c-hero','#how-it-works','#capabilities','#approach','#interview-room','.c-development','.c-report-preview','#start','.c-footer']){await phone.locator(selector).scrollIntoViewIfNeeded();assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await phone.evaluate(()=>window.scrollTo(0,0));
  await phone.locator('#the-interviewer').scrollIntoViewIfNeeded();await phone.waitForTimeout(1200);
  assert.equal(await phone.locator('#the-interviewer').getAttribute('data-film'),'paused');
  assert.equal(await phone.evaluate(()=>performance.getEntriesByType('resource').some((entry)=>/\/(gsap|ScrollTrigger)-/.test(entry.name))),false,'GSAP must not load under reduced motion');
  await phone.getByRole('button',{name:'Play film',exact:true}).click();await phone.waitForFunction(()=>(document.getElementById('the-interviewer') as HTMLElement).dataset.film==='playing',undefined,{timeout:20000});
  await phone.getByRole('button',{name:'Pause film',exact:true}).click();
  // Reduced motion: no cycling and no bar animation.
  await phone.locator('.c-step-practice').scrollIntoViewIfNeeded();
  const stillTurn=await phone.locator('.c-practice-states .is-on').innerText();await phone.waitForTimeout(2800);
  assert.equal(await phone.locator('.c-practice-states .is-on').innerText(),stillTurn);
  assert.equal(await phone.locator('.c-review-bar em').first().evaluate((el:HTMLElement)=>new DOMMatrix(getComputedStyle(el).transform).a),1);
  await phone.evaluate(()=>window.scrollTo(0,0));
  await phone.getByRole('button',{name:'Open menu',exact:true}).click();
  const mobileMenu=phone.locator('#c-mobile-menu');await mobileMenu.waitFor();
  assert.deepEqual(await mobileMenu.getByRole('link').allInnerTexts(),['How it works','Features','About']);
  await phone.screenshot({path:path.resolve('.browser-verification/cinematic-mobile-menu.png')});
  await phone.keyboard.press('Escape');await mobileMenu.waitFor({state:'detached'});
  assert.equal(await phone.getByRole('button',{name:'Open menu',exact:true}).evaluate((el:HTMLElement)=>el===document.activeElement),true);
  await phone.getByRole('button',{name:'Open menu',exact:true}).click();await mobileMenu.getByRole('link',{name:'Features'}).click();
  await mobileMenu.waitFor({state:'detached'});await phone.waitForFunction(()=>location.hash==='#capabilities');
  await phone.evaluate(()=>window.scrollTo(0,0));await phone.screenshot({path:path.resolve('.browser-verification/cinematic-mobile.png')});await mobile.close();result.mobileNavigation='Reduced motion: the film does not autoplay, GSAP is never downloaded, and Play/Pause film work; it also keeps the turn-taking illustration and skill bars still. Phone menu opens, lists How it works / Features / About, closes on Escape with focus returned, and navigates.';console.log('Mobile checks passed');
  const narrow=await browser.newContext({viewport:{width:320,height:740},reducedMotion:'reduce'});const small=await narrow.newPage();await small.goto(origin);await small.getByRole('heading',{name:'Interview practice that feels real.'}).waitFor();assert.equal(await small.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await narrow.close();console.log('Narrow checks passed');
  for(const [width,height] of [[768,1024],[1024,768]]){const tabletContext=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});const tablet=await tabletContext.newPage();await tablet.goto(origin);await tablet.locator('[data-scene-state="ready"],[data-scene-state="fallback"]').first().waitFor();
    for(const selector of ['.c-hero','#how-it-works','#capabilities','#approach','#interview-room','.c-report-preview','#start','.c-footer']){await tablet.locator(selector).scrollIntoViewIfNeeded();assert.equal(await tablet.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}x${height} overflows at ${selector}`);}
    await tablet.evaluate(()=>window.scrollTo(0,0));const cta=await tablet.getByRole('button',{name:'Start Your Interview',exact:true}).boundingBox();assert.ok(cta&&cta.y+cta.height<=height);
    assert.equal(await tablet.getByRole('link',{name:'How it works',exact:true}).first().isVisible(),true);await tablet.screenshot({path:path.resolve(`.browser-verification/cinematic-tablet-${width}x${height}.png`)});await tabletContext.close();}
  result.tablet='Portrait 768x1024 and landscape 1024x768: no horizontal overflow in any section, CTA in the first viewport, desktop navigation visible.';
  const laptop=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});const laptopPage=await laptop.newPage();await laptopPage.goto(origin);await laptopPage.locator('[data-scene-state="ready"]').waitFor();const heroBounds=await laptopPage.locator('.c-hero').boundingBox();console.log('Laptop hero bounds',heroBounds);assert.ok(heroBounds&&heroBounds.y+heroBounds.height<=770);await laptopPage.screenshot({path:path.resolve('.browser-verification/cinematic-laptop.png')});await laptop.close();
  result.responsive='Desktop first-viewport, 1366px laptop, 390px/320px overflow and reduced-motion checks passed.';
  const fallback=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await fallback.addInitScript({content:`const context=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl'||type==='webgl2')return null;return context.call(this,type,...args);};`});
  const staticPage=await fallback.newPage();await staticPage.goto(origin);await staticPage.locator('[data-scene-state="fallback"]').waitFor();await staticPage.getByRole('button',{name:'Static visual',exact:true}).waitFor();await staticPage.getByRole('button',{name:'Start Your Interview',exact:true}).first().click();await staticPage.getByLabel('Email address',{exact:true}).waitFor();
  result.fallback='No-WebGL static art preserves the candidate entry path.';
  const missingAsset=await browser.newContext({reducedMotion:'reduce'});
  await missingAsset.route('**/models/hero-bust.glb',(route:any)=>route.fulfill({status:404,body:'Asset unavailable'}));
  const missingPage=await missingAsset.newPage();await missingPage.goto(origin);await missingPage.locator('[data-scene-state="fallback"]').waitFor();
  await missingPage.getByRole('button',{name:'Static visual',exact:true}).waitFor();await missingPage.getByRole('button',{name:'Start Your Interview',exact:true}).first().click();await missingPage.getByLabel('Email address',{exact:true}).waitFor();await missingAsset.close();
  const noFilm=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});await noFilm.route('**/media/hero-film.mp4',(route:any)=>route.fulfill({status:404,body:'missing'}));
  const noFilmPage=await noFilm.newPage();await noFilmPage.goto(origin);await noFilmPage.locator('#the-interviewer').scrollIntoViewIfNeeded();
  await noFilmPage.getByRole('button',{name:'Play film',exact:true}).click();
  await noFilmPage.waitForFunction(()=>(document.getElementById('the-interviewer') as HTMLElement).dataset.film==='failed',undefined,{timeout:10000});
  await noFilmPage.getByText('Film unavailable · showing a still frame',{exact:true}).waitFor();assert.equal(await noFilmPage.getByRole('button',{name:'Play film',exact:true}).count(),0);await noFilm.close();
  result.assetFailure='A real failed GLB request shows static fallback and preserves the candidate entry path.';
  const lowPower=await browser.newContext({viewport:{width:1100,height:900},reducedMotion:'no-preference'});
  await lowPower.addInitScript({content:`Object.defineProperty(Navigator.prototype,'hardwareConcurrency',{get:()=>2});`});
  const glbRequests:string[]=[];const lowPage=await lowPower.newPage();lowPage.on('request',(request:any)=>{if(request.url().endsWith('.glb'))glbRequests.push(request.url());});
  await lowPage.goto(origin);await lowPage.locator('.c-hero-bust[data-poster-only][data-scene-state="fallback"]').waitFor();
  assert.ok(await lowPage.locator('.c-hero-bust .blender-poster').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0));
  assert.equal(await lowPage.locator('.c-hero-bust canvas').count(),0);assert.deepEqual(glbRequests,[]);
  await lowPage.getByRole('button',{name:'Start Your Interview',exact:true}).first().click();await lowPage.getByLabel('Email address',{exact:true}).waitFor();await lowPower.close();
  result.lowPower='Low-power devices show the Blender poster without creating WebGL or downloading the GLB; the candidate entry path works.';
  // Real Web Audio synthesis: observe generated samples, not mocked playback.
  const soundContext=await browser.newContext({viewport:{width:1100,height:900},reducedMotion:'reduce'});
  await soundContext.addInitScript({content:`window.audioChecks={contexts:[],peaks:[]};const nativeStart=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){if(this.buffer){let max=0;for(const value of this.buffer.getChannelData(0))max=Math.max(max,Math.abs(value));window.audioChecks.peaks.push(max);}return nativeStart.apply(this,args);};const NativeAudio=window.AudioContext;window.AudioContext=class extends NativeAudio{constructor(options){super(options);window.audioChecks.contexts.push(this);}createGain(){const gain=super.createGain();const analyser=this.createAnalyser();analyser.fftSize=256;gain.connect(analyser);const samples=new Float32Array(256);const index=window.audioChecks.peaks.push(0)-1;const sample=()=>{if(this.state==='closed'){analyser.disconnect();return;}analyser.getFloatTimeDomainData(samples);window.audioChecks.peaks[index]=Math.max(window.audioChecks.peaks[index],...samples.map(Math.abs));requestAnimationFrame(sample);};requestAnimationFrame(sample);return gain;}};`});
  const audioPage=await soundContext.newPage();const audioErrors:string[]=[];audioPage.on('pageerror',(e:Error)=>audioErrors.push(e.message));await audioPage.goto(origin);
  const soundToggle=audioPage.getByRole('button',{name:'Interface sounds',exact:true});await soundToggle.waitFor();assert.equal(await soundToggle.getAttribute('aria-pressed'),'false');
  await audioPage.getByRole('button',{name:'Weak answer',exact:true}).click();await audioPage.waitForTimeout(400);
  assert.equal(await audioPage.evaluate(()=>(window as any).audioChecks.contexts.length),0);
  await soundToggle.click();await audioPage.waitForFunction(()=>document.querySelector('.c-sound-toggle')?.getAttribute('aria-pressed')==='true');
  await audioPage.waitForFunction(()=>(window as any).audioChecks.peaks.some((n:number)=>n>.001));
  await audioPage.waitForFunction(()=>(window as any).audioChecks.contexts.every((c:AudioContext)=>c.state==='closed'));
  // Cues are normalised to -22 LUFS or quieter (src/api/soundSystem.test.ts); their peaks stay below -9 dBFS.
  assert.ok(await audioPage.evaluate(()=>(window as any).audioChecks.peaks.every((n:number)=>n<.36)));
  await audioPage.waitForTimeout(400);await audioPage.getByRole('button',{name:'Strong answer',exact:true}).click();
  await audioPage.waitForFunction(()=>(window as any).audioChecks.contexts.length===2);await soundToggle.click();
  assert.equal(await soundToggle.getAttribute('aria-pressed'),'false');await audioPage.waitForFunction(()=>(window as any).audioChecks.contexts.every((c:AudioContext)=>c.state==='closed'));
  await audioPage.getByRole('button',{name:'Partial answer',exact:true}).click();await audioPage.waitForTimeout(400);assert.equal(await audioPage.evaluate(()=>(window as any).audioChecks.contexts.length),2);
  await soundToggle.click();await audioPage.waitForFunction(()=>document.querySelector('.c-sound-toggle')?.getAttribute('aria-pressed')==='true');await audioPage.getByRole('button',{name:'Start Your Interview',exact:true}).click();await audioPage.getByLabel('Email address',{exact:true}).waitFor();
  await audioPage.waitForFunction(()=>(window as any).audioChecks.contexts.every((c:AudioContext)=>c.state==='closed')); // released after a short idle
  // The choice is remembered across reloads (localStorage); turning it off is remembered too. Nothing plays on load.
  await audioPage.goto(origin);const remembered=audioPage.getByRole('button',{name:'Interface sounds',exact:true});assert.equal(await remembered.getAttribute('aria-pressed'),'true');await audioPage.waitForTimeout(600);
  const contextsAfterReload=await audioPage.evaluate(()=>(window as any).audioChecks.contexts.length);assert.equal(contextsAfterReload,0);
  await remembered.click();await audioPage.goto(origin);assert.equal(await audioPage.getByRole('button',{name:'Interface sounds',exact:true}).getAttribute('aria-pressed'),'false');
  assert.deepEqual(audioErrors,[]);await soundContext.close();
  for(const failure of ['unsupported','blocked']) {
    const silentContext=await browser.newContext({reducedMotion:'reduce'});
    await silentContext.addInitScript({content:failure==='unsupported'?`window.AudioContext=undefined;`:`AudioContext.prototype.resume=function(){return Promise.reject(new Error('Audio blocked'));};`});
    const silentPage=await silentContext.newPage();const silentErrors:string[]=[];silentPage.on('pageerror',(e:Error)=>silentErrors.push(e.message));await silentPage.goto(origin);
    await silentPage.getByRole('button',{name:'Interface sounds',exact:true}).click();await silentPage.getByRole('status').filter({hasText:'Sound unavailable.'}).waitFor();
    assert.equal(await silentPage.getByRole('button',{name:'Interface sounds',exact:true}).getAttribute('aria-pressed'),'false');
    await silentPage.getByRole('button',{name:'Weak answer',exact:true}).click();await silentPage.getByRole('heading',{name:'If a payment succeeds but its response is lost, what could happen when the client sends it again?'}).waitFor();
    assert.deepEqual(silentErrors,[]);await silentContext.close();
  }
  result.sound='No AudioContext before opt-in or on load; actual quiet nonzero synthesized samples; context closes after idle and on mute; the on/off choice persists across reloads; missing/blocked audio preserves the page without runtime errors. Physical speaker listening not performed.';
  assert.deepEqual(errors,[]);result.runtimeErrors=errors;console.log(JSON.stringify(result,null,2));
} catch(error){console.error('Landing verification failed:',error);throw error;} finally {fs.writeFileSync('.browser-verification/cinematic-checks.json',JSON.stringify(result,null,2));await browser.close();await server.close();await api.close();}

