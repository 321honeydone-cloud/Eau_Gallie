import type { DailyReport, Zone, Part, Flag, PayItem, Equipment, CrewBucket } from '../types';
import { carryover, delayLines, fmtTime, generalStatus, workLines, type PartDay } from './report';

export interface ReportContext {
  report: DailyReport;
  zones: Zone[];
  parts: Part[];
  touched: PartDay[];
  flags: Flag[];
  payItems: PayItem[];
  equipment: Equipment[];
  photoCount: number;
}

export interface Section { num: string; title: string; eg: string; text: string }

function bucketText(name: string, b: CrewBucket): string {
  if (!b.names.length) return '';
  return `${name}\n${b.names.join('\n')}\nWork Shift: ${fmtTime(b.shiftStart)} to ${fmtTime(b.shiftEnd)}\nLunch Break: ${b.lunchMinutes} Minutes`;
}

// Builds the six sections in the order the Autodesk form wants them.
export function buildSections(c: ReportContext): Section[] {
  const { report: r, zones } = c;
  const zname = (id: string) => zones.find(z => z.id === id)?.name ?? id;
  const wl = workLines(c.touched, zones);
  const carry = carryover(c.touched, c.flags, c.parts, zones);
  const carryOpen = carry.filter(i => !r.carryDone.includes(i.key));
  const lumps = c.payItems.filter(p => p.billingType === 'lumpsum');

  const s11 = [
    r.plannedZoneIds.length ? `Planned zones: ${r.plannedZoneIds.map(zname).join(', ')}` : '',
    r.plannedScope,
  ].filter(Boolean).join('\n');

  const s12 = [
    ...wl.map(w => `${w.zone.name}\n${w.lines.map(l => `  ${l}`).join('\n')}`),
    ...r.yardWork.map(y => `Yard and other: ${y.category}${y.qty ? `, ${y.qty}` : ''}${y.note ? `. ${y.note}` : ''}`),
    ...lumps.filter(l => (l.percentComplete ?? 0) > 0).map(l => `${l.description}: ${l.percentComplete}% complete`),
    c.photoCount ? `Photos attached: ${c.photoCount}` : '',
    r.workNote,
  ].filter(Boolean).join('\n');

  const s13 = [
    ...carryOpen.map(i => `${i.zoneName ? i.zoneName + ', ' : ''}${i.text}`),
    r.carryNote,
  ].filter(Boolean).join('\n');

  const s14 = [...delayLines(c.flags, c.parts, zones), r.delayNote].filter(Boolean).join('\n\n');

  const s15 = [
    r.nextZoneIds.length ? `Next zones: ${r.nextZoneIds.map(zname).join(', ')}` : '',
    ...carryOpen.map(i => `Carry over: ${i.text}`),
    r.actionPlan,
  ].filter(Boolean).join('\n');

  const eq = c.equipment.filter(e => r.equipmentIds.includes(e.id)).map(e => e.name + (e.unitNo ? ` #${e.unitNo}` : ''));
  const s16 = [
    bucketText('Internal Personnel', r.crew.internal),
    bucketText('Subcontractor Personnel', r.crew.sub),
    bucketText('Temporary Personnel', r.crew.temp),
    eq.length ? `Equipment: ${eq.join(', ')}` : '',
    r.weather.length ? `Weather: ${r.weather.join(', ')}${r.tempF ? `, ${r.tempF}F` : ''}` : '',
    r.safety.length ? `Safety: ${r.safety.join(', ')}` : '',
    r.visitors.length ? `Visitors: ${r.visitors.join(', ')}` : '',
    'General Status\n' + generalStatus(c.touched, c.flags, c.parts, zones, lumps).join('\n'),
    r.executiveComment ? `Executive Comment\n${r.executiveComment}` : '',
  ].filter(Boolean).join('\n\n');

  return [
    { num: '1.1', title: 'Planned Scope of Work for Today', eg: 'Work type, area, planned qty, crew assigned', text: s11 },
    { num: '1.2', title: 'Work Executed', eg: 'Work type, area, installed qty, percent complete', text: s12 },
    { num: '1.3', title: 'Outstanding / Carryover Work', eg: 'Pending work, reason, impact level', text: s13 },
    { num: '1.4', title: 'Delays and Issues', eg: 'Delay type, responsible party, schedule impact', text: s14 },
    { num: '1.5', title: 'Action Plan and Projection', eg: 'Recovery needed, action type, expected timeline', text: s15 },
    { num: '1.6', title: 'Crew and Production Summary', eg: 'Crew size, hours, production', text: s16 },
  ];
}

export function fullText(c: ReportContext, jobName: string, dateNice: string): string {
  const head = `DAILY FIELD REPORT\n${jobName}\n${dateNice}\nForeman: ${c.report.foremen.join(', ')}`;
  return head + '\n\n' + buildSections(c).map(s => `${s.num} ${s.title}\n${s.text || '(nothing)'}`).join('\n\n');
}
