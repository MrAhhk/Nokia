// OPPO debug smoke test. Changes only the feature's local eligibility record,
// restores it in finally, opens chooser/store, and NEVER sends a message/review.
const {execFileSync}=require('child_process');
const fs=require('fs');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const adb='C:/Users/Admin/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const args=['-s','IB8XFY5DFMKBROGQ'];
const run=(...rest)=>execFileSync(adb,[...args,...rest],{encoding:'utf8',timeout:20000});
const key='nokia-launcher.week-check-in.v1';
(async()=>{
 const result={};let browser,page,original,forwarded=false;
 try{
  const pid=run('shell','pidof','com.nokialauncher').trim().split(/\s+/)[0];
  run('forward','tcp:9224',`localabstract:webview_devtools_remote_${pid}`);forwarded=true;
  browser=await chromium.connectOverCDP('http://127.0.0.1:9224');
  page=browser.contexts().flatMap(c=>c.pages()).find(p=>/localhost/.test(p.url()));
  if(!page)throw Error('Launcher WebView unavailable');
  page.setDefaultTimeout(10000);
  original=await page.evaluate(k=>localStorage.getItem(k),key);
  if(await page.locator('[data-testid="onboarding-guide"], [data-testid="tone-setup"]').count())throw Error('First-use setup is active; no user setup was skipped');
  await page.evaluate(k=>localStorage.setItem(k,JSON.stringify({startedAt:Date.now()-7*86400000,shown:false})),key);
  await page.reload();await page.locator('[data-testid="week-check-in"]').waitFor();
  result.duePrompt=true;
  await page.getByRole('button',{name:'Not yet',exact:true}).click();
  result.supportiveCopy=await page.locator('[data-testid="week-check-in"]').evaluate(el=>el.innerText.includes('Change takes time'));
  await page.getByRole('button',{name:'Share with a friend',exact:true}).click();
  result.shareActivity=run('shell','dumpsys','activity','activities').split('\n').filter(s=>s.includes('mResumedActivity')).map(s=>s.trim());
  run('shell','input','keyevent','4');
  run('shell','am','start','-n','com.nokialauncher/.MainActivity');
  // Native Home may close the invitation. Permanent Settings actions stay usable.
  await page.locator('[aria-label="Home"]').click();
  await page.locator('[aria-label="Settings or Back"]').click();
  await page.getByText('Review on Google Play',{exact:true}).click();
  result.reviewActivity=run('shell','dumpsys','activity','activities').split('\n').filter(s=>s.includes('mResumedActivity')).map(s=>s.trim());
  run('shell','input','keyevent','4');run('shell','am','start','-n','com.nokialauncher/.MainActivity');
  await page.reload();await page.locator('[data-testid="screen-home"]').waitFor();
  result.didNotRepeat=await page.locator('[data-testid="week-check-in"]').count()===0;
  run('shell','dumpsys','gfxinfo','com.nokialauncher','reset');
  const input='12345678901234567890',timings=[];
  for(const digit of input){const start=performance.now();await page.locator(`[data-testid="keypad-btn-${digit}"]`).click();timings.push(performance.now()-start);}
  result.retained20Keys=(await page.locator('.lcd-dial-number').innerText()).replace(/\s/g,'')===input;
  const homes=[];
  for(let i=0;i<5;i++){
   await page.locator('[aria-label="Up"]').click();const start=performance.now();
   await page.locator('[aria-label="Home"]').click();await page.locator('[data-testid="screen-home"]').waitFor();homes.push(performance.now()-start);
  }
  const summary=list=>{list.sort((a,b)=>a-b);return{p50:list[Math.floor(list.length*.5)],p90:list[Math.min(list.length-1,Math.floor(list.length*.9))]};};
  result.keyCdpMs=summary(timings);result.homeCdpMs=summary(homes);
  result.gfx=run('shell','dumpsys','gfxinfo','com.nokialauncher').split('\n').filter(s=>/Total frames|Janky frames|percentile/.test(s)).map(s=>s.trim());
  result.mainActivityRecords=run('shell','dumpsys','activity','activities').split('\n').filter(s=>s.includes('Hist #')&&s.includes('com.nokialauncher/.MainActivity')).length;
 }catch(error){result.error=error.message;process.exitCode=1;}
 finally{
  if(page&&original!==undefined){try{await page.evaluate(({key,original})=>original===null?localStorage.removeItem(key):localStorage.setItem(key,original),{key,original});await page.reload();}catch(error){result.restoreError=error.message;}}
  if(browser)await browser.close();if(forwarded)run('forward','--remove','tcp:9224');
  fs.writeFileSync('../../docs/reports/2026-09-18-check-in-device-ui.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }
})();
