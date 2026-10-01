// Unique local debug package. Never changes default Home or user app settings.
const {execFileSync}=require('child_process');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'); const path=require('path'); const assert=require('assert/strict');
const adb='C:/Users/Admin/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const pkg='com.nokialauncher.sidephonecheck';
const out=path.resolve(__dirname,'../../../docs/reports/2026-10-01-sidephone-sharpness');
const run=(...args)=>execFileSync(adb,['-s','IB8XFY5DFMKBROGQ',...args],{encoding:'utf8',timeout:20000});
const launch=()=>run('shell','am','start','-W','-a','android.intent.action.MAIN','-c','android.intent.category.HOME','-p',pkg);
const summary=v=>{v.sort((a,b)=>a-b);return {samples:v.length,p50:Math.round(v[Math.floor(v.length*.5)]),p90:Math.round(v[Math.min(v.length-1,Math.floor(v.length*.9))])};};
let browser,page;
const result={package:pkg,plan:'One paired run: six menu/Home cycles and twenty digits per appearance; no screenshots during timing',timing:'CDP click and DOM readiness includes transport; Android gfx percentiles reported separately'};
async function connect(){
  const pid=run('shell','pidof',pkg).trim().split(/\s+/)[0]; assert(pid);
  run('forward','tcp:9232',`localabstract:webview_devtools_remote_${pid}`);
  browser=await chromium.connectOverCDP('http://127.0.0.1:9232');
  page=browser.contexts()[0].pages().find(p=>p.url().includes('localhost')); assert(page);
}
async function restart(){await page.waitForTimeout(1500);if(browser)await browser.close();run('shell','am','force-stop',pkg);launch();await new Promise(resolve=>setTimeout(resolve,2000));await connect();await page.getByTestId('screen-home').waitFor();}
const click=async locator=>locator.click();
async function measure(appearance){
  run('shell','dumpsys','gfxinfo',pkg,'reset');
  const homes=[],keys=[];
  for(let i=0;i<6;i++){
    result.stage=`${appearance} menu/Home ${i+1}`;console.log(result.stage);
    await click(page.getByRole('button',{name:'Menu',exact:true})); await page.getByTestId('screen-menu').waitFor();
    const t=performance.now(); await click(page.getByRole('button',{name:'Home',exact:true}));await page.getByTestId('screen-home').waitFor();homes.push(performance.now()-t);
  }
  for(const digit of '12345678901234567890'){
    const t=performance.now();await click(page.getByTestId(`keypad-btn-${digit}`));keys.push(performance.now()-t);
  }
  assert.equal((await page.locator('.lcd-dial-number').innerText()).replace(/\s/g,''),'12345678901234567890');
  result[appearance]={home:summary(homes),keys:summary(keys),retained20Keys:true,gfx:run('shell','dumpsys','gfxinfo',pkg).split('\n').filter(l=>/Total frames|Janky frames|percentile/.test(l)).map(l=>l.trim())};
  await click(page.getByRole('button',{name:'Home',exact:true}));await page.getByTestId('screen-home').waitFor();
}
(async()=>{
  try{
    launch(); await connect();
    if(await page.getByRole('button',{name:'Not now',exact:true}).count()) await page.getByRole('button',{name:'Not now',exact:true}).click();
    await page.evaluate(()=>{localStorage.setItem('nokia-launcher.onboarding',JSON.stringify({completed:true}));localStorage.setItem('nokia-launcher-system-tone-setup.v1','skipped');localStorage.setItem('nokia-launcher.appearance.v1','nokia');});
    await restart();await measure('original');
    await click(page.getByRole('button',{name:'Settings or Back',exact:true}));await click(page.getByTestId('settings-item-customization'));await click(page.getByTestId('appearance-sidephone'));
    await click(page.getByRole('button',{name:'Home',exact:true}));await restart();
    assert.equal(await page.getByTestId('nokia-launcher').getAttribute('data-appearance'),'sidephone');
    result.persistedAfterRestart=true;
    result.geometry=await page.evaluate(()=>{const r=document.querySelector('[data-testid="nokia-launcher"]').getBoundingClientRect();const c=document.querySelector('.physical-dpad__cap').getBoundingClientRect();return {viewport:[innerWidth,innerHeight],shell:[r.x,r.y,r.width,r.height],select:[c.width,c.height],dpr:devicePixelRatio};});
    assert.equal(result.geometry.shell[0],0);assert.equal(result.geometry.shell[1],0);assert.equal(result.geometry.shell[2],result.geometry.viewport[0]);assert.equal(result.geometry.shell[3],result.geometry.viewport[1]);assert(Math.abs(result.geometry.select[0]-result.geometry.select[1])<1);
    await measure('sidephone');
    await page.screenshot({path:path.join(out,'device.png')});
    fs.writeFileSync(path.join(out,'device-display.png'),execFileSync(adb,['-s','IB8XFY5DFMKBROGQ','exec-out','screencap','-p']));
    await click(page.getByRole('button',{name:'Settings or Back',exact:true}));await click(page.getByTestId('settings-item-customization'));await page.screenshot({path:path.join(out,'device-customization.png')});
    await click(page.getByTestId('appearance-nokia'));assert.equal(await page.getByTestId('nokia-launcher').getAttribute('data-appearance'),'nokia');result.restoreOriginal=true;
    const activities=run('shell','dumpsys','activity','activities').split('\n').filter(l=>/Hist\s+#/.test(l)&&l.includes(`${pkg}/com.nokialauncher.MainActivity`));result.homeActivityRecords=activities.length;
    result.success=true;
  }catch(error){result.error=String(error);process.exitCode=1;}
  finally{
    if(browser)await browser.close();
    fs.writeFileSync(path.join(out,'device-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
    run('shell','am','start','-a','android.intent.action.MAIN','-c','android.intent.category.HOME');
  }
})();
