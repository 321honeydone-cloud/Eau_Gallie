// Generates the placeholder airfield: overview sheet, four detail sheets, and the
// part list that goes with them. Run: node scripts/gen-placeholder.mjs
// Output: public/placeholder/*.svg and src/data/placeholder.json
// This is a made up field. Swap it for the real plan set through the admin screen.
import { writeFileSync, mkdirSync } from 'node:fs';

const W = 1600, H = 1000;
const OUT_SVG = 'public/placeholder';
const OUT_JSON = 'src/data/placeholder.json';
mkdirSync(OUT_SVG, { recursive: true });

// ---------- overview geometry, in overview pixels ----------
const RW = { x1: 120, x2: 1480, yc: 560, h: 70 };
const TW = { x1: 200, x2: 1400, yc: 360, h: 36 };
const CONN = [{ name: 'B1', x: 330 }, { name: 'B2', x: 800 }, { name: 'B3', x: 1270 }];
const APRON = { x1: 560, x2: 1040, y1: 120, y2: 300 };
const VAULT = { x1: 1120, x2: 1200, y1: 180, y2: 240 };

const ZONES = [
  { id: 'z_e108', sheet: 'E-108', title: 'Taxiway A West Lighting Plan', phase: 'p1', rect: { x1: 180, y1: 300, x2: 790, y2: 420 } },
  { id: 'z_e109', sheet: 'E-109', title: 'Taxiway A East Lighting Plan', phase: 'p1', rect: { x1: 810, y1: 300, x2: 1420, y2: 420 } },
  { id: 'z_e110', sheet: 'E-110', title: 'Runway 8-26 Lighting Plan', phase: 'p2', rect: { x1: 100, y1: 500, x2: 1500, y2: 620 } },
  { id: 'z_e111', sheet: 'E-111', title: 'Apron and Vault Plan', phase: 'p2', rect: { x1: 540, y1: 100, x2: 1220, y2: 310 } },
];

const PAY = [
  { id: 'pi_demo', itemNo: '23', specRef: 'SP-105', description: 'Electrical Demolition', unit: 'EA', billingType: 'unit', unitPrice: 350, bidQty: 16 },
  { id: 'pi_twl', itemNo: '30', specRef: 'L-125-5.1', description: 'Taxiway Edge Light, L-861T, LED', unit: 'EA', billingType: 'unit', unitPrice: 1450, bidQty: 40 },
  { id: 'pi_rwl', itemNo: '31', specRef: 'L-125-5.2', description: 'Runway Edge Light, L-862, LED', unit: 'EA', billingType: 'unit', unitPrice: 1900, bidQty: 28 },
  { id: 'pi_thr', itemNo: '32', specRef: 'L-125-5.3', description: 'Threshold Light, L-862E, LED', unit: 'EA', billingType: 'unit', unitPrice: 2100, bidQty: 8 },
  { id: 'pi_sign', itemNo: '33', specRef: 'L-125-5.4', description: 'Guidance Sign, L-858, Size 2', unit: 'EA', billingType: 'unit', unitPrice: 6800, bidQty: 6 },
  { id: 'pi_can', itemNo: '34', specRef: 'L-867', description: 'Base Can with Isolation Transformer', unit: 'EA', billingType: 'unit', unitPrice: 900, bidQty: 76 },
  { id: 'pi_cond', itemNo: '35', specRef: 'L-110-5.1', description: '2 in. Conduit, Direct Earth', unit: 'LF', billingType: 'unit', unitPrice: 14, bidQty: 4200 },
  { id: 'pi_duct', itemNo: '36', specRef: 'L-110-5.2', description: 'Duct Bank, 4 Way, Concrete Encased', unit: 'LF', billingType: 'unit', unitPrice: 85, bidQty: 300 },
  { id: 'pi_cable', itemNo: '37', specRef: 'L-108-5.1', description: '1/C #8 5kV L-824 Cable', unit: 'LF', billingType: 'unit', unitPrice: 4.5, bidQty: 9000 },
  { id: 'pi_hh', itemNo: '38', specRef: 'L-115-5.1', description: 'Handhole', unit: 'EA', billingType: 'unit', unitPrice: 2400, bidQty: 5 },
  { id: 'pi_mh', itemNo: '39', specRef: 'L-115-5.2', description: 'Electrical Manhole', unit: 'EA', billingType: 'unit', unitPrice: 9500, bidQty: 2 },
  { id: 'pi_ccr', itemNo: '40', specRef: 'L-109-5.1', description: 'Constant Current Regulator, 10kW', unit: 'EA', billingType: 'unit', unitPrice: 18000, bidQty: 1 },
  { id: 'pi_pole', itemNo: '41', specRef: 'L-125-5.5', description: 'Apron Floodlight Pole with Fixtures', unit: 'EA', billingType: 'unit', unitPrice: 12500, bidQty: 4 },
  { id: 'pi_temp', itemNo: '22', specRef: 'SP-104', description: 'Temporary Power and Temporary Airfield Lighting', unit: 'LS', billingType: 'lumpsum', unitPrice: 45000, bidQty: 1, percentComplete: 0 },
  { id: 'pi_fc', itemNo: '25', specRef: 'SP-111-3', description: 'FAA Flight Check of Runway 8-26 Lighting', unit: 'AL', billingType: 'allowance', unitPrice: 15000, bidQty: 1 },
].map(p => ({ ...p, jobId: 'job_placeholder' }));

