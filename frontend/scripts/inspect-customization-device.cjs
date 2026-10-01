const {execFileSync}=require('child_process');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const adb='C:/Users/Admin/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const run=(...args)=>execFileSync(adb,args,{encoding:'utf8'});
(async()=>{
  const pid=run('shell','pidof','com.nokialauncher.sidephonecheck').trim().split(/\s+/)[0];
  run('forward','tcp:9231',`localabstract:webview_devtools_remote_${pid}`);
  const browser=await chromium.connectOverCDP('http://127.0.0.1:9231');
  try {
    const page=browser.contexts()[0].pages().find(p=>p.url().includes('localhost'));
    const result={package:'com.nokialauncher.sidephonecheck',input:'browser click dispatch on physical WebView; touch timing attempt was invalid'};
    if(process.argv.includes('--persist')) {
      result.coldRestartPersisted=await page.getByTestId('nokia-launcher').getAttribute('data-appearance')==='sidephone';
      if(!result.coldRestartPersisted)throw Error('Cold restart lost appearance');
    }
    console.log(await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,views:[...document.querySelectorAll('[data-testid^="screen-"]')].map(x=>x.dataset.testid)})));
    await page.screenshot({path:'S:/Money Printer/docs/reports/2026-10-01-customization/device-inspection.png'});
    await page.getByRole('button',{name:'Home',exact:true}).click();
    await page.getByRole('button',{name:'Settings or Back',exact:true}).click();
    await page.getByTestId('settings-item-customization').click();
    await page.getByTestId('appearance-sidephone').click();
    await page.waitForTimeout(250); // Visual capture outside performance window.
    await page.screenshot({path:'S:/Money Printer/docs/reports/2026-10-01-customization/device-customization.png'});
    await page.getByRole('button',{name:'Home',exact:true}).click();
    await page.screenshot({path:'S:/Money Printer/docs/reports/2026-10-01-customization/device-sidephone.png'});
    for(const digit of '12345678901234567890')await page.getByTestId(`keypad-btn-${digit}`).click();
    result.retained20Keys=(await page.locator('.lcd-dial-number').innerText()).replace(/\s/g,'')==='12345678901234567890';
    if(!result.retained20Keys)throw Error('Key sequence mismatch');
    await page.getByRole('button',{name:'Home',exact:true}).click();
    await page.getByRole('button',{name:'Settings or Back',exact:true}).click();
    await page.getByTestId('settings-item-customization').click();
    await page.getByTestId('appearance-nokia').click();
    result.restoredOriginal=await page.getByTestId('nokia-launcher').getAttribute('data-appearance')==='nokia';
    if(!result.restoredOriginal)throw Error('Restore failed');
    await page.getByRole('button',{name:'Home',exact:true}).click();
    await page.screenshot({path:'S:/Money Printer/docs/reports/2026-10-01-customization/device-restored.png'});
    const fs=require('fs');
    fs.writeFileSync('S:/Money Printer/docs/reports/2026-10-01-customization/device-functional.json',JSON.stringify(result,null,2));
    console.log('Physical WebView switching verified using browser click dispatch');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
