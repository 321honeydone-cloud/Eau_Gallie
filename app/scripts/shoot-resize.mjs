import { chromium } from 'playwright';
const OUT = process.argv[2] || '/tmp/shots'; const BASE = process.env.BASE_URL || 'http://localhost:4173';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true })).newPage();
await page.goto(BASE + '/'); await page.waitForSelector('.choice');
await page.getByRole('button', { name: /Darrell/ }).click(); await page.waitForSelector('.zone-poly'); await page.waitForTimeout(800);
const out = {};
for (const [w, h, name] of [[1180, 820, 'land'], [820, 1180, 'port'], [1400, 600, 'short'], [1180, 1000, 'tall']]) {
  await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(700);
  const v = await page.locator('.viewer').boundingBox(); const doc = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: window.innerHeight }));
  out[name] = { viewer: Math.round(v.height), bottom: Math.round(v.y + v.height), win: h, pageScroll: doc.sh - doc.ih };
  await page.screenshot({ path: `${OUT}/50-map-${name}.png` });
}
await page.locator('.zone-poly').first().click(); await page.waitForSelector('.listtab'); await page.waitForTimeout(800);
for (const [w, h, name] of [[1180, 820, 'land'], [820, 1180, 'port'], [1400, 600, 'short']]) {
  await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(700);
  const v = await page.locator('.viewer').boundingBox(); const doc = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: window.innerHeight }));
  out['zone-' + name] = { viewer: Math.round(v.height), bottom: Math.round(v.y + v.height), win: h, pageScroll: doc.sh - doc.ih };
  await page.screenshot({ path: `${OUT}/51-zone-${name}.png` });
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
