// Builds the Pensacola Runway 8-26 job from the rendered sheets and the bid schedule.
// Zones are one per lighting layout sheet, boxed on the C-6 overall plan. Pins get placed in Setup.
import { readFileSync, writeFileSync } from 'node:fs';
import sizeOf from './image-size.mjs';
const J = 'job_pensacola_rw826';
const bid = JSON.parse(readFileSync('src/data/pensacola-bid-items.json', 'utf8'));
const sheetDefs = [
  ['c6-overall', 'C-6', 'Overall Plan (Drainage sheet used as the airfield map)', true],
  ['e201', 'E201', 'Airfield Lighting Layout Plan, Sheet 1 of 11'], ['e202', 'E202', 'Airfield Lighting Layout Plan, Sheet 2 of 11'],
  ['e203', 'E203', 'Airfield Lighting Layout Plan, Sheet 3 of 11'], ['e204', 'E204', 'Airfield Lighting Layout Plan, Sheet 4 of 11'],
  ['e205', 'E205', 'Airfield Lighting Layout Plan, Sheet 5 of 11'], ['e206', 'E206', 'Airfield Lighting Layout Plan, Sheet 6 of 11'],
  ['e207', 'E207', 'Airfield Lighting Layout Plan, Sheet 7 of 11'], ['e208', 'E208', 'Airfield Lighting Layout Plan, Sheet 8 of 11'],
  ['e209', 'E209', 'Airfield Lighting Layout Plan, Sheet 9 of 11'], ['e210', 'E210', 'Airfield Lighting Layout Plan, Sheet 10 of 11'],
  ['e211', 'E211', 'Airfield Lighting Layout Plan, Sheet 11 of 11'],
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
const zones = Object.entries(rects).map(([name, [x1, y1, x2, y2]]) => ({
  id: `z_pns_${name.toLowerCase()}`, jobId: J, phaseId: 'ph_pns_1', name: `${name} ${areas[name]}`,
  overviewSheetId: 'sh_pns_c6-overall', detailSheetId: `sh_pns_${name.toLowerCase()}`,
  shape: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].map(([x, y]) => ({ x: +(x * 100).toFixed(2), y: +(y * 100).toFixed(2) })),
}));
// bid schedule: electrical items only, unit prices left at 0 for the office to fill in
const fixUnit = it => (it.unit === 'LS' && it.qty > 1 ? 'EA' : it.unit || 'EA');
const payItems = bid.filter(it => /^(L-|SP-)/.test(it.specRef)).map(it => {
  const unit = fixUnit(it);
  return { id: `pi_pns_${it.itemNo}`, jobId: J, itemNo: it.itemNo, specRef: it.specRef, description: it.description.replace(/\s+/g, ' ').trim(), unit,
    billingType: unit === 'LS' ? 'lumpsum' : unit === 'AL' ? 'allowance' : 'unit', unitPrice: 0, bidQty: it.qty ?? 0, ...(unit === 'LS' ? { percentComplete: 0 } : {}) };
});
const equipment = ['Trencher', 'Mini excavator', 'Skid steer', 'Directional bore rig', 'Core drill', 'Saw cut rig', 'Concrete mixer', 'Bucket truck', 'Service truck', 'Van', 'Light tower'].map((name, i) => ({ id: `eq_pns_${i + 1}`, jobId: J, name }));
const data = {
  job: { id: J, name: 'Pensacola RW 8-26 Rehabilitation', customer: 'City of Pensacola, Bid 25-029', airport: 'Pensacola International', contractNo: '25-029', billingList: 'owner' },
  phases, sheets, zones, payItems, parts: [], crew: [], equipment,
};
writeFileSync('src/data/pensacola.json', JSON.stringify(data, null, 1));
console.log(`pensacola: ${sheets.length} sheets, ${zones.length} zones, ${payItems.length} pay items`);
