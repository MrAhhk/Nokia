const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const out = path.resolve(__dirname, '../../../docs/reports/2026-10-01-customization');
const baseline = process.argv.includes('--baseline');
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await page.addInitScript(() => {
      localStorage.setItem('nokia-launcher.onboarding', JSON.stringify({ completed: true }));
      localStorage.setItem('nokia-launcher-system-tone-setup.v1', 'skipped');
    });
    await page.goto('http://127.0.0.1:4198');
    await page.getByTestId('nokia-launcher').waitFor();
    await page.screenshot({ path: path.join(out, baseline ? 'baseline.png' : 'nokia.png') });
    if (baseline) return;
    await page.getByRole('button', { name: 'Settings or Back', exact: true }).click();
    await page.getByTestId('settings-item-customization').click();
    await page.getByTestId('appearance-sidephone').click();
    if (await page.getByTestId('nokia-launcher').getAttribute('data-appearance') !== 'sidephone') throw Error('Appearance not applied');
    await page.screenshot({ path: path.join(out, 'customization.png') });
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.screenshot({ path: path.join(out, 'render.png') });
    await page.reload();
    await page.getByTestId('nokia-launcher').waitFor();
    if (await page.getByTestId('nokia-launcher').getAttribute('data-appearance') !== 'sidephone') throw Error('Appearance did not persist');
    for (const n of '12345678901234567890') await page.getByTestId(`keypad-btn-${n}`).click();
    await page.screenshot({ path: path.join(out, 'dialer.png') });
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Settings or Back', exact: true }).click();
    await page.screenshot({ path: path.join(out, 'settings.png') });
    await page.getByTestId('settings-item-customization').click();
    await page.getByTestId('appearance-nokia').click();
    if (await page.getByTestId('nokia-launcher').getAttribute('data-appearance') !== 'nokia') throw Error('Restore failed');
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.setViewportSize({ width: 844, height: 390 });
    await page.screenshot({ path: path.join(out, 'landscape.png') });
    console.log('Switch, persistence, keypad interaction, restore and landscape captured.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
