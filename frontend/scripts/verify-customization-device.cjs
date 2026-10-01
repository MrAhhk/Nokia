// Isolated debug package. No real calls, messages, permissions or default-Home changes.
const { execFileSync } = require('child_process');
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs'); const path = require('path'); const assert = require('assert/strict');
const adb = 'C:/Users/Admin/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const pkg = 'com.nokialauncher.sidephonecheck';
const out = path.resolve(__dirname, '../../../docs/reports/2026-10-01-customization');
const run = (...args) => execFileSync(adb, ['-s', 'IB8XFY5DFMKBROGQ', ...args], { encoding: 'utf8', timeout: 20000 });
const summary = values => { const v = [...values].sort((a,b) => a-b); return { samples:v.length, p50:v[Math.floor(v.length*.5)], p90:v[Math.min(v.length-1, Math.floor(v.length*.9))] }; };
let browser;
const result = { package:pkg, scenario:'8 Home cycles and 20 keypad inputs per appearance, screenshot-free timing; switching/persistence screenshots separately', timings:'CDP transport plus DOM readiness, not isolated input-to-paint latency' };
(async () => {
  try {
    const connect = async () => {
      const pid = run('shell', 'pidof', pkg).trim().split(/\s+/)[0]; assert(pid);
      run('forward', 'tcp:9231', `localabstract:webview_devtools_remote_${pid}`);
      browser = await chromium.connectOverCDP('http://127.0.0.1:9231');
      const target = browser.contexts()[0].pages().find(p => p.url().includes('localhost')); assert(target);
      return target;
    };
    const restart = async () => {
      if(browser) { await browser.close(); browser=null; }
      run('shell','am','force-stop',pkg);
      run('shell','am','start','-W','-n',`${pkg}/com.nokialauncher.MainActivity`);
      return connect();
    };
    let page = await connect();
    await page.evaluate(() => {
      localStorage.setItem('nokia-launcher.onboarding', JSON.stringify({completed:true}));
      localStorage.setItem('nokia-launcher-system-tone-setup.v1', 'skipped');
      localStorage.setItem('nokia-launcher.appearance.v1', 'nokia');
    });
    page = await restart(); await page.getByTestId('screen-home').waitFor();
    let cdp = await page.context().newCDPSession(page);
    const tap = async locator => {
      const box = await locator.boundingBox(); assert(box);
      const point = {x:box.x+box.width/2,y:box.y+box.height/2};
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    };
    for (const appearance of ['nokia','sidephone']) {
      if (appearance === 'sidephone') {
        await tap(page.getByRole('button',{name:'Settings or Back',exact:true}));
        await tap(page.getByTestId('settings-item-customization'));
        await tap(page.getByRole('button',{name:'Down',exact:true}));
        await tap(page.getByRole('button',{name:'Select',exact:true}));
        assert.equal(await page.getByTestId('nokia-launcher').getAttribute('data-appearance'), 'sidephone');
        await page.screenshot({path:path.join(out,'device-customization.png')});
        await tap(page.getByRole('button',{name:'Settings or Back',exact:true}));
        await page.getByTestId('screen-settings').waitFor();
        await tap(page.getByRole('button',{name:'Home',exact:true}));
        page = await restart(); await page.getByTestId('screen-home').waitFor();
        cdp = await page.context().newCDPSession(page);
        assert.equal(await page.getByTestId('nokia-launcher').getAttribute('data-appearance'),'sidephone');
        await page.screenshot({path:path.join(out,'device-sidephone.png')});
      }
      run('shell','dumpsys','gfxinfo',pkg,'reset');
      const home=[], keys=[];
      for(let i=0;i<8;i++) {
        await tap(page.getByRole('button',{name:'Menu',exact:true})); await page.getByTestId('screen-menu').waitFor();
        const start=performance.now(); await tap(page.getByRole('button',{name:'Home',exact:true})); await page.getByTestId('screen-home').waitFor(); home.push(performance.now()-start);
      }
      const digits='12345678901234567890';
      for(const digit of digits) { const start=performance.now(); await tap(page.getByTestId(`keypad-btn-${digit}`)); keys.push(performance.now()-start); }
      assert.equal((await page.locator('.lcd-dial-number').innerText()).replace(/\s/g,''),digits);
      result[appearance] = {homeCdpMs:summary(home),keyCdpMs:summary(keys),retained20Keys:true,gfx:run('shell','dumpsys','gfxinfo',pkg).split('\n').filter(s=>/Total frames|Janky frames|percentile/.test(s)).map(s=>s.trim())};
      await tap(page.getByRole('button',{name:'Home',exact:true})); await page.getByTestId('screen-home').waitFor();
    }
    await tap(page.getByRole('button',{name:'Settings or Back',exact:true}));
    await page.screenshot({path:path.join(out,'device-settings.png')});
    await tap(page.getByTestId('settings-item-customization'));
    await tap(page.getByTestId('appearance-nokia'));
    assert.equal(await page.getByTestId('nokia-launcher').getAttribute('data-appearance'),'nokia');
    await tap(page.getByRole('button',{name:'Home',exact:true}));
    await page.screenshot({path:path.join(out,'device-restored.png')});
    result.homeActivityRecords = run('shell','dumpsys','activity','activities').split('\n').filter(s=>/Hist\s+#/.test(s)&&s.includes(`${pkg}/com.nokialauncher.MainActivity`)).length;
    assert.equal(result.homeActivityRecords,1);
    result.success = true;
  } catch (error) { result.error=String(error); process.exitCode=1; }
  finally {
    if(browser) await browser.close();
    run('shell','am','start','-a','android.intent.action.MAIN','-c','android.intent.category.HOME');
    fs.writeFileSync(path.join(out,'device-result.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result));
  }
})();
