// Local-only visual fixture. No device data or real calls are accessed.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const build = path.resolve(__dirname, '../build');
const report = path.resolve(__dirname, '../../../docs/reports');
const server = http.createServer((req, res) => {
  const name = path.join(build, decodeURIComponent(req.url.split('?')[0]));
  const target = fs.existsSync(name) && fs.statSync(name).isFile() ? name : path.join(build, 'index.html');
  res.setHeader('Content-Type', ({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'})[path.extname(target)] || 'application/octet-stream');
  fs.createReadStream(target).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(4191, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true,channel:'msedge'});
  try {
    for (const [name, index, complete, height] of [['guide',0,false,873],['picker',2,false,873],['tones',0,true,873],['tones-small',0,true,640]]) {
      const page = await browser.newPage({viewport:{width:393,height}});
      await page.addInitScript(({index,complete}) => {
        localStorage.setItem('nokia-launcher.onboarding', JSON.stringify({index,completed:complete}));
        window.Capacitor = {isNativePlatform:()=>true,Plugins:{LauncherApps:{
          getInstalledApps:async()=>({apps:[]}), getDeviceStatus:async()=>({batteryLevel:84}),
          getContacts:async()=>({contacts:[]}), getConversations:async()=>({conversations:[]}),
          getNotificationConversations:async()=>({conversations:[]}),
          addListener:async()=>({remove(){}}), getSystemToneAccess:async()=>({supported:true,granted:false})
        }}};
      }, {index,complete});
      await page.goto('http://127.0.0.1:4191');
      await page.locator(complete ? '[data-testid="tone-setup"]' : '[data-testid="onboarding-guide"]').waitFor();
      if(name==='picker') await page.getByRole('button',{name:'Choose Messages app'}).click();
      await page.screenshot({path:path.join(report,`2026-09-18-first-use-${name}.png`)});
      console.log(name, await page.locator(complete ? '[data-testid="tone-setup"]' : name==='picker' ? '[data-testid="screen-messages-picker"]' : '[data-testid="onboarding-guide"]').evaluate(el=>({height:el.clientHeight,scrollHeight:el.scrollHeight,text:el.innerText})));
      await page.close();
    }
  } finally { await browser.close(); server.close(); }
})().catch(e=>{ console.error(e); server.close(); process.exitCode=1; });
