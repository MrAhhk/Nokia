// Short USB-connected idle proxy, not a battery endurance measurement.
const { execFileSync } = require('child_process');
const fs = require('fs');
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const adb = 'C:/Users/Admin/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const pkg = 'com.nokialauncher.startuptest';
const out = '../../docs/reports/2026-09-20-final-readiness';
const run = (...args) => execFileSync(adb, ['-s', 'IB8XFY5DFMKBROGQ', ...args], {encoding:'utf8',timeout:20000});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const home = () => run('shell','am','start','-W','-a','android.intent.action.MAIN','-c','android.intent.category.HOME','-p',pkg);
let browser;
const result = {scope:'30s visible + 30s hidden; USB and CDP connected; no battery drain claim'};
(async()=>{
  try {
    home();
    const pid = run('shell','pidof',pkg).trim();
    run('forward','tcp:9226',`localabstract:webview_devtools_remote_${pid}`);
    browser=await chromium.connectOverCDP('http://127.0.0.1:9226');
    const page=browser.contexts()[0].pages()[0];
    await page.getByTestId('screen-home').waitFor();
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
    const measure=async()=>{
      const start=await metrics();
      await wait(30000);
      const end=await metrics();
      return Object.fromEntries(['TaskDuration','ScriptDuration','LayoutCount','RecalcStyleCount','JSHeapUsedSize'].map(k=>[k,end[k]-start[k]]));
    };
    result.visible=await measure();
    run('shell','am','start','-W','-a','android.settings.SETTINGS');
    result.backgroundVisibility=await page.evaluate(()=>document.visibilityState); result.foregroundActivity=run('shell','dumpsys','activity','activities').split('\n').filter(s=>/(?:mResumedActivity:|topResumedActivity=)/.test(s));
    result.hidden=await measure();
    home();await page.getByTestId('screen-home').waitFor();
    result.resumedVisible=await page.evaluate(()=>document.visibilityState==='visible');
    result.crashLog=run('logcat','-d','-b','crash','--pid',pid);
    result.activities=run('shell','dumpsys','activity','activities').split('\n').filter(x=>/Hist\s+#/.test(x)&&x.includes(`${pkg}/com.nokialauncher.MainActivity`)).length;
    await page.screenshot({path:`${out}/idle-resume.png`});
    result.pass=result.resumedVisible&&result.activities===1&&!result.crashLog.trim();
  } catch(e) {result.error=e.message;process.exitCode=1;}
  finally {if(browser)await browser.close();try{run('forward','--remove','tcp:9226');}catch(_){}fs.writeFileSync(`${out}/idle.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}
})();


