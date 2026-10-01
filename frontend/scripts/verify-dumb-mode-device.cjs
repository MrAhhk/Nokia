// Isolated debug package only. Restore Home in finally; Accessibility is granted manually. Never send a message.
const { execFileSync } = require('child_process');
const fs = require('fs');
const assert = require('assert/strict');
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const adb = 'C:/Users/Admin/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const pkg = 'com.nokialauncher.startuptest';
const out = 'S:/Money Printer/docs/reports/2026-09-22-dumb-mode';
const run = (...args) => execFileSync(adb, args, { encoding:'utf8', timeout:20000 });
const originalHome = run('shell','cmd','package','resolve-activity','--brief','-a','android.intent.action.MAIN','-c','android.intent.category.HOME').trim().split(/\r?\n/).pop();
const originalServices = run('shell','settings','get','secure','enabled_accessibility_services').trim();
const result = { package:pkg, checks:[], errors:[] };
let browser, page, secret;
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
const home = () => run('shell','am','start','-W','-a','android.intent.action.MAIN','-c','android.intent.category.HOME','-p',pkg);
async function connect() {
  let pid;
  for(let i=0;i<30;i++){try{pid=run('shell','pidof',pkg).trim().split(/\s+/)[0];}catch{} if(pid)break; await pause(200);}
  assert(pid, 'Test process did not start');
  run('forward','tcp:9226',`localabstract:webview_devtools_remote_${pid}`);
  for (let i=0;i<20;i++) {
    try { browser = await chromium.connectOverCDP('http://127.0.0.1:9226'); break; }
    catch(e) { if(i===19) throw e; await pause(250); }
  }
  page = browser.contexts()[0].pages().find(p=>p.url().includes('localhost'));
  assert(page); page.setDefaultTimeout(10000);
}
const native = (method,args={}) => page.evaluate(({method,args})=>window.Capacitor.Plugins.LauncherApps[method](args),{method,args});
async function redirected(action) {
  action();
  for(let i=0;i<20;i++) {
    if(/(?:mResumedActivity:|topResumedActivity=).*com\.nokialauncher\.startuptest/.test(run('shell','dumpsys','activity','activities'))) return;
    await pause(150);
  }
  throw new Error('Blocked app did not return Home');
}
const summary = values => { const sorted=[...values].sort((a,b)=>a-b);return {samples:sorted.length,p50:sorted[Math.floor(sorted.length*.5)],p90:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.9))]}; };
async function measure(label) {
  const cdp=await page.context().newCDPSession(page);
  const tap=async locator=>{const box=await locator.boundingBox();assert(box);const point={x:box.x+box.width/2,y:box.y+box.height/2};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
  await tap(page.getByRole('button',{name:'Home',exact:true}));
  await page.getByTestId('screen-home').waitFor();
  run('shell','dumpsys','gfxinfo',pkg,'reset');
  const homes=[],keys=[];
  for(let i=0;i<8;i++){
    await tap(page.getByRole('button',{name:'Menu',exact:true}));await page.getByTestId('screen-menu').waitFor();
    const start=performance.now();await tap(page.getByRole('button',{name:'Home',exact:true}));await page.getByTestId('screen-home').waitFor();homes.push(performance.now()-start);
  }
  const digits='12345678901234567890';
  for(const digit of digits){const start=performance.now();await tap(page.getByTestId(`keypad-btn-${digit}`));keys.push(performance.now()-start);}
  assert.equal((await page.locator('.lcd-dial-number').innerText()).replace(/\s/g,''),digits);
  result[label]={homeCdpMs:summary(homes),keyCdpMs:summary(keys),retained20Keys:true,gfx:run('shell','dumpsys','gfxinfo',pkg).split('\n').filter(s=>/Total frames|Janky frames|percentile/.test(s)).map(s=>s.trim())};
  await tap(page.getByRole('button',{name:'Home',exact:true}));await page.getByTestId('screen-home').waitFor();
  const records=run('shell','dumpsys','activity','activities').split('\n').filter(s=>/Hist\s+#/.test(s)&&s.includes(`${pkg}/com.nokialauncher.MainActivity`));
  result[label].homeActivityRecords=records.length;assert.equal(records.length,1);
  await cdp.detach();
}
(async()=>{
  try {
    assert(originalHome.includes('/'));
    run('shell','cmd','package','set-home-activity',`${pkg}/com.nokialauncher.MainActivity`);
    home(); await connect();
    await page.evaluate(()=>{localStorage.setItem('nokia-launcher.onboarding',JSON.stringify({completed:true,index:9}));localStorage.setItem('nokia-launcher-system-tone-setup.v1','skipped');});
    await page.reload(); await page.getByTestId('screen-home').waitFor();
    let state;
    for(let i=0;i<20;i++){state=await native('getDumbModeState');if(state.enforcementAvailable)break;await pause(200);}
    assert(state.enforcementAvailable); assert(!state.active);
    await measure('modeOff');
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByTestId('settings-item-dumb-mode').click();
    await page.getByRole('button',{name:'Choose apps',exact:true}).click();
    await page.screenshot({path:`${out}/device-choose.png`});
    const inventory = await native('getDumbModeApps');
    const game=inventory.apps.find(a=>a.id==='com.nokialauncher.dumbprobe');
    assert(game && game.mandatory && game.categoryGroup==='games'); result.checks.push('Android game category and mandatory selection');
    // Choose only fixtures; mandatory games are injected natively regardless of request.
    const setup = await native('prepareDumbMode',{selectedIds:[],expectedRevision:state.revision});
    secret=setup.code; assert(/^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])[A-Za-z0-9]{12}$/.test(secret));
    state=await native('activateDumbMode',{setupId:setup.setupId,expectedRevision:state.revision});
    assert(state.active && state.blockedIds.includes(game.id) && state.blockedIds.includes('snake'));
    result.checks.push('Activation enforces games even when omitted');
    state=await native('unlockDumbMode',{code:secret,expectedRevision:state.revision});
    // Exercise the actual UI as a separate session, including chooser cancellation.
    await page.locator('.dumb-mode input[type=checkbox]:not(:disabled)').evaluateAll(items=>items.forEach(input=>{if(input.checked)input.click();}));
    await page.getByRole('button',{name:'Continue',exact:true}).click();
    secret=await page.locator('.dumb-mode__code').textContent();
    assert(secret && secret.length===12);
    await page.getByRole('button',{name:'Share code',exact:true}).click();
    await pause(500); run('shell','input','keyevent','4');
    assert.equal(await page.locator('.dumb-mode__code').textContent(),secret);
    assert(!(await native('getDumbModeState')).active);
    await page.locator('.dumb-mode input[type=checkbox]').check();
    await page.getByRole('button',{name:'Activate Dumb Mode',exact:true}).click();
    await page.getByRole('button',{name:'Turn off Dumb Mode',exact:true}).waitFor();
    assert.equal(await page.locator('.dumb-mode__code').count(),0);
    state=await native('getDumbModeState');assert(state.active);
    result.checks.push('UI code/share chooser cancel/acknowledgement/activation; code removed');

    const stored=run('shell','run-as',pkg,'cat','no_backup/dumb-mode-v1.json'); assert(!stored.includes(secret));
    assert(!run('logcat','-d','-t','3000').includes(secret)); result.checks.push('No plaintext code in persisted state or sampled logs');
    for(let i=0;i<3;i++){
      let rejected=false;try{await native('unlockDumbMode',{code:'WrongCode1234',expectedRevision:state.revision});}catch(e){rejected=String(e).includes('incorrect_code');}assert(rejected);
    }
    result.checks.push('Three immediate incorrect attempts rejected without cooldown');
    await measure('modeOn');
    await redirected(()=>run('shell','am','start','-W','-a','android.intent.action.VIEW','-d','dumbmodeprobe://open'));
    result.checks.push('Deep link returns Home');
    await redirected(()=>run('shell','am','start','-W','-n',`${game.id}/android.app.Activity`));
    result.checks.push('Explicit external app launch returns Home');
    await browser.close(); browser=null;
    run('shell','am','force-stop',pkg); await pause(500); home(); await connect();
    await page.waitForFunction(()=>window.Capacitor?.Plugins?.LauncherApps);
    state=await native('getDumbModeState'); assert(state.active && !('code' in state));
    result.checks.push('Active policy survives process restart; code not returned');
    state=await native('unlockDumbMode',{code:secret,expectedRevision:state.revision}); assert(!state.active);
    assert(!run('logcat','-d','-t','3000').includes(secret));
    result.checks.push('Correct code unlocks after restart without logging the submitted code');
    const next=await native('prepareDumbMode',{selectedIds:[],expectedRevision:state.revision});assert(next.code!==secret);
    await native('cancelDumbModeSetup',{setupId:next.setupId});result.checks.push('Next session receives a different code; cancellation supported');
    secret=null;
    result.success=true;
  } catch(error) { result.errors.push(String(error.stack || error).replaceAll(secret||'__no_secret__','[redacted]')); result.success=false; }
  finally {
    try { if(secret && !browser){home();await connect();} if(secret && page){const state=await native('getDumbModeState');if(state.active)await native('unlockDumbMode',{code:secret,expectedRevision:state.revision});} } catch {result.errors.push('Test session cleanup failed');}
    run('shell','cmd','package','set-home-activity',originalHome);
    result.restoredHome=run('shell','cmd','package','resolve-activity','--brief','-a','android.intent.action.MAIN','-c','android.intent.category.HOME').trim().endsWith(originalHome);
    result.restoredAccessibility=run('shell','settings','get','secure','enabled_accessibility_services').trim()===originalServices;
    if(browser)await browser.close();run('uninstall','com.nokialauncher.dumbprobe');
    fs.writeFileSync(`${out}/device-result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
    if(!result.success)process.exitCode=1;
  }
})();
