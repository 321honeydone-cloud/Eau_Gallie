// Pulls stroked vector paths out of plan sheet pages: every line the drawing draws, with its width,
// dash pattern and gray level, as fractions of the page. Bold dashed lines are the new duct runs.
// usage: node scripts/pdf-paths.mjs <pdf> <out.json> [pages]
import { readFileSync, writeFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
const [,, file, out, pagesArg] = process.argv;
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), useSystemFonts: true }).promise;
const pages = pagesArg ? pagesArg.split(',').map(Number) : Array.from({ length: doc.numPages }, (_, i) => i + 1);
const OPS = pdfjs.OPS;
const result = {};
for (const pno of pages) {
  const page = await doc.getPage(pno);
  const vp = page.getViewport({ scale: 1 }); const W = vp.width, H = vp.height;
  const ops = await page.getOperatorList();
  const stack = []; let ctm = vp.transform.slice(); let gs = { lw: 1, dash: null, stroke: 0, fill: 0 };
  const mul = (m, n) => [m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1], m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3], m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]];
  const apply = (m, x, y) => [(m[0]*x + m[2]*y + m[4]) / W, (m[1]*x + m[3]*y + m[5]) / H];
  const paths = []; let cur = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], a = ops.argsArray[i];
    if (fn === OPS.save) stack.push({ ctm: ctm.slice(), gs: { ...gs } });
    else if (fn === OPS.restore) { const s = stack.pop(); if (s) { ctm = s.ctm; gs = s.gs; } }
    else if (fn === OPS.transform) ctm = mul(ctm, a);
    else if (fn === OPS.setLineWidth) gs.lw = a[0];
    else if (fn === OPS.setDash) gs.dash = a[0] && a[0].length ? a[0].slice() : null;
    else if (fn === OPS.setStrokeRGBColor) gs.stroke = Math.round((a[0] + a[1] + a[2]) / 3);
    else if (fn === OPS.setStrokeGray) gs.stroke = Math.round(a[0] * 255);
    else if (fn === OPS.setFillRGBColor) gs.fill = Math.round((a[0] + a[1] + a[2]) / 3);
    else if (fn === OPS.setFillGray) gs.fill = Math.round(a[0] * 255);
    else if (fn === OPS.setStrokeColorN || fn === OPS.setStrokeColor) { if (a.length >= 3) gs.stroke = Math.round((a[0] + a[1] + a[2]) / 3); else if (a.length === 1 && typeof a[0] === 'number') gs.stroke = Math.round(a[0] * 255); }
    else if (fn === OPS.constructPath) {
      const [fns, args] = a; let k = 0; let poly = [];
      const flush = () => { if (poly.length > 1) cur.push(poly); poly = []; };
      for (const f of fns) {
        if (f === OPS.moveTo) { flush(); poly.push(apply(ctm, args[k], args[k + 1])); k += 2; }
        else if (f === OPS.lineTo) { poly.push(apply(ctm, args[k], args[k + 1])); k += 2; }
        else if (f === OPS.curveTo) { poly.push(apply(ctm, args[k + 4], args[k + 5])); k += 6; }
        else if (f === OPS.curveTo2 || f === OPS.curveTo3) { poly.push(apply(ctm, args[k + 2], args[k + 3])); k += 4; }
        else if (f === OPS.rectangle) { flush(); const [x, y, w, h] = args.slice(k, k + 4); k += 4; cur.push([apply(ctm, x, y), apply(ctm, x + w, y), apply(ctm, x + w, y + h), apply(ctm, x, y + h), apply(ctm, x, y)]); }
        else if (f === OPS.closePath) { if (poly.length) poly.push(poly[0]); }
      }
      flush();
      // path painting op follows in the same constructPath in pdf.js 4: check the last fn
      const last = fns[fns.length - 1];
      const strokes = last === OPS.stroke || last === OPS.closeStroke || last === OPS.fillStroke || last === OPS.eoFillStroke || last === OPS.closeFillStroke || last === OPS.closeEOFillStroke;
      if (strokes && cur.length) {
        const sx = Math.hypot(ctm[0], ctm[1]);
        for (const pl of cur) paths.push({ lw: +(gs.lw * sx).toFixed(2), dash: gs.dash ? gs.dash.map(d => +(d * sx).toFixed(1)) : null, g: gs.stroke, pts: pl.map(([x, y]) => [+(x * 100).toFixed(3), +(y * 100).toFixed(3)]) });
        cur = [];
      }
    }
    else if (fn === OPS.stroke || fn === OPS.closeStroke || fn === OPS.fillStroke || fn === OPS.eoFillStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke || fn === OPS.fill || fn === OPS.eoFill) {
      const filled = fn !== OPS.stroke && fn !== OPS.closeStroke;
      if (cur.length) { const sx = Math.hypot(ctm[0], ctm[1]); for (const pl of cur) paths.push({ lw: +(gs.lw * sx).toFixed(2), dash: gs.dash ? gs.dash.map(d => +(d * sx).toFixed(1)) : null, g: gs.stroke, ...(filled ? { f: gs.fill } : {}), pts: pl.map(([x, y]) => [+(x * 100).toFixed(3), +(y * 100).toFixed(3)]) }); }
      cur = [];
    }
    else if (fn === OPS.endPath) cur = [];
  }
  result[pno] = { w: W, h: H, paths };
  console.log(`page ${pno}: ${paths.length} stroked paths`);
}
writeFileSync(out, JSON.stringify(result));
