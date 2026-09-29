// Builds the Pensacola Runway 8-26 job from the rendered sheets and the bid schedule.
// Zones are one per lighting layout sheet, boxed on the C-6 overall plan. Pins come from the legend-driven
// symbol finder (scripts/detect_symbols.py + finalize_symbols.py -> src/data/pensacola-parts.json).
import { readFileSync, writeFileSync } from 'node:fs';
import sizeOf from './image-size.mjs';
const J = 'job_pensacola_rw826';
const bid = JSON.parse(readFileSync('src/data/pensacola-bid-items.json', 'utf8'));
const found = JSON.parse(readFileSync('src/data/pensacola-parts.json', 'utf8'));
const circ = JSON.parse(readFileSync('src/data/pensacola-circuits.json', 'utf8'));
const sheetDefs = [
  ['c6-overall', 'C-6', 'Overall Plan (Drainage sheet used as the airfield map)', true],
  ['e201', 'E201', 'Airfield Lighting Layout Plan, Sheet 1 of 11'], ['e202', 'E202', 'Airfield Lighting Layout Plan, Sheet 2 of 11'],
  ['e203', 'E203', 'Airfield Lighting Layout Plan, Sheet 3 of 11'], ['e204', 'E204', 'Airfield Lighting Layout Plan, Sheet 4 of 11'],
  ['e205', 'E205', 'Airfield Lighting Layout Plan, Sheet 5 of 11'], ['e206', 'E206', 'Airfield Lighting Layout Plan, Sheet 6 of 11'],
  ['e207', 'E207', 'Airfield Lighting Layout Plan, Sheet 7 of 11'], ['e208', 'E208', 'Airfield Lighting Layout Plan, Sheet 8 of 11'],
  ['e209', 'E209', 'Airfield Lighting Layout Plan, Sheet 9 of 11'], ['e210', 'E210', 'Airfield Lighting Layout Plan, Sheet 10 of 11'],
  ['e211', 'E211', 'Airfield Lighting Layout Plan, Sheet 11 of 11'],
  ...Array.from({ length: 11 }, (_, i) => [`e3${String(i + 1).padStart(2, '0')}`, `E3${String(i + 1).padStart(2, '0')}`, `Airfield Lighting Circuiting Plan, Sheet ${i + 1} of 11`]),
  ['e702', 'E702', 'Proposed Airfield Lighting Vault'],
];
const sheets = sheetDefs.map(([file, name, title, isOverview], i) => {
  const { width, height } = sizeOf(`public/pensacola/${file}.jpg`);
  return { id: `sh_pns_${file}`, jobId: J, name, title, src: `/pensacola/${file}.jpg`, pdfSrc: `/pensacola/${file}.pdf`, pdfPage: 1, width, height, order: i + 1, isOverview: !!isOverview };
});
// Where each sheet sits on C-6, as fractions of the sheet. Runway centerline is about y 0.36.
const rects = {
  E201: [0.09, 0.27, 0.20, 0.46], E202: [0.20, 0.27, 0.30, 0.46], E203: [0.30, 0.22, 0.42, 0.37], E204: [0.30, 0.37, 0.42, 0.50],
  E205: [0.42, 0.27, 0.50, 0.46], E206: [0.50, 0.27, 0.58, 0.46], E207: [0.58, 0.27, 0.65, 0.46], E208: [0.65, 0.27, 0.72, 0.46],
  E209: [0.72, 0.27, 0.80, 0.46], E210: [0.19, 0.17, 0.30, 0.27], E211: [0.17, 0.06, 0.30, 0.17],
};
const areas = { E201: 'RW 8 end, TW B1', E202: 'TW B2', E203: 'TW B at RW 17-35', E204: 'TW A and TW D at RW 17-35', E205: 'TW B3', E206: 'TW C and TW D', E207: 'TW C, TW D east', E208: 'TW D3, TW B5', E209: 'TW D4, TW B6', E210: 'TW A, TW F2', E211: 'Cargo apron, TW A2' };
const phases = [{ id: 'ph_pns_1', jobId: J, name: 'Phase 1', order: 1 }];
const box = ([x1, y1, x2, y2]) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].map(([x, y]) => ({ x: +(x * 100).toFixed(2), y: +(y * 100).toFixed(2) }));
const zones = Object.entries(rects).map(([name, r]) => ({
  id: `z_pns_${name.toLowerCase()}`, jobId: J, phaseId: 'ph_pns_1', name: `${name} ${areas[name]}`,
  overviewSheetId: 'sh_pns_c6-overall', detailSheetId: `sh_pns_${name.toLowerCase()}`,
  sheetIds: [`sh_pns_e3${name.slice(2)}`],   // the circuiting plan covers the same ground
  shape: box(r),
}));
// the vault and the site wide items get their own boxes off to the side of the overall plan
zones.push({ id: 'z_pns_vault', jobId: J, phaseId: 'ph_pns_1', name: 'Vault (E702)', overviewSheetId: 'sh_pns_c6-overall', detailSheetId: 'sh_pns_e702', shape: box([0.02, 0.50, 0.10, 0.58]) });
zones.push({ id: 'z_pns_site', jobId: J, phaseId: 'ph_pns_1', name: 'Site wide: cable, counterpoise, wind cone', overviewSheetId: 'sh_pns_c6-overall', detailSheetId: 'sh_pns_c6-overall', shape: box([0.02, 0.60, 0.10, 0.68]) });
// bid schedule: electrical items only, unit prices left at 0 for the office to fill in
const fixUnit = it => (it.unit === 'LS' && it.qty > 1 ? 'EA' : it.unit || 'EA');
const payItems = bid.filter(it => /^(L-|SP-)/.test(it.specRef)).map(it => {
  const unit = fixUnit(it);
  return { id: `pi_pns_${it.itemNo}`, jobId: J, itemNo: it.itemNo, specRef: it.specRef, description: it.description.replace(/\s+/g, ' ').trim(), unit,
    billingType: unit === 'LS' ? 'lumpsum' : unit === 'AL' ? 'allowance' : 'unit', unitPrice: 0, bidQty: it.qty ?? 0, ...(unit === 'LS' ? { percentComplete: 0 } : {}) };
});
const equipment = ['Trencher', 'Mini excavator', 'Skid steer', 'Directional bore rig', 'Core drill', 'Saw cut rig', 'Concrete mixer', 'Bucket truck', 'Service truck', 'Van', 'Light tower'].map((name, i) => ({ id: `eq_pns_${i + 1}`, jobId: J, name }));
// what each symbol on the sheet is, and which bid line it bills against (item numbers off the bid schedule)
const SYMBOLS = {
  'sq_circle:N': ['L-861T taxiway light N', 'fixture', 67], 'sq_circle:A': ['L-861T taxiway light A', 'fixture', 66],
  'sq_circle:T': ['L-861T taxiway light T', 'fixture', 68], 'sq_circle:RE': ['L-861T taxiway light RE (mill & overlay)', 'fixture', null],
  'sq_bar:CC': ['L-862 runway edge light C/C', 'fixture', 69], 'sq_bar:CY': ['L-862 runway edge light C/Y', 'fixture', 70],
  'threshold:A': ['L-862E threshold light G/R', 'fixture', 71],
  'plus_circle:RE': ['L-850A centerline light RE', 'fixture', 57], 'dbl_circle:RE': ['L-850C runway edge light RE', 'fixture', 58],
  'dbl_circle:A': ['L-850C runway edge light C/Y A', 'fixture', 61], 'dbl_circle:': ['L-850C runway edge light', 'fixture', null],
  'sign:1M': ['L-858 sign 1 module', 'sign', 62], 'sign:2M': ['L-858 sign 2 module', 'sign', 63], 'sign:3M': ['L-858 sign 3 module', 'sign', 64],
};
const perSheet = {};
const parts = found.parts.map(f => {
  const key = `${f.kind}:${f.face ?? f.mod ?? ''}`;
  const [name, category, itemNo] = SYMBOLS[key] ?? [`${f.kind} ${f.mod ?? ''}`.trim(), 'fixture', null];
  const n = (perSheet[`${f.sheet}|${name}`] = (perSheet[`${f.sheet}|${name}`] ?? 0) + 1);
  const pay = itemNo && payItems.find(p => p.itemNo === String(itemNo));
  return {
    id: `pt_pns_${f.sheet.toLowerCase()}_${f.kind}_${n}_${Math.round(f.x * 10)}_${Math.round(f.y * 10)}`, jobId: J, zoneId: `z_pns_${f.sheet.toLowerCase()}`,
    label: `${name} #${n}`, category, kind: 'point', work: (f.mod === 'RE') ? 're' : 'install', x: f.x, y: f.y,
    installPay: pay ? [{ payItemId: pay.id, billAtStep: 4 }] : [], demoPay: [], installStep: 0, demoStep: 0,
    ...(pay ? {} : { note: 'No bid line matched this symbol. Office: link a pay item in Setup.' }),
  };
});
const item = n => payItems.find(p => p.itemNo === String(n));
const link = n => { const p = item(n); return p ? [{ payItemId: p.id, billAtStep: 4 }] : []; };
const partBase = (id, zoneId, label, category, kind, extra) => ({ id, jobId: J, zoneId, label, category, kind, work: 'install', installPay: [], demoPay: [], installStep: 0, demoStep: 0, ...extra });
const PLAZA_ITEM = { 2: 49, 3: 50, 4: 51, 6: 52, 8: 53, 12: 54, 14: 55 };
const cnt = {};
const bump = k => (cnt[k] = (cnt[k] ?? 0) + 1);
for (const it of circ.items) {
  const zoneId = `z_pns_e2${it.sheet.slice(2)}`, sheetId = `sh_pns_${it.sheet.toLowerCase()}`;
  const pos = { x: it.x, y: it.y, sheetId };
  if (it.kind === 'plaza') {
    const n = bump(`${it.sheet}|plaza`);
    const label = `${it.id ?? 'Plaza'}${it.size ? ` ${it.size} can plaza` : ' plaza'}`;
    const pay = it.size ? link(PLAZA_ITEM[it.size]) : [];
    parts.push(partBase(`pt_pns_${it.sheet.toLowerCase()}_plaza_${n}`, zoneId, label, 'can', 'point', { ...pos, installPay: pay, ...(pay.length ? {} : { note: it.size ? 'No bid line for this plaza size.' : 'Plaza size not read off the sheet. Office: set the pay item.' }) }));
  } else if (it.kind === 'can') {
    const n = bump(`${it.sheet}|can`);
    parts.push(partBase(`pt_pns_${it.sheet.toLowerCase()}_can_${n}`, zoneId, `L-867D junction can #${n}`, 'can', 'point', { ...pos, installPay: link(48) }));
  } else if (it.kind === 'arrestor') {
    const n = bump(`${it.sheet}|la`);
    parts.push(partBase(`pt_pns_${it.sheet.toLowerCase()}_la_${n}`, zoneId, `Lightning arrestor #${n}`, 'equipment', 'point', { ...pos, installPay: link(29), note: 'One diamond on the plan. The circuit list beside it may mean more than one arrestor.' }));
  }
}
const DEB = { 1: 35, 2: 36, 4: 37, 6: 38, 12: 39, 14: 40 }, CE = { 1: 41, 2: 42, 3: 43, 4: 44, 6: 45, 8: 46 };
for (const r of circ.runs) {
  const zoneId = `z_pns_e2${r.sheet.slice(2)}`, sheetId = `sh_pns_${r.sheet.toLowerCase()}`;
  const n = bump(`${r.sheet}|run`);
  const ways = r.size ? parseInt(r.size, 10) : null;
  const itemNo = r.cls === 'bank' ? (ways ? DEB[ways] : null) : (ways ? CE[ways] : 41);
  const what = r.cls === 'bank' ? `${r.size ?? '?W'} duct bank` : `${r.size ?? '1W'} conduit`;
  const pay = itemNo ? link(itemNo) : [];
  parts.push(partBase(`pt_pns_${r.sheet.toLowerCase()}_run_${n}`, zoneId, `${what} run #${n}, ${r.ft} ft`, 'duct', 'linear', { x: r.x, y: r.y, sheetId, path: r.path.map(([x, y]) => ({ x, y })), totalQty: r.ft, qtyDone: 0, installPay: pay, ...(pay.length ? {} : { note: 'Duct size not read off the sheet. Office: set the pay item.' }) }));
}
// site wide items with no spot on the plan: the foreman logs footage or checks them off from the list
const site = [
  ['cable', 'L-824 #8 5kV cable, 120,000 LF', 'cable', 'linear', 26, 120000], ['cpoise', '#2 counterpoise, 55,700 LF', 'cable', 'linear', 27, 55700],
  ['grod', 'Ground rods, 900 LF', 'cable', 'linear', 28, 900], ['wind', 'L-806 wind cone', 'pole', 'point', null, null],
  ['rgl1', 'L-804 runway guard light #1', 'fixture', 'point', 56, null], ['rgl2', 'L-804 runway guard light #2', 'fixture', 'point', 56, null],
  ['dw1', 'Base can drain well #1', 'can', 'point', 47, null], ['dw2', 'Base can drain well #2', 'can', 'point', 47, null], ['dw3', 'Base can drain well #3', 'can', 'point', 47, null], ['dw4', 'Base can drain well #4', 'can', 'point', 47, null],
];
for (const [id, label, category, kind, itemNo, lf] of site) parts.push(partBase(`pt_pns_site_${id}`, 'z_pns_site', label, category, kind, { installPay: itemNo ? link(itemNo) : [], ...(lf ? { totalQty: lf, qtyDone: 0 } : {}), ...(itemNo ? {} : { note: 'No bid line matched. Office: link a pay item.' }), note2: undefined }));
// vault: the two regulators sit in the CCR room on E702, the lump sums bill by percent on the Billing screen
parts.push(partBase('pt_pns_vault_ccr1', 'z_pns_vault', '10 kW L-829 regulator', 'regulator', 'point', { x: 36.5, y: 22, sheetId: 'sh_pns_e702', installPay: link(33) }));
parts.push(partBase('pt_pns_vault_ccr2', 'z_pns_vault', '15 kW L-829 regulator', 'regulator', 'point', { x: 41, y: 22, sheetId: 'sh_pns_e702', installPay: link(34) }));
for (const [id, label, n] of [['mods', 'Vault modifications (lump sum)', 32], ['ctl', 'Lighting control system, contractor (lump sum)', 31], ['vendor', 'Lighting control system, vendor (allowance)', 30], ['arc', 'Arc flash and coordination study (lump sum)', 24], ['flight', 'FAA flight check (allowance)', 25], ['temp', 'Temporary power and lighting (lump sum)', 22]]) {
  parts.push(partBase(`pt_pns_vault_${id}`, 'z_pns_vault', label, 'equipment', 'point', { note: `Bid item ${n}. Billed by percent complete on the Billing screen, not by this part.` }));
}
for (const p of parts) delete p.note2;
const data = {
  job: { id: J, name: 'Pensacola RW 8-26 Rehabilitation', customer: 'City of Pensacola, Bid 25-029', airport: 'Pensacola International', contractNo: '25-029', billingList: 'owner' },
  phases, sheets, zones, payItems, parts, crew: [], equipment,
};
writeFileSync('src/data/pensacola.json', JSON.stringify(data, null, 1));
const byCat = {}; for (const p of parts) byCat[p.category] = (byCat[p.category] ?? 0) + 1;
console.log(`pensacola: ${sheets.length} sheets, ${zones.length} zones, ${payItems.length} pay items, ${parts.length} parts (${parts.filter(p => !p.installPay.length).length} without a pay line)`, byCat);
