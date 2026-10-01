const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'); const path=require('path'); const assert=require('assert/strict');
const out=path.resolve(__dirname,'../../../docs/reports/2026-10-01-sidephone-sharpness');
const baseline=process.argv.includes('--baseline');
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try {
    for(const [name,width,height,dpr] of baseline ? [['before',390,844,1]] : [['after',390,844,1],['native',360,800,3],['4k',720,1280,3],['landscape',844,390,1]]) {
      const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:dpr});
      await page.addInitScript(()=>{
        localStorage.setItem('nokia-launcher.onboarding',JSON.stringify({completed:true}));
        localStorage.setItem('nokia-launcher-system-tone-setup.v1','skipped');
        localStorage.setItem('nokia-launcher.appearance.v1','sidephone');
      });
      await page.goto('http://127.0.0.1:4199');
      await page.getByTestId('screen-home').waitFor();
      await page.screenshot({path:path.join(out,`${name}.png`)});
      if(!baseline){
        const bounds=await page.getByTestId('nokia-launcher').boundingBox();
        assert(Math.abs(bounds.x)<1 && Math.abs(bounds.y)<1 && Math.abs(bounds.width-width)<1 && Math.abs(bounds.height-height)<1,`Not full screen: ${JSON.stringify(bounds)}`);
        for(const key of ['keypad-btn-1','keypad-btn-0','keypad-btn-select']) {
          const box=await page.getByTestId(key).boundingBox(); assert(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);
        }
        if(name==='after') {
          await page.getByRole('button',{name:'Settings or Back',exact:true}).click();
          await page.getByTestId('settings-item-customization').click();
          await page.screenshot({path:path.join(out,'customization.png')});
          await page.getByTestId('appearance-nokia').click();
          await page.getByRole('button',{name:'Home',exact:true}).click();
          await page.screenshot({path:path.join(out,'original-preserved.png')});
          assert.equal(await page.getByTestId('nokia-launcher').getAttribute('data-appearance'),'nokia');
        }
      }
      await page.close();
    }
    console.log(baseline?'Baseline captured':'Full viewport coverage and controls in bounds: portrait, native-resolution, 2160x3840 and landscape. Original appearance restored.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
