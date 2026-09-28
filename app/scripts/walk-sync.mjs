// Two tablets, one fake server. A taps, B sees it. B taps, A sees it. Both land on one report.
import { chromium } from 'playwright';
const OUT = process.argv[2] || '/tmp/shots';
const BASE = process.env.BASE_URL || 'http://localhost:4173';
const SYNC = process.env.SYNC_URL || 'http://localhost:4600';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
const tablet = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); if (process.env.SYNC_DEBUG && m.text().startsWith('[sync]')) console.log(name.split(' ')[0], m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('ege.syncdebug', '1'); } catch {} });
  await page.goto(BASE + '/');
  await page.waitForSelector('.choice');
  await page.getByRole('button', { name }).click();
  await page.waitForSelector('.zone-poly');
  // connect
  await page.getByRole('button', { name: 'Not synced' }).click();
  await page.getByPlaceholder('https://xxxx.supabase.co').fill(SYNC);
  await page.getByPlaceholder('eyJ…').fill('test-key');
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('button', { name: 'Close' }).click();
  return page;
};
const synced = async (page) => {
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  try {
    await page.waitForFunction(() => { const t = document.querySelector('.app-header .pills')?.textContent || ''; return /Synced/.test(t) && !/to send/.test(t) && !/Syncing/.test(t); }, null, { timeout: 30000 });
  } catch (e) {
    const pill = await page.locator('.app-header .pills').textContent();
    await page.getByRole('button', { name: /Synced|to send|Sync error|Not synced/ }).click();
    const flag = await page.locator('.ege-sheet-box .ege-flag').textContent();
    throw new Error(`sync never settled. pill="${pill}" flag="${flag}"`);
  }
};
const syncNow = async (page) => { await page.getByRole('button', { name: /Synced|to send|Sync error/ }).click(); await page.getByRole('button', { name: 'Sync now' }).click(); await page.getByRole('button', { name: 'Close' }).click(); await synced(page); };
const zoomTo = async (page, label) => { const b = await page.getByLabel(label).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -200); await page.waitForTimeout(50); } await page.waitForTimeout(200); };
const openZone = async (page) => { await page.locator('.zone-poly').first().click(); await page.waitForSelector('.pin'); await page.waitForTimeout(300); };
const rowStatus = async (page, label) => (await page.locator('.prow', { hasText: label }).first().locator('.st').textContent()).trim();

const A = await tablet('Darrell Simpson');
await synced(A);
await A.screenshot({ path: `${OUT}/30-sync-a-connected.png` });
// A taps TWA-N05 to Set, takes a photo, opens the report so it exists
await openZone(A);
await zoomTo(A, 'TWA-N05');
await A.getByLabel('TWA-N05').click();
await A.locator('.stepbtn').nth(2).click();
await A.getByLabel('TWA-N03').click();
await A.locator('input[type=file]').setInputFiles(process.env.TEST_PHOTO);
await A.waitForTimeout(700);
await A.getByRole('button', { name: 'Close' }).click();
await A.getByRole('button', { name: /Airfield/ }).click();
await A.getByRole('button', { name: 'Daily report' }).click();
await A.waitForSelector('.stephead');
await A.getByRole('button', { name: /Airfield/ }).click();
await synced(A);

const B = await tablet('Carlos Leisse');
await synced(B);
await openZone(B);
const bSeesN05 = await rowStatus(B, 'TWA-N05');
await B.screenshot({ path: `${OUT}/31-sync-b-sees-a.png` });
// B taps TWA-N06 to Complete and opens the report, which should already carry Darrell
await zoomTo(B, 'TWA-N06');
await B.getByLabel('TWA-N06').click();
await B.locator('.stepbtn').nth(4).click();
await B.getByRole('button', { name: /Airfield/ }).click();
await B.getByRole('button', { name: 'Daily report' }).click();
await B.waitForSelector('.stephead');
for (let i = 0; i < 7; i++) { await B.getByRole('button', { name: /^Next/ }).click(); await B.waitForTimeout(150); }
const bPreview = await B.locator('.preview').textContent();
await B.getByRole('button', { name: /Airfield/ }).click();
await synced(B);

await syncNow(A);
await openZone(A);
const aSeesN06 = await rowStatus(A, 'TWA-N06');
await A.getByRole('button', { name: /Airfield/ }).click();
await A.getByRole('button', { name: 'Daily report' }).click();
await A.waitForSelector('.stephead');
for (let i = 0; i < 7; i++) { await A.getByRole('button', { name: /^Next/ }).click(); await A.waitForTimeout(150); }
const aPreview = await A.locator('.preview').textContent();
await A.screenshot({ path: `${OUT}/32-sync-a-merged-report.png` });
const aPhotos = (aPreview.match(/Photos attached: (\d+)/) || [])[1];
const bPhotos = (bPreview.match(/Photos attached: (\d+)/) || [])[1];
console.log(JSON.stringify({ bSeesN05, aSeesN06, aForeman: (aPreview.match(/Foreman: (.*)/) || [])[1], bForeman: (bPreview.match(/Foreman: (.*)/) || [])[1], aPhotos, bPhotos, aWork: (aPreview.match(/1\.2 Work Executed\n([\s\S]*?)\n\n/) || [])[1], errors }, null, 1));
await browser.close();