// ---------- parts, in overview pixels, converted later ----------
const parts = [];
let n = 0;
function part(o) {
  n += 1;
  parts.push({
    id: `pt_${String(n).padStart(3, '0')}`,
    jobId: 'job_placeholder',
    work: 'install',
    kind: 'point',
    installPay: [],
    demoPay: [],
    installStep: 0,
    demoStep: 0,
    ...o,
  });
}
const fix = (item) => [{ payItemId: 'pi_can', billAtStep: 2 }, { payItemId: item, billAtStep: 4 }];

// Taxiway A edge lights, both sides
function taxiwayLights(zoneId, x1, x2, prefix) {
  const spacing = 60;
  let i = 0;
  for (let x = x1 + 30; x <= x2 - 20; x += spacing) {
    i += 1;
    for (const [side, dy] of [['N', -TW.h / 2 - 12], ['S', TW.h / 2 + 12]]) {
      part({ zoneId, label: `${prefix}-${side}${String(i).padStart(2, '0')}`, category: 'fixture', ox: x, oy: TW.yc + dy, installPay: fix('pi_twl') });
    }
  }
}
taxiwayLights('z_e108', 200, 790, 'TWA');
taxiwayLights('z_e109', 810, 1400, 'TWA');
// four RE lights in E-108, remove and reinstall
for (const p of parts.filter(p => p.zoneId === 'z_e108').slice(0, 4)) {
  p.work = 're';
  p.demoPay = [{ payItemId: 'pi_demo', billAtStep: 4 }];
  p.installPay = [{ payItemId: 'pi_twl', billAtStep: 4 }];
  p.label = p.label + ' (RE)';
}
// signs at the connectors
for (const c of CONN) {
  const zoneId = c.x < 800 ? 'z_e108' : 'z_e109';
  part({ zoneId, label: `SIGN ${c.name}-1`, category: 'sign', ox: c.x - 28, oy: TW.yc - TW.h / 2 - 34, installPay: [{ payItemId: 'pi_sign', billAtStep: 4 }] });
  part({ zoneId, label: `SIGN ${c.name}-2`, category: 'sign', ox: c.x + 28, oy: TW.yc + TW.h / 2 + 34, installPay: [{ payItemId: 'pi_sign', billAtStep: 4 }] });
}
// old signs to demo in E-109
for (const [i, x] of [[1, 900], [2, 1050], [3, 1200]]) {
  part({ zoneId: 'z_e109', label: `EX SIGN ${i}`, category: 'sign', work: 'demo', ox: x, oy: TW.yc - TW.h / 2 - 60, demoPay: [{ payItemId: 'pi_demo', billAtStep: 4 }] });
}
// handholes and runs, taxiway
part({ zoneId: 'z_e108', label: 'HH-1', category: 'handhole', ox: 330, oy: TW.yc + 62, installPay: [{ payItemId: 'pi_hh', billAtStep: 4 }] });
part({ zoneId: 'z_e109', label: 'HH-2', category: 'handhole', ox: 1270, oy: TW.yc + 62, installPay: [{ payItemId: 'pi_hh', billAtStep: 4 }] });
part({ zoneId: 'z_e108', label: 'Conduit run TWA West, south edge', category: 'conduit', kind: 'linear', totalQty: 590, ox: 495, oy: TW.yc + 80, installPay: [{ payItemId: 'pi_cond', billAtStep: 4 }] });
part({ zoneId: 'z_e109', label: 'Conduit run TWA East, south edge', category: 'conduit', kind: 'linear', totalQty: 590, ox: 1105, oy: TW.yc + 80, installPay: [{ payItemId: 'pi_cond', billAtStep: 4 }] });
part({ zoneId: 'z_e108', label: 'Cable, TWA West loop', category: 'cable', kind: 'linear', totalQty: 1300, installPay: [{ payItemId: 'pi_cable', billAtStep: 4 }] });
part({ zoneId: 'z_e109', label: 'Cable, TWA East loop', category: 'cable', kind: 'linear', totalQty: 1300, installPay: [{ payItemId: 'pi_cable', billAtStep: 4 }] });

