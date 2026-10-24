// Uses actual backend sessions to verify readiness, comparison and report displays.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');const assert=require('node:assert/strict');const path=require('node:path');
const {openWorkspace}=require('./browser-auth.cjs');
(async()=>{const dir=path.resolve('.browser-verification');const browser=await chromium.launchPersistentContext(path.join(dir,'dashboard-profile'),{executablePath:process.env.BROWSER_EXECUTABLE,headless:true,viewport:{width:1440,height:1050},env:{...process.env,TEMP:dir,TMP:dir}});
try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await openWorkspace(page);
const post=async(url,data)=>{const response=await browser.request.post(`http://localhost:5173${url}`,{data});assert.ok(response.ok(),await response.text());return response.json()};
const resume=await post('/resumes/upload',{candidateName:'Development Check',resumeText:'Development Check\nBackend engineer with 4 years of Node.js, SQL and PostgreSQL experience. Built APIs using transactions, indexes and idempotency.'});
const reports=[];
for(let run=0;run<2;run++){
const session=await post('/interviews',{resumeId:resume.resumeId,numRounds:1,questionsPerRound:2,answerMode:'text',rolePreset:'backend'});
let state=await post(`/interviews/${session.sessionId}/start`,{});
for(let i=0;i<2;i++){await post(`/interviews/${session.sessionId}/answer`,{questionId:state.currentQuestion.id,text:run?'I do not know.':'First I use unique constraints and transactions to implement idempotent writes. I test concurrent calls and failures, compare isolation levels and explain trade-offs. In production I monitor latency, retries and correctness.'});if(i===0)state=await post(`/interviews/${session.sessionId}/next-question`,{});}
await post(`/interviews/${session.sessionId}/complete`,{});reports.push(await(await browser.request.get(`http://localhost:5173/interviews/${session.sessionId}/results`)).json());}
assert.equal(reports[0].comparisonKey,reports[1].comparisonKey);assert.ok(reports[1].readiness);
await page.goto('http://localhost:5173');await page.getByRole('button',{name:'Workspace',exact:true}).click();await page.getByRole('heading',{name:'Keep moving forward, Development.'}).waitFor();
assert.equal(await page.locator('.readiness-card .score-ring strong').innerText(),reports[1].readiness.score===null?'—':reports[1].readiness.score.toFixed(1));
await page.getByText('How readiness is calculated',{exact:true}).click();await page.getByText(reports[1].readiness.methodology,{exact:true}).waitFor();
for(const [id,skill] of Object.entries(reports[1].skillMap).filter(([,s])=>s.samples>0)){
const article=page.locator('.development-grid article').filter({hasText:id.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase())});
assert.ok((await article.innerText()).includes(skill.estimate.toFixed(1)));
if(reports[0].skillMap[id]?.samples)assert.ok((await article.innerText()).includes(`Previous ${reports[0].skillMap[id].estimate.toFixed(1)}`));}
await page.getByRole('button',{name:'Completed',exact:true}).click();assert.ok((await page.locator('.history-list').innerText()).includes('Development Check'));
await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(dir,'four-priorities-dashboard.png'),fullPage:true,animations:'disabled'});
await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(dir,'four-priorities-dashboard-mobile.png'),fullPage:true,animations:'disabled'});
await page.getByRole('button',{name:'Explore assessment',exact:true}).click();await page.getByRole('heading',{name:'Supporting interview evidence'}).waitFor();await page.locator('.evidence summary').first().click();await page.getByRole('heading',{name:'What to improve',exact:true}).waitFor();
for(const text of reports[1].evidence[0].feedback.improvements)assert.ok((await page.locator('.evidence').innerText()).includes(text));
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.setViewportSize({width:1440,height:1050});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(dir,'four-priorities-report.png'),fullPage:true,animations:'disabled'});
assert.deepEqual(errors,[]);console.log('Passed: actual readiness/coverage, two matching skill baselines, history filter, report feedback, desktop/mobile layout and no page errors.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
