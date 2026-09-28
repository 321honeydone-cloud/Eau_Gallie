import { chromium } from 'playwright';
const OUT = process.argv[2] || '/tmp/shots'; const BASE = process.env.BASE_URL || 'http://localhost:4173';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true })).newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(BASE + '/'); await page.waitForSelector('.choice');
await page.getByRole('button', { name: /Darrell/ }).click();
await page.waitForSelector('.zone-poly'); await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/40-pensacola-map.png` });
const names = await page.locator('.zone-label').allTextContents();
await page.locator('.zone-poly').first().click();
await page.waitForSelector('.viewer .stage img'); await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/41-pensacola-e201.png` });
const b = await page.locator('.viewer').boundingBox();
await page.mouse.move(b.x + b.width * 0.35, b.y + b.height * 0.45); for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -200); await page.waitForTimeout(60); }
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/42a-raster-only-moment.png` });
await page.waitForFunction(() => { const c = document.querySelector('canvas.vector'); return c && c.style.display !== 'none' && c.width > 10; }, null, { timeout: 20000 });
await page.waitForTimeout(400);
const vec = await page.evaluate(() => { const c = document.querySelector('canvas.vector'); return { w: c.width, h: c.height, left: c.style.left, top: c.style.top }; });
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -200); await page.waitForTimeout(60); }
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/42b-deep-zoom.png` });
console.log('vector canvas', JSON.stringify(vec));
await page.screenshot({ path: `${OUT}/42-pensacola-e201-zoom.png` });
await page.getByRole('button', { name: 'Daylight' }).click(); await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/43-pensacola-e201-day.png` });
console.log(JSON.stringify({ zones: names, errors }, null, 1));
await browser.close();
