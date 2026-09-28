// Renders PDF pages to JPEGs with pdf.js inside headless Chromium.
// node scripts/render-pdf.mjs <pdf> <outdir> <width> [pages like 1,3,5-9]
import { chromium } from 'playwright';
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
const [pdfPath, outDir, widthArg, pagesArg] = process.argv.slice(2);
const width = Number(widthArg || 1200);
await mkdir(outDir, { recursive: true });
const pdfBuf = await readFile(pdfPath);
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/doc.pdf') { res.writeHead(200, { 'Content-Type': 'application/pdf' }); return res.end(pdfBuf); }
  if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><html><body></body></html>'); }
  try { const b = await readFile(resolve('node_modules/pdfjs-dist/build' + u.pathname)); res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/`);
const total = await page.evaluate(async () => {
  const pdfjs = await import('/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';
  window.__doc = await pdfjs.getDocument('/doc.pdf').promise;
  return window.__doc.numPages;
});
const wanted = new Set();
if (pagesArg) for (const part of pagesArg.split(',')) { const [a, b] = part.split('-').map(Number); for (let i = a; i <= (b || a); i++) wanted.add(i); }
else for (let i = 1; i <= total; i++) wanted.add(i);
const stem = basename(pdfPath, extname(pdfPath)).replace(/[^\w]+/g, '-').toLowerCase();
for (const n of [...wanted].sort((a, b) => a - b)) {
  const dataUrl = await page.evaluate(async ({ n, width }) => {
    const p = await window.__doc.getPage(n);
    const base = p.getViewport({ scale: 1 });
    const vp = p.getViewport({ scale: width / base.width });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await p.render({ canvasContext: g, viewport: vp }).promise;
    return c.toDataURL('image/jpeg', 0.85);
  }, { n, width });
  await writeFile(`${outDir}/${stem}-p${String(n).padStart(2, '0')}.jpg`, Buffer.from(dataUrl.split(',')[1], 'base64'));
}
await browser.close(); server.close();
console.log(`rendered ${wanted.size} of ${total} pages from ${pdfPath}`);