// Runway edge lights and thresholds
{
  const spacing = 100;
  let i = 0;
  for (let x = RW.x1 + 80; x <= RW.x2 - 80; x += spacing) {
    i += 1;
    for (const [side, dy] of [['N', -RW.h / 2 - 14], ['S', RW.h / 2 + 14]]) {
      part({ zoneId: 'z_e110', label: `RW-${side}${String(i).padStart(2, '0')}`, category: 'fixture', ox: x, oy: RW.yc + dy, installPay: fix('pi_rwl') });
    }
  }
  for (const [end, x] of [['8', RW.x1 + 10], ['26', RW.x2 - 10]]) {
    for (let k = 0; k < 4; k++) {
      part({ zoneId: 'z_e110', label: `THR-${end}-${k + 1}`, category: 'fixture', ox: x, oy: RW.yc - 27 + k * 18, installPay: fix('pi_thr') });
    }
  }
  part({ zoneId: 'z_e110', label: 'HH-3', category: 'handhole', ox: 800, oy: RW.yc + 70, installPay: [{ payItemId: 'pi_hh', billAtStep: 4 }] });
  part({ zoneId: 'z_e110', label: 'Conduit run RW 8-26, south edge', category: 'conduit', kind: 'linear', totalQty: 1360, ox: 500, oy: RW.yc + 95, installPay: [{ payItemId: 'pi_cond', billAtStep: 4 }] });
  part({ zoneId: 'z_e110', label: 'Cable, RW 8-26 loop', category: 'cable', kind: 'linear', totalQty: 2900, installPay: [{ payItemId: 'pi_cable', billAtStep: 4 }] });
}

