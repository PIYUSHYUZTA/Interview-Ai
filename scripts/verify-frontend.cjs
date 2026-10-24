const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openWorkspace } = require('./browser-auth.cjs');
(async () => {
 const artifacts = path.resolve('.browser-verification'); fs.mkdirSync(artifacts,{recursive:true});
 const browser = await chromium.launchPersistentContext(path.join(artifacts,'product-profile'),{
  executablePath:process.env.BROWSER_EXECUTABLE,headless:true,viewport:{width:1440,height:1050},
  args:['--use-fake-device-for-media-stream'],permissions:['camera','microphone'],downloadsPath:artifacts,env:{...process.env,TEMP:artifacts,TMP:artifacts}
 });
 try {
 const page=await browser.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 for(const scenario of [{name:'pdf-full',file:'pdf',rounds:4},{name:'docx-jd',file:'docx',rounds:2}]) {
 await openWorkspace(page);
 await page.getByRole('button',{name:'New interview',exact:true}).click();
 await page.getByLabel('Resume file').setInputFiles(path.resolve(`src/testSupport/resume-upload.${scenario.file}`));
 await page.getByText('Ready for your review',{exact:true}).waitFor();
 assert.ok((await page.getByLabel('Resume Text').inputValue()).includes('Jordan'));
 await page.getByLabel('Candidate Name').fill('Browser Journey Candidate');
 await page.getByRole('button',{name:'Re-analyze corrections'}).click();
 await page.getByText('Ready for your review',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Continue to preferences'}).click();
 await page.getByLabel('Rounds',{exact:true}).selectOption(String(scenario.rounds));
 await page.getByLabel('Questions per round').selectOption('2');
 if(scenario.file==='docx') {
 await page.getByLabel('Job description or role requirements (optional)').fill('An exciting opportunity.');
 await page.getByRole('button',{name:'Build my interview plan'}).click();
 await page.getByRole('alert').waitFor();
 await page.getByLabel('Job description or role requirements (optional)').fill('Database Engineer\nRequired: PostgreSQL, SQL, indexing and transactions.');
 }
 const createdResponse=page.waitForResponse(r=>r.url().endsWith('/interviews') && r.request().method()==='POST' && r.status()===201);
 await page.getByRole('button',{name:'Build my interview plan'}).click();
 const created=await(await createdResponse).json(); assert.equal(created.providerName,'deterministic');assert.equal(created.plan.totalQuestionBudget,scenario.rounds*2);
 await page.screenshot({animations:'disabled',path:path.join(artifacts,`${scenario.name}-plan.png`),fullPage:true});
 await page.getByRole('button',{name:'Enter interview room'}).click();
 const first=page.waitForResponse(r=>r.url().endsWith('/start') && r.status()===200);
 await page.getByRole('button',{name:'Start interview',exact:true}).click();
 let current=(await(await first).json()).currentQuestion;
 await page.getByLabel('Your answer',{exact:true}).waitFor();
 assert.equal(await page.locator('.question-text').innerText(),current.prompt);
 if(scenario.file==='pdf') {
 await page.getByRole('button',{name:'Enable camera',exact:true}).click();
 await page.getByRole('button',{name:'Turn camera off',exact:true}).waitFor();
 assert.equal(await page.locator('video').evaluate(v=>{window.cameraTracks=v.srcObject.getTracks();return v.videoWidth>0 && window.cameraTracks[0].readyState==='live'}),true);
 await page.screenshot({animations:'disabled',path:path.join(artifacts,'product-room.png'),fullPage:true});
 await page.getByRole('button',{name:'Turn camera off',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.cameraTracks.every(t=>t.readyState==='ended')),true);
 await page.evaluate(()=>{window.spoken=[];const original=speechSynthesis.speak.bind(speechSynthesis);speechSynthesis.speak=u=>{window.spoken.push(u.text);original(u)}});
 await page.getByRole('button',{name:'Read question aloud'}).click();
 assert.deepEqual(await page.evaluate(()=>window.spoken),[current.prompt]);
 await page.waitForTimeout(1500);
 console.log('Native speech playback state:',await page.locator('.studio-main .status').first().innerText(), 'voices:',await page.evaluate(()=>speechSynthesis.getVoices().length));
 await page.getByRole('button',{name:'Start microphone',exact:true}).click();
 await page.waitForTimeout(2500);
 console.log('Native microphone state:',await page.locator('.media-buttons').innerText(),'alerts:',await page.getByRole('alert').allTextContents());
 const cancel=page.getByRole('button',{name:/Mute microphone|Cancel microphone/});if(await cancel.count())await cancel.click();
 await page.getByRole('button',{name:'Exit interview',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({animations:'disabled',path:path.join(artifacts,'product-room-mobile.png'),fullPage:true});await page.setViewportSize({width:1440,height:1050});
 }
 const ids=new Set();
 for(let i=0;i<scenario.rounds*2;i++) {
 assert.equal(ids.has(current.id),false);ids.add(current.id);
 const box=page.getByLabel('Your answer',{exact:true});await box.waitFor();
 await box.fill(i%3===0?'First I define the consistency requirement. I use transactions, indexes and unique constraints, and compare isolation levels. In production I measure latency, test concurrent requests and failure recovery. In summary, I document the trade-off and monitor the outcome.':i%3===1?'I do not know how to explain this yet.':'I understand the concept but am unsure about failure cases. I would measure the behavior with a small example.');
 if(i===0){await page.route('**/answer',r=>r.abort(),{times:1});await page.getByRole('button',{name:'Submit answer',exact:true}).click();await page.getByRole('alert').first().waitFor();assert.ok((await box.inputValue()).length);}
 const response=page.waitForResponse(r=>r.url().endsWith('/answer')&&r.status()===200);
 await page.getByRole('button',{name:'Submit answer',exact:true}).click();const result=await(await response).json();assert.equal(result.publicState.progress.totalQuestionsAnswered,i+1);
 if(i===scenario.rounds*2-1)assert.equal(result.state,'COMPLETED');
 else {const next=page.waitForResponse(r=>r.url().includes('/next')&&r.status()===200);await page.getByRole('button',{name:/^Next question$|^Continue to round/}).click();current=(await(await next).json()).currentQuestion;await page.getByLabel('Your answer',{exact:true}).waitFor();assert.equal(await page.locator('.question-text').innerText(),current.prompt);assert.equal(await box.inputValue(),'');}
 }
 await page.getByRole('button',{name:'View my assessment'}).click();
 await page.getByRole('heading',{name:'Your improvement roadmap'}).waitFor();
 await page.getByRole('heading',{name:'Supporting interview evidence'}).waitFor();
 assert.equal(await page.locator('details').count(),scenario.rounds*2);
 await page.screenshot({animations:'disabled',path:path.join(artifacts,`${scenario.name}-results.png`),fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({animations:'disabled',path:path.join(artifacts,'product-results-mobile.png'),fullPage:true});await page.setViewportSize({width:1440,height:1050});
 console.log(JSON.stringify({scenario:scenario.name,answers:ids.size,plan:created.plan.roleTitle,upload:'passed',networkRetry:'passed',assessment:'passed'}));
 }
 await page.getByRole('button',{name:'Overview',exact:true}).click();await page.getByRole('heading',{name:'Keep moving forward, Browser.'}).waitFor();await page.screenshot({animations:'disabled',path:path.join(artifacts,'product-dashboard-results.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('Full browser journeys passed; no uncaught page errors. Camera tested with Chromium synthetic device. Native speech availability reported separately.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
