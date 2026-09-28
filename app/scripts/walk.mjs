// Drives the built app like a foreman on an iPad and takes screenshots.
import { chromium } from 'playwright';
const OUT = process.argv[2] || '/tmp/shots';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, hasTouch: true, isMobile: false });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:4173/');
await page.waitForSelector('.choice', { timeout: 15000 });
await page.screenshot({ path: `${OUT}/1-start.png` });
await page.getByRole('button', { name: /Darrell/ }).click();
await page.waitForSelector('.zone-poly');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/2-map.png` });
await page.locator('.zone-poly').first().click();
await page.waitForSelector('.pin');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/3-zone.png` });
const pinCount = await page.locator('.pin').count();
// zoom in on a light the way a foreman would, double tap it, then tap it
const zoomTo = async (label) => { const b = await page.getByLabel(label).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -200); await page.waitForTimeout(60); } await page.waitForTimeout(250); };
await zoomTo('TWA-N05');
await page.getByLabel('TWA-N05').click();
await page.waitForSelector('.stepbtn');
await page.screenshot({ path: `${OUT}/4-card.png` });
await page.locator('.stepbtn').nth(2).click(); // Set
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/5-after-set.png` });
// flag one
await page.getByLabel('TWA-S05').click();
await page.getByRole('button', { name: 'Flag a problem' }).click();
await page.getByRole('button', { name: 'Missing material' }).click();
await page.getByRole('button', { name: 'Vendor' }).click();
await page.getByRole('button', { name: /Minor/ }).click();
await page.screenshot({ path: `${OUT}/6-flag.png` });
await page.getByRole('button', { name: 'Save flag' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Close' }).click();
// linear part from the list
await page.getByRole('button', { name: /Conduit run/ }).first().click();
await page.waitForSelector('.qty-row');
await page.getByRole('button', { name: '+250' }).click();
await page.locator('.stepbtn').nth(1).click();
await page.screenshot({ path: `${OUT}/7-linear.png` });
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(300);
// bulk select
await page.getByRole('button', { name: 'Select many' }).click();
for (const l of ['TWA-N06', 'TWA-S06', 'TWA-N07', 'TWA-S07']) await page.getByLabel(l).click();
await page.getByRole('button', { name: '4 Complete' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/8-bulk.png` });
// back to map, then report
await page.getByRole('button', { name: /Airfield/ }).click();
await page.waitForSelector('.zone-poly');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/9-map-after.png` });
await page.getByRole('button', { name: 'Daily report' }).click();
await page.waitForSelector('.prow');
await page.screenshot({ path: `${OUT}/10-report.png` });
const rows = await page.locator('.prow').count();
// reload to prove it persisted
await page.reload();
await page.waitForSelector('.zone-poly');
const stats = await page.locator('.stat .v').allTextContents();
// portrait iPad
await page.setViewportSize({ width: 820, height: 1180 });
await page.locator('.zone-poly').first().click();
await page.waitForSelector('.pin');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/11-portrait-zone.png` });
console.log(JSON.stringify({ pinCount, reportRows: rows, statsAfterReload: stats, errors }, null, 1));
await browser.close();
