const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const build=path.resolve(__dirname,'../build'),report=path.resolve(__dirname,'../../../docs/reports');
const server=http.createServer((req,res)=>{const requested=path.join(build,decodeURIComponent(req.url.split('?')[0]));const file=fs.existsSync(requested)&&fs.statSync(requested).isFile()?requested:path.join(build,'index.html');res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
(async()=>{
 await new Promise(resolve=>server.listen(4192,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  for(const [name,answer,height] of [['question',null,873],['yes','Yes',873],['not-yet','Not yet',873],['small',null,640]]){
   const page=await browser.newPage({viewport:{width:393,height}});
   await page.addInitScript(()=>{
    localStorage.setItem('nokia-launcher.onboarding',JSON.stringify({completed:true}));
    localStorage.setItem('nokia-launcher-system-tone-setup.v1','skipped');
    if(!localStorage.getItem('nokia-launcher.week-check-in.v1'))localStorage.setItem('nokia-launcher.week-check-in.v1',JSON.stringify({startedAt:Date.now()-7*86400000,shown:false}));
    window.Capacitor={isNativePlatform:()=>true,Plugins:{LauncherApps:{getInstalledApps:async()=>({apps:[]}),getDeviceStatus:async()=>({batteryLevel:80}),getConversations:async()=>({conversations:[]}),getNotificationConversations:async()=>({conversations:[]}),addListener:async()=>({remove(){}}),shareApp:async()=>{},openAppReview:async()=>{}}}};
   });
   await page.goto('http://127.0.0.1:4192');
   const panel=page.locator('[data-testid="week-check-in"]');await panel.waitFor();
   if(answer)await page.getByRole('button',{name:answer,exact:true}).click();
   await page.screenshot({path:path.join(report,`2026-09-18-check-in-${name}.png`)});
   console.log(name,await panel.evaluate(el=>({height:el.clientHeight,scrollHeight:el.scrollHeight,text:el.innerText})));
   await page.getByRole('button',{name:'Close check-in'}).click();await page.reload();
   await page.locator('[data-testid="screen-home"]').waitFor();
   if(await panel.count())throw Error('Prompt repeated after reload');
   await page.close();
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
