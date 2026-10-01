// Bounded physical test on the isolated debug package. Never alters Play data,
// default Home, permissions, contacts, messages, or the user's installed apps.
const { execFileSync } = require('child_process');
const fs = require('fs');
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const adb = 'C:/Users/Admin/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const pkg = 'com.nokialauncher.startuptest';
const out = '../../docs/reports/2026-09-20-drawer-audit';
const run = (...args) => execFileSync(adb, ['-s', 'IB8XFY5DFMKBROGQ', ...args], { encoding: 'utf8', timeout: 20000 });
const result = { package: pkg, scenario: '10 drawer/Settings/Home cycles; 20 keys; invalid package and stale activity; cold reopen', timingsInclude: 'CDP transport and DOM readiness, not pure paint latency', errors: [] };
const summary = values => { const v = [...values].sort((a,b) => a-b); return { samples: v.length, p50: v[Math.floor(v.length*.5)], p90: v[Math.min(v.length-1, Math.floor(v.length*.9))] }; };
let browser;
async function connect() {
  let pid;
  for (let i=0;i<30;i++) {
    try { pid=run('shell','pidof',pkg).trim().split(/\s+/)[0]; } catch (_) {}
    if(pid) break;
    await new Promise(r=>setTimeout(r,200));
  }
  if (!pid) throw new Error('Test process not running');
  run('forward', 'tcp:9226', `localabstract:webview_devtools_remote_${pid}`);
  for (let i=0;i<30;i++) {
    try { browser=await chromium.connectOverCDP('http://127.0.0.1:9226'); break; } catch(e) {
      if(i===29) throw e;
      await new Promise(r=>setTimeout(r,200));
    }
  }
  const page = browser.contexts()[0].pages().find(p => p.url().includes('localhost'));
  if (!page) throw new Error('Launcher WebView unavailable');
  page.on('pageerror', e => result.errors.push(e.message));
  page.setDefaultTimeout(7000);
  return page;
}
const home = () => run('shell','am','start','-W','-a','android.intent.action.MAIN','-c','android.intent.category.HOME','-p',pkg);
(async () => {
  try {
    home();
    let page = await connect();
    await page.evaluate(() => {
      localStorage.setItem('nokia-launcher.onboarding', JSON.stringify({ index: 9, completed: true }));
      localStorage.setItem('nokia-launcher-system-tone-setup.v1', 'skipped');
    });
    await page.reload();
    await page.getByTestId('screen-home').waitFor();
    const apps = await page.evaluate(async () => (await window.Capacitor.Plugins.LauncherApps.getInstalledApps()).apps);
    result.appCount = apps.length;
    const settings = apps.find(a => a.packageName === 'com.android.settings');
    if (!settings) throw new Error('Settings missing from native drawer');
    await page.getByRole('button',{name:'Menu',exact:true}).click();
    const probe = page.getByTestId('app-list-item-com.nokialauncher.drawerprobe/android.app.Activity');
    const installedAt=performance.now();
    run('install','--user','0','-r',`${out}/probe/probe.apk`);
    await probe.waitFor();
    result.realtimeInstallMsIncludingAdb = performance.now()-installedAt;
    const removedAt=performance.now();
    run('uninstall','com.nokialauncher.drawerprobe');
    await probe.waitFor({state:'detached'});
    result.realtimeRemoveMsIncludingAdb = performance.now()-removedAt;
    result.realtimeWithoutReopen=true;
    home();
    await page.getByTestId('screen-home').waitFor();
    const cdp = await page.context().newCDPSession(page);
    const tap = async locator => {
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      if (!box) throw new Error('Tap target not visible');
      const x = box.x + box.width/2, y = box.y + box.height/2;
      await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x,y}] });
      await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
    };
    run('shell','dumpsys','gfxinfo',pkg,'reset');
    const drawers = [], homes = [];
    result.successfulLaunches = 0;
    for (let i=0;i<10;i++) {
      const start = performance.now();
      await tap(page.getByRole('button',{name:'Menu',exact:true}));
      await page.getByTestId('screen-menu').waitFor();
      drawers.push(performance.now()-start);
      await tap(page.getByTestId(`app-list-item-${settings.id}`));
      // Poll Android's foreground activity rather than inferring launch from JS.
      let opened = false;
      for (let j=0;j<8;j++) {
        if (/(?:mResumedActivity:|topResumedActivity=).*com\.android\.settings/.test(run('shell','dumpsys','activity','activities'))) { opened=true; break; }
        await new Promise(r=>setTimeout(r,100));
      }
      if (!opened) throw new Error(`Settings did not open on cycle ${i+1}`);
      result.successfulLaunches++;
      const returned = performance.now();
      home();
      await page.getByTestId('screen-home').waitFor();
      homes.push(performance.now()-returned);
    }
    result.drawerCdpMs = summary(drawers);
    result.homeAdbCdpMs = summary(homes);
    const digits='12345678901234567890', keys=[];
    for (const digit of digits) {
      const start=performance.now();
      await tap(page.getByTestId(`keypad-btn-${digit}`));
      keys.push(performance.now()-start);
    }
    result.retained20Keys = (await page.locator('.lcd-dial-number').innerText()).replace(/\s/g,'') === digits;
    if (!result.retained20Keys) throw new Error('Key input mismatch');
    result.keyCdpMs=summary(keys);
    result.gfx=run('shell','dumpsys','gfxinfo',pkg).split('\n').filter(s=>/Total frames|Janky frames|percentile/.test(s)).map(s=>s.trim());
    result.invalidPackage = await page.evaluate(async()=> {
      try { await window.Capacitor.Plugins.LauncherApps.launchApp({packageName:'com.example.nokia.nonexistent',activityName:'Missing'}); return 'incorrectly resolved'; }
      catch(e) { return e.message; }
    });
    if (result.invalidPackage !== 'app_unavailable') throw new Error('Missing package was not rejected');
    await page.evaluate(async()=> window.Capacitor.Plugins.LauncherApps.launchApp({packageName:'com.android.settings',activityName:'com.android.settings.OldMissingAlias'}));
    result.staleActivityFallback = /(?:mResumedActivity:|topResumedActivity=).*com\.android\.settings/.test(run('shell','dumpsys','activity','activities'));
    if (!result.staleActivityFallback) throw new Error('Stale alias did not open current package entry');
    home();
    await page.getByTestId('screen-home').waitFor();
    result.homeActivityRecords=run('shell','dumpsys','activity','activities').split('\n').filter(s=>/Hist\s+#/.test(s)&&s.includes(`${pkg}/com.nokialauncher.MainActivity`)).length;
    await tap(page.getByRole('button',{name:'Menu',exact:true}));
    await page.getByTestId('screen-menu').waitFor();
    // Visual evidence after timing is complete.
    await page.screenshot({path:`${out}/drawer.png`});
    await browser.close(); browser=null;
    run('shell','am','force-stop',pkg);
    run('shell','am','start','-W','-n',`${pkg}/com.nokialauncher.LauncherEntryActivity`);
    page=await connect();
    await page.getByTestId('screen-home').waitFor();
    await page.getByRole('button',{name:'Menu',exact:true}).click();
    await page.getByTestId(`app-list-item-${settings.id}`).click();
    result.coldReopenLaunch = /(?:mResumedActivity:|topResumedActivity=).*com\.android\.settings/.test(run('shell','dumpsys','activity','activities'));
    home();
    await page.getByTestId('screen-home').waitFor();
    await page.screenshot({path:`${out}/home.png`});
    result.pass = result.coldReopenLaunch && result.homeActivityRecords === 1 && result.errors.length===0;
    if (!result.pass) throw new Error('Final acceptance checks failed');
  } catch(e) { result.failure=e.message; process.exitCode=1; }
  finally {
    if(browser) await browser.close();
    try { run('forward','--remove','tcp:9226'); } catch (_) {}
    fs.writeFileSync(`${out}/device.json`,JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  }
})();