// Apron and vault
for (const [i, x, y] of [[1, 600, 150], [2, 1000, 150], [3, 600, 280], [4, 1000, 280]]) {
  part({ zoneId: 'z_e111', label: `FL-${i}`, category: 'pole', ox: x, oy: y, installPay: [{ payItemId: 'pi_pole', billAtStep: 4 }] });
}
part({ zoneId: 'z_e111', label: 'CCR-1', category: 'regulator', ox: 1160, oy: 210, installPay: [{ payItemId: 'pi_ccr', billAtStep: 4 }] });
part({ zoneId: 'z_e111', label: 'MH-1', category: 'manhole', ox: 1080, oy: 240, installPay: [{ payItemId: 'pi_mh', billAtStep: 4 }] });
part({ zoneId: 'z_e111', label: 'MH-2', category: 'manhole', ox: 800, oy: 240, installPay: [{ payItemId: 'pi_mh', billAtStep: 4 }] });
part({ zoneId: 'z_e111', label: 'Duct bank, vault to apron', category: 'duct', kind: 'linear', totalQty: 300, ox: 940, oy: 240, installPay: [{ payItemId: 'pi_duct', billAtStep: 4 }] });

// ---------- drawing helpers ----------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function titleBlock(sheetNo, title) {
  return `
  <g font-family="Helvetica, Arial, sans-serif">
    <rect x="1100" y="860" width="460" height="110" fill="#fff" stroke="#131A46" stroke-width="2"/>
    <line x1="1100" y1="895" x2="1560" y2="895" stroke="#131A46" stroke-width="1"/>
    <line x1="1380" y1="860" x2="1380" y2="970" stroke="#131A46" stroke-width="1"/>
    <text x="1112" y="884" font-size="16" font-weight="700" fill="#131A46">PLACEHOLDER FIELD</text>
    <text x="1112" y="922" font-size="14" fill="#131A46">${esc(title)}</text>
    <text x="1112" y="948" font-size="11" fill="#EC1C2D">NOT A REAL AIRPORT. SWAP FOR THE REAL PLAN SET.</text>
    <text x="1392" y="884" font-size="11" fill="#6B7088">SHEET</text>
    <text x="1392" y="940" font-size="34" font-weight="700" fill="#131A46">${esc(sheetNo)}</text>
    <g transform="translate(60,900)"><circle r="22" fill="none" stroke="#131A46" stroke-width="2"/><path d="M0,-18 L8,10 L0,4 L-8,10 Z" fill="#131A46"/><text y="-28" font-size="12" text-anchor="middle" fill="#131A46">N</text></g>
  </g>`;
}
function frame() {
  return `<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/><rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="#131A46" stroke-width="3"/>`;
}
// symbol for a part, drawn at (x,y) in sheet px
function symbol(p, x, y, s) {
  const r = 7 * s;
  switch (p.category) {
    case 'fixture': {
      const isRw = p.label.startsWith('RW') || p.label.startsWith('THR');
      const fill = p.label.startsWith('THR') ? '#2E7D4F' : isRw ? '#fff' : '#69A6D5';
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="#131A46" stroke-width="${1.5 * s}"/>`;
    }
    case 'sign': return `<rect x="${x - 12 * s}" y="${y - 6 * s}" width="${24 * s}" height="${12 * s}" fill="${p.work === 'demo' ? '#fff' : '#F5C400'}" stroke="#131A46" stroke-width="${1.5 * s}" ${p.work === 'demo' ? 'stroke-dasharray="4 3"' : ''}/>`;
    case 'handhole': return `<rect x="${x - 8 * s}" y="${y - 8 * s}" width="${16 * s}" height="${16 * s}" fill="#fff" stroke="#131A46" stroke-width="${1.5 * s}"/><line x1="${x - 8 * s}" y1="${y - 8 * s}" x2="${x + 8 * s}" y2="${y + 8 * s}" stroke="#131A46" stroke-width="${s}"/>`;
    case 'manhole': return `<rect x="${x - 12 * s}" y="${y - 12 * s}" width="${24 * s}" height="${24 * s}" fill="#fff" stroke="#131A46" stroke-width="${2 * s}"/><text x="${x}" y="${y + 4 * s}" font-size="${10 * s}" text-anchor="middle" font-family="Helvetica, Arial" fill="#131A46">MH</text>`;
    case 'regulator': return `<rect x="${x - 16 * s}" y="${y - 10 * s}" width="${32 * s}" height="${20 * s}" fill="#fff" stroke="#131A46" stroke-width="${2 * s}"/><text x="${x}" y="${y + 4 * s}" font-size="${10 * s}" text-anchor="middle" font-family="Helvetica, Arial" fill="#131A46">CCR</text>`;
    case 'pole': return `<circle cx="${x}" cy="${y}" r="${10 * s}" fill="#fff" stroke="#131A46" stroke-width="${2 * s}"/><line x1="${x - 10 * s}" y1="${y}" x2="${x + 10 * s}" y2="${y}" stroke="#131A46" stroke-width="${1.5 * s}"/><line x1="${x}" y1="${y - 10 * s}" x2="${x}" y2="${y + 10 * s}" stroke="#131A46" stroke-width="${1.5 * s}"/>`;
    case 'conduit': return `<text x="${x}" y="${y}" font-size="${11 * s}" text-anchor="middle" font-family="Helvetica, Arial" fill="#131A46">2" C, ${p.totalQty} LF</text>`;
    case 'duct': return `<text x="${x}" y="${y - 14 * s}" font-size="${11 * s}" text-anchor="middle" font-family="Helvetica, Arial" fill="#131A46">4W DUCT BANK, ${p.totalQty} LF</text>`;
    default: return '';
  }
}
function label(p, x, y, s) {
  if (p.kind === 'linear') return '';
  return `<text x="${x + 10 * s}" y="${y - 8 * s}" font-size="${9 * s}" font-family="Helvetica, Arial" fill="#4A4F66">${esc(p.label)}</text>`;
}

// base geometry drawn in overview coordinates, wrapped in a transform
function airfieldGeometry(s) {
  const out = [];
  out.push(`<rect x="${RW.x1}" y="${RW.yc - RW.h / 2}" width="${RW.x2 - RW.x1}" height="${RW.h}" fill="#8f949b" stroke="#131A46" stroke-width="${2 / s}"/>`);
  out.push(`<line x1="${RW.x1 + 40}" y1="${RW.yc}" x2="${RW.x2 - 40}" y2="${RW.yc}" stroke="#fff" stroke-width="${3 / s}" stroke-dasharray="${40 / s} ${25 / s}"/>`);
  out.push(`<text x="${RW.x1 + 45}" y="${RW.yc + 8}" font-size="${22 / Math.sqrt(s)}" font-weight="700" fill="#fff" font-family="Helvetica, Arial" transform="rotate(90 ${RW.x1 + 45} ${RW.yc + 8})">8</text>`);
  out.push(`<text x="${RW.x2 - 45}" y="${RW.yc + 8}" font-size="${22 / Math.sqrt(s)}" font-weight="700" fill="#fff" font-family="Helvetica, Arial" text-anchor="middle" transform="rotate(-90 ${RW.x2 - 45} ${RW.yc + 8})">26</text>`);
  out.push(`<rect x="${TW.x1}" y="${TW.yc - TW.h / 2}" width="${TW.x2 - TW.x1}" height="${TW.h}" fill="#b9bec6" stroke="#131A46" stroke-width="${1.5 / s}"/>`);
  out.push(`<line x1="${TW.x1}" y1="${TW.yc}" x2="${TW.x2}" y2="${TW.yc}" stroke="#F5C400" stroke-width="${2 / s}"/>`);
  for (const c of CONN) {
    out.push(`<rect x="${c.x - 15}" y="${TW.yc + TW.h / 2 - 2}" width="30" height="${RW.yc - RW.h / 2 - TW.yc - TW.h / 2 + 4}" fill="#b9bec6" stroke="#131A46" stroke-width="${1.5 / s}"/>`);
    out.push(`<line x1="${c.x}" y1="${TW.yc}" x2="${c.x}" y2="${RW.yc - RW.h / 2}" stroke="#F5C400" stroke-width="${2 / s}"/>`);
    out.push(`<text x="${c.x + 20}" y="${(TW.yc + RW.yc) / 2}" font-size="${14 / Math.sqrt(s)}" fill="#131A46" font-family="Helvetica, Arial">${c.name}</text>`);
  }
  out.push(`<text x="${TW.x1 + 10}" y="${TW.yc - TW.h / 2 - 40}" font-size="${16 / Math.sqrt(s)}" font-weight="700" fill="#131A46" font-family="Helvetica, Arial">TAXIWAY A</text>`);
  out.push(`<rect x="${APRON.x1}" y="${APRON.y1}" width="${APRON.x2 - APRON.x1}" height="${APRON.y2 - APRON.y1}" fill="#cfd3da" stroke="#131A46" stroke-width="${1.5 / s}"/>`);
  out.push(`<text x="${(APRON.x1 + APRON.x2) / 2}" y="${(APRON.y1 + APRON.y2) / 2}" font-size="${16 / Math.sqrt(s)}" font-weight="700" fill="#4A4F66" text-anchor="middle" font-family="Helvetica, Arial">APRON</text>`);
  out.push(`<rect x="${VAULT.x1}" y="${VAULT.y1}" width="${VAULT.x2 - VAULT.x1}" height="${VAULT.y2 - VAULT.y1}" fill="#fff" stroke="#131A46" stroke-width="${2 / s}"/>`);
  out.push(`<text x="${(VAULT.x1 + VAULT.x2) / 2}" y="${VAULT.y2 + 16}" font-size="${11 / Math.sqrt(s)}" fill="#131A46" text-anchor="middle" font-family="Helvetica, Arial">ELEC VAULT</text>`);
  // taxiway conduit runs, dashed along the south edge, and the duct bank
  out.push(`<line x1="${TW.x1}" y1="${TW.yc + TW.h / 2 + 24}" x2="${TW.x2}" y2="${TW.yc + TW.h / 2 + 24}" stroke="#131A46" stroke-width="${1 / s}" stroke-dasharray="${8 / s} ${5 / s}"/>`);
  out.push(`<line x1="${RW.x1}" y1="${RW.yc + RW.h / 2 + 30}" x2="${RW.x2}" y2="${RW.yc + RW.h / 2 + 30}" stroke="#131A46" stroke-width="${1 / s}" stroke-dasharray="${8 / s} ${5 / s}"/>`);
  out.push(`<line x1="${VAULT.x1}" y1="240" x2="${APRON.x2 - 240}" y2="240" stroke="#131A46" stroke-width="${3 / s}" stroke-dasharray="${12 / s} ${6 / s}"/>`);
  return out.join('\n');
}

// ---------- overview sheet ----------
{
  const zoneBoxes = ZONES.map(z => `<rect x="${z.rect.x1}" y="${z.rect.y1}" width="${z.rect.x2 - z.rect.x1}" height="${z.rect.y2 - z.rect.y1}" fill="none" stroke="#EC1C2D" stroke-width="2" stroke-dasharray="10 6"/><text x="${z.rect.x1 + 6}" y="${z.rect.y1 - 6}" font-size="13" font-weight="700" fill="#EC1C2D" font-family="Helvetica, Arial">SEE ${z.sheet}</text>`).join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${frame()}${airfieldGeometry(1)}${zoneBoxes}${titleBlock('E-101', 'Airfield Lighting Overall Plan')}</svg>`;
  writeFileSync(`${OUT_SVG}/e101.svg`, svg);
}

// ---------- detail sheets ----------
const DRAW = { x1: 80, y1: 80, x2: 1520, y2: 830 };
const sheetsOut = [{ id: 'sh_e101', jobId: 'job_placeholder', name: 'E-101', title: 'Airfield Lighting Overall Plan', src: '/placeholder/e101.svg', width: W, height: H }];
const zonesOut = [];
for (const z of ZONES) {
  const zw = z.rect.x2 - z.rect.x1, zh = z.rect.y2 - z.rect.y1;
  const s = Math.min((DRAW.x2 - DRAW.x1) / zw, (DRAW.y2 - DRAW.y1) / zh) * 0.92;
  const tx = (DRAW.x1 + DRAW.x2) / 2 - ((z.rect.x1 + z.rect.x2) / 2) * s;
  const ty = (DRAW.y1 + DRAW.y2) / 2 - ((z.rect.y1 + z.rect.y2) / 2) * s;
  const toSheet = (ox, oy) => ({ x: ox * s + tx, y: oy * s + ty });
  const zparts = parts.filter(p => p.zoneId === z.id);
  const syms = zparts.filter(p => p.ox !== undefined).map(p => { const { x, y } = toSheet(p.ox, p.oy); return symbol(p, x, y, 1.6) + label(p, x, y, 1.6); }).join('\n');
  const clip = `<clipPath id="c"><rect x="${DRAW.x1}" y="${DRAW.y1}" width="${DRAW.x2 - DRAW.x1}" height="${DRAW.y2 - DRAW.y1}"/></clipPath>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${clip}</defs>${frame()}<g clip-path="url(#c)"><g transform="translate(${tx},${ty}) scale(${s})">${airfieldGeometry(s)}</g>${syms}</g>${titleBlock(z.sheet, z.title)}</svg>`;
  const file = z.sheet.toLowerCase().replace('-', '');
  writeFileSync(`${OUT_SVG}/${file}.svg`, svg);
  const sheetId = `sh_${file}`;
  sheetsOut.push({ id: sheetId, jobId: 'job_placeholder', name: z.sheet, title: z.title, src: `/placeholder/${file}.svg`, width: W, height: H });
  zonesOut.push({
    id: z.id, jobId: 'job_placeholder', phaseId: z.phase, name: `${z.sheet} ${z.title.replace(' Lighting Plan', '').replace(' Plan', '')}`,
    overviewSheetId: 'sh_e101',
    shape: [[z.rect.x1, z.rect.y1], [z.rect.x2, z.rect.y1], [z.rect.x2, z.rect.y2], [z.rect.x1, z.rect.y2]].map(([x, y]) => ({ x: +(x / W * 100).toFixed(2), y: +(y / H * 100).toFixed(2) })),
    detailSheetId: sheetId,
  });
  for (const p of zparts) {
    if (p.ox !== undefined) {
      const { x, y } = toSheet(p.ox, p.oy);
      p.x = +(x / W * 100).toFixed(2);
      p.y = +(y / H * 100).toFixed(2);
    }
    delete p.ox; delete p.oy;
  }
}

const data = {
  job: { id: 'job_placeholder', name: 'Placeholder Field Lighting Rehab', customer: 'Placeholder GC', airport: 'Placeholder Field', contractNo: 'PLACEHOLDER-001', billingList: 'owner', placeholder: true },
  phases: [
    { id: 'p1', jobId: 'job_placeholder', name: 'Phase 1, Taxiway A', order: 1 },
    { id: 'p2', jobId: 'job_placeholder', name: 'Phase 2, Runway and Apron', order: 2 },
  ],
  sheets: sheetsOut,
  zones: zonesOut,
  payItems: PAY,
  parts,
  crew: [
    { id: 'cm_darrell', name: 'Darrell Simpson', role: 'foreman' },
    { id: 'cm_carlos', name: 'Carlos Leisse', role: 'foreman' },
  ],
  equipment: ['Trencher', 'Mini excavator', 'Skid steer', 'Directional bore rig', 'Core drill', 'Saw cut rig', 'Concrete mixer', 'Bucket truck', 'Service truck', 'Van', 'Light tower']
    .map((name, i) => ({ id: `eq_${i + 1}`, jobId: 'job_placeholder', name })),
};
writeFileSync(OUT_JSON, JSON.stringify(data, null, 1));
console.log(`wrote ${sheetsOut.length} sheets, ${zonesOut.length} zones, ${parts.length} parts, ${PAY.length} pay items`);
