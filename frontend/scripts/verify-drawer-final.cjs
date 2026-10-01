const {execFileSync}=require('child_process');
const fs=require('fs');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const adb='C:/Users/Admin/AppData/Local/Android/Sdk/platform-tools/adb.exe',pkg='com.nokialauncher.startuptest';
const run=(...args)=>execFileSync(adb,['-s','IB8XFY5DFMKBROGQ',...args],{encoding:'utf8',timeout:20000});
const home=()=>run('shell','am','start','-W','-a','android.intent.action.MAIN','-c','android.intent.category.HOME','-p',pkg);
const out='../../docs/reports/2026-09-20-drawer-audit';
let browser;
async function connect(){
  const pid=run('shell','pidof',pkg).trim();
  run('forward','tcp:9226',`localabstract:webview_devtools_remote_${pid}`);
  for(let i=0;i<30;i++){
    try { browser=await chromium.connectOverCDP('http://127.0.0.1:9226'); break; }
    catch(e){if(i===29)throw e;await new Promise(r=>setTimeout(r,200));}
  }
  const page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(8000);return page;
}
const result={};
(async()=>{
  try {
    home();let page=await connect();await page.getByTestId('screen-home').waitFor();
    result.missingPackage=await page.evaluate(async()=>{try{await window.Capacitor.Plugins.LauncherApps.launchApp({packageName:'com.example.nokia.nonexistent',activityName:'Missing'});return 'resolved';}catch(e){return e.message;}});
    if(result.missingPackage!=='app_unavailable')throw Error('Missing package guard failed');
    await page.evaluate(()=>window.Capacitor.Plugins.LauncherApps.launchApp({packageName:'com.android.settings',activityName:'com.android.settings.OldMissingAlias'}));
    for(let i=0;i<10;i++){
      if(/(?:mResumedActivity:|topResumedActivity=).*com\.android\.settings/.test(run('shell','dumpsys','activity','activities'))){result.staleAliasFallback=true;break;}
      await new Promise(r=>setTimeout(r,100));
    }
    if(!result.staleAliasFallback)throw Error('Stale alias fallback failed');
    home();await page.getByTestId('screen-home').waitFor();
    run('shell','dumpsys','gfxinfo',pkg,'reset');
    // In-app transition diagnosis: no ADB round trips or screenshots inside timing.
    result.inApp=await page.evaluate(async()=>{
      const nextPaint=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const summarize=a=>{a.sort((x,y)=>x-y);return{n:a.length,p50:a[Math.floor(a.length*.5)],p90:a[Math.min(a.length-1,Math.floor(a.length*.9))]};};
      const drawer=[],home=[],longTasks=[];
      const observer=new PerformanceObserver(list=>list.getEntries().forEach(e=>longTasks.push(e.duration)));
      observer.observe({type:'longtask',buffered:false});
      for(let i=0;i<10;i++){
        let t=performance.now();[...document.querySelectorAll('.lcd-softkeys button')].find(e=>e.textContent==='Menu').click();await nextPaint();drawer.push(performance.now()-t);
        t=performance.now();window.dispatchEvent(new Event('nokia-home-request'));await nextPaint();home.push(performance.now()-t);
      }
      observer.disconnect();return{drawerDoubleRafMs:summarize(drawer),homeDoubleRafMs:summarize(home),longTasks};
    });
    result.gfx=run('shell','dumpsys','gfxinfo',pkg).split('\n').filter(s=>/Total frames|Janky frames|percentile/.test(s)).map(s=>s.trim());
    await page.getByRole('button',{name:'Menu',exact:true}).click();
    await page.screenshot({path:`${out}/drawer.png`});
    await browser.close();browser=null;
    run('shell','am','force-stop',pkg);
    run('shell','am','start','-W','-n',`${pkg}/com.nokialauncher.LauncherEntryActivity`);
    home();page=await connect();await page.getByTestId('screen-home').waitFor();
    await page.getByRole('button',{name:'Menu',exact:true}).click();
    await page.getByTestId('app-list-item-com.android.settings/com.android.settings.Settings').click();
    result.reopenedLaunch=/(?:mResumedActivity:|topResumedActivity=).*com\.android\.settings/.test(run('shell','dumpsys','activity','activities'));
    home();await page.getByTestId('screen-home').waitFor();
    result.mainActivities=run('shell','dumpsys','activity','activities').split('\n').filter(s=>/Hist\s+#/.test(s)&&s.includes(`${pkg}/com.nokialauncher.MainActivity`)).length;
    await page.screenshot({path:`${out}/home.png`});
    result.pass=result.reopenedLaunch&&result.mainActivities===1;
  }catch(e){result.error=e.message;process.exitCode=1;}
  finally{if(browser)await browser.close();try{run('forward','--remove','tcp:9226');}catch(_){}fs.writeFileSync(`${out}/device-final.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}
})();
