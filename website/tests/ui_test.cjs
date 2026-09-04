const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const artifacts = path.resolve(__dirname, '..', 'artifacts');
const baseUrl = process.env.SITE_URL || 'http://127.0.0.1:4173';

async function verifyPage(page, screenshotName, mobile = false) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console:${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page:${error.message}`));

  let capturedPayload;
  await page.route('**/api/subscribe', async (route) => {
    capturedPayload = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  assert.match(await page.title(), /^Nokia Retro Phone/);
  await page.getByRole('heading', { name: 'Make your phone a tool again.' }).waitFor();
  await page.getByRole('button', { name: 'Join early access' }).waitFor();

  await page.locator('[data-key="2"]').click();
  assert.equal(await page.locator('[data-lcd-time]').innerText(), '2');
  await page.getByRole('button', { name: 'Next preview' }).click();
  assert.equal(await page.locator('.lcd-kicker').innerText(), 'FOCUS MODE');

  await page.locator('#email').fill('early.tester@example.com');
  await page.locator('#early-access').evaluate((form) => form.requestSubmit());
  await page.getByText('You’re on the list. Watch your inbox.').waitFor();
  assert.equal(capturedPayload.email, 'early.tester@example.com');

  if (mobile) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `mobile horizontal overflow: ${overflow}px`);
  }

  const revealNodes = await page.locator('.reveal').all();
  for (const node of revealNodes) {
    await node.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(750);
  assert.equal(await page.locator('.reveal:not(.is-visible)').count(), 0);

  await page.screenshot({ path: path.join(artifacts, screenshotName), fullPage: true });
  assert.deepEqual(errors, []);
}

let browser;

(async () => {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await verifyPage(desktop, 'desktop.png');
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await verifyPage(mobile, 'mobile.png', true);
  console.log('UI checks passed at 1440x1000 and 390x844.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await browser?.close();
});
