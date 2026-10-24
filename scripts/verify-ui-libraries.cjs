const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');const assert=require('node:assert/strict');const path=require('node:path');const {completeRegistrationIfNeeded}=require('./browser-auth.cjs');
(async()=>{const dir=path.resolve('.browser-verification');const context=await chromium.launchPersistentContext(path.join(dir,'library-profile'),{executablePath:process.env.BROWSER_EXECUTABLE,headless:true,viewport:{width:390,height:844},reducedMotion:'reduce',env:{...process.env,TEMP:dir,TMP:dir}});
try{const page=await context.newPage();await page.goto('http://localhost:5173');
await page.getByRole('heading',{name:'Practice that adapts to you.'}).waitFor();
assert.equal(await page.locator('.hero-copy').evaluate(e=>getComputedStyle(e).opacity),'1');assert.equal(await page.locator('.siri-orb').first().evaluate(e=>getComputedStyle(e,'::before').animationName),'none');
const start=page.getByRole('button',{name:'Build my interview plan',exact:true});assert.ok((await start.getAttribute('class')).includes('retro-button'));await start.click();await completeRegistrationIfNeeded(page);
assert.equal(await page.locator('main').isVisible(),true);
assert.equal(await page.title(),'Interview setup · Interview AI');
let release;const gate=new Promise(resolve=>release=resolve);await page.route('**/resumes/file',async route=>{await gate;await route.continue();});
await page.getByLabel('Resume file').setInputFiles(path.resolve('src/testSupport/resume-upload.pdf'));await page.locator('.resume-processing').waitFor();assert.ok((await page.locator('.resume-processing').innerText()).length>0);release();
await page.getByText('Ready for your review',{exact:true}).waitFor();await page.getByRole('button',{name:/Confirm .*continue/i}).click();await page.getByRole('button',{name:'Build my interview plan'}).click();await page.getByRole('button',{name:'Enter interview room'}).click();
const toggle=page.getByRole('switch',{name:'Read each question aloud',exact:true});await toggle.waitFor();await toggle.focus();await page.keyboard.press('Space');assert.equal(await toggle.getAttribute('aria-checked'),'true');await page.keyboard.press('Space');assert.equal(await toggle.getAttribute('aria-checked'),'false');
const box=await page.locator('.unlumen-switch-thumb').boundingBox();assert.ok(Math.abs(box.width-20)<1 && Math.abs(box.height-20)<1);
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('.interviewer-visual').getAttribute('data-state'),'idle');
await page.screenshot({path:path.join(dir,'ui-libraries-mobile.png'),fullPage:true,animations:'disabled'});
console.log('Passed: Magic UI reduced motion, Retro UI live action, SmoothUI real request loader/orb, Unlumen keyboard switch and mobile thumb geometry.');
}finally{await context.close();}})().catch(e=>{console.error(e);process.exitCode=1});

