// Some hosts refuse text files that carry raw control bytes. pdf.js's worker has a few
// inside string literals. Rewriting them as \xNN escapes means the same thing to JavaScript.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = 'dist/assets';
for (const f of readdirSync(dir)) {
  if (!/\.(m?js|css)$/.test(f)) continue;
  const p = join(dir, f);
  const b = readFileSync(p);
  let changed = 0;
  const out = [];
  for (const c of b) {
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) { out.push(...Buffer.from(`\\x${c.toString(16).padStart(2, '0')}`)); changed++; }
    else out.push(c);
  }
  if (changed) { writeFileSync(p, Buffer.from(out)); console.log(`${f}: rewrote ${changed} control bytes`); }
}
