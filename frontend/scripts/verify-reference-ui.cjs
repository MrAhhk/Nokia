const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage();
  await page.addInitScript(() => localStorage.setItem('nokia-launcher-system-tone-setup.v1', 'skipped'));
  for (const [width, height] of [[390,844], [360,800], [412,915]]) {
    await page.setViewportSize({width, height});
    await page.goto('http://127.0.0.1:4173');
    await page.waitForSelector('.hardware-number');
    const keys = await page.locator('.hardware-number').evaluateAll(nodes => nodes.map(node => {
      const {x,y,width,height,bottom} = node.getBoundingClientRect(); return {x,y,width,height,bottom};
    }));
    assert.equal(keys.length, 12);
    for (const key of keys) {
      assert.ok(Math.abs(key.width - keys[0].width) < 1);
      assert.ok(Math.abs(key.height - keys[0].height) < 1);
      assert.ok(key.bottom < height);
    }
    await page.screenshot({path: path.resolve(`../../Nokia UI/implemented-${width}x${height}.png`)});
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('button', {name: 'Home', exact: true}).click();
    await page.locator('[data-testid="screen-home"]').waitFor();
    for (let i=0; i<20; i++) await page.locator(`[data-testid="keypad-btn-${i%2 ? '3' : '2'}"]`).click();
    assert.equal(await page.locator('.lcd-dial-number').textContent(), '23'.repeat(10));
    await page.getByRole('button', {name: 'Home', exact: true}).click();
    console.log(JSON.stringify({width,height,key:keys[0],bottom:keys[11].bottom,inputs:20}));
  }
  await browser.close();
})().catch(error => {console.error(error); process.exit(1);});
