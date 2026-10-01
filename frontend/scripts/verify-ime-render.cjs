const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const output = path.resolve("../../artifacts/system-keyboard/browser-current");
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 360, height: 376 } });
  const scripts = new Set();
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.add(new URL(request.url()).pathname);
  });

  await page.goto("http://127.0.0.1:4173/?view=keyboard", { waitUntil: "networkidle" });
  await page.locator('[data-testid="nokia-system-keyboard"]').waitFor();
  assert.equal(await page.locator(".app-loading-shell").count(), 0);
  assert.equal(await page.locator(".physical-number").count(), 12);

  const rim = await page.locator(".nokia-shell-rim").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      borderRadius: style.borderRadius,
      borderTopWidth: style.borderTopWidth,
      borderTopColor: style.borderTopColor,
      boxShadow: style.boxShadow,
    };
  });
  assert.ok(Math.abs(rim.top) < 1);
  assert.ok(Math.abs(rim.bottom - 376) < 1);
  assert.ok(Math.abs(rim.height - 376) < 1);
  assert.notEqual(rim.borderTopWidth, "0px");
  assert.notEqual(rim.boxShadow, "none");

  for (let index = 0; index < 20; index += 1) {
    await page.locator('[data-testid="keypad-btn-2"]').click();
  }
  assert.equal(await page.locator('[data-testid="nokia-system-keyboard"]').count(), 1);
  assert.equal(await page.locator(".physical-number").count(), 12);

  await page.screenshot({ path: path.join(output, "ime-360x376.png") });
  await page.locator(".nokia-wordmark").screenshot({ path: path.join(output, "wordmark-rim.png") });
  await page.locator(".physical-keypad").screenshot({ path: path.join(output, "keypad-rim.png") });

  console.log(JSON.stringify({ viewport: "360x376", scripts: [...scripts], rim }));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
