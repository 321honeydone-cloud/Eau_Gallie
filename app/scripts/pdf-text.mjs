// Dumps every text item on each page with its position, as fractions of the page, so the
// detector can read the modifier letters and sign names beside each symbol.
// node scripts/pdf-text.mjs <pdf> <out.json> [pages]
import { chromium } from 'playwright';
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const [pdfPath, outPath, pagesArg] = process.argv.slice(2);
const pdfBuf = await readFile(pdfPath);
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/doc.pdf') { res.writeHead(200, { 'Content-Type': 'application/pdf' }); return res.end(pdfBuf); }
  if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><html><body></body></html>'); }
  try { const b = await readFile(resolve('node_modules/pdfjs-dist/build' + u.pathname)); res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(b); } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/`);
const wanted = pagesArg ? pagesArg.split(',').flatMap(p => { const [a, b] = p.split('-').map(Number); return Array.from({ length: (b || a) - a + 1 }, (_, i) => a + i); }) : null;
const result = await page.evaluate(async (wanted) => {
  const pdfjs = await import('/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';
  const doc = await pdfjs.getDocument('/doc.pdf').promise;
  const out = {};
  for (let n = 1; n <= doc.numPages; n++) {
    if (wanted && !wanted.includes(n)) continue;
    const p = await doc.getPage(n);
    const vp = p.getViewport({ scale: 1 });
    const tc = await p.getTextContent();
    const items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      // transform maps text space to page space, apply the viewport so rotation is handled
      const [a, b, c, d, e, f] = pdfjs.Util.transform(vp.transform, it.transform);
      const size = Math.hypot(a, b);
      items.push({ s: it.str.trim(), x: e / vp.width, y: f / vp.height, w: (it.width * size / Math.hypot(a, b)) / vp.width, h: size / vp.height, rot: Math.round(Math.atan2(b, a) * 180 / Math.PI) });
    }
    out[n] = { w: vp.width, h: vp.height, items };
  }
  return out;
}, wanted);
await writeFile(outPath, JSON.stringify(result));
await browser.close(); server.close();
console.log(`text for ${Object.keys(result).length} pages, ${Object.values(result).reduce((s, p) => s + p.items.length, 0)} items`);
