import { db } from '../db';
import type { CrewBucket, DailyReport, Part, StatusEvent, Flag, Zone, Step } from '../types';
import { currentStep, activeLadder, stepName, hasLadder } from './status';

export const WEATHER = ['Sunny', 'Cloudy', 'Rain', 'Windy', 'Hot', 'Lightning hold', 'Fog'];
export const SAFETY = ['Toolbox talk held', 'No incidents', 'Near miss', 'First aid', 'Incident, see note'];
export const VISITORS = ['None', 'Inspector', 'Owner rep', 'GC', 'FAA', 'Airport ops', 'Other'];
export const YARD = ['Prefab', 'Vehicle inspection', 'Coordination', 'Material staging', 'Deliveries', 'Cleanup', 'Other'];
export const SHIFT_STARTS = ['05:30', '06:00', '06:30', '07:00', '08:00'];
export const SHIFT_ENDS = ['14:30', '15:00', '15:30', '17:00', '18:00', '18:30', '19:00'];
export const PERCENTS = [0, 10, 25, 50, 75, 90, 100];

const bucket = (start: string, end: string): CrewBucket => ({ names: [], shiftStart: start, shiftEnd: end, lunchMinutes: 30 });

export function reportId(jobId: string, date: string) { return `${jobId}_${date}`; }

export async function getOrCreateReport(jobId: string, date: string, foreman: string): Promise<DailyReport> {
  const id = reportId(jobId, date);
  const existing = await db.reports.get(id);
  if (existing) {
    if (foreman && !existing.foremen.includes(foreman)) {
      const foremen = [...existing.foremen, foreman];
      const internal = existing.crew.internal.names.includes(foreman) ? existing.crew.internal : { ...existing.crew.internal, names: [...existing.crew.internal.names, foreman] };
      await db.reports.update(id, { foremen, crew: { ...existing.crew, internal } });
      return { ...existing, foremen, crew: { ...existing.crew, internal } };
    }
    return existing;
  }
  // yesterday's action plan becomes today's planned scope
  const prev = await db.reports.where('jobId').equals(jobId).filter(r => r.date < date).sortBy('date');
  const last = prev[prev.length - 1];
  const r: DailyReport = {
    id, jobId, date,
    foremen: foreman ? [foreman] : [],
    crew: { internal: { ...bucket('06:00', '18:30'), names: foreman ? [foreman] : [] }, sub: bucket('06:30', '15:00'), temp: bucket('06:30', '18:30') },
    equipmentIds: [],
    weather: [], safety: [], visitors: [],
    plannedScope: last?.actionPlan ?? '',
    plannedZoneIds: last?.nextZoneIds ?? [],
    actionPlan: '', nextZoneIds: [], carryDone: [],
    workNote: '', carryNote: '', delayNote: '',
    yardWork: [], executiveComment: '',
  };
  await db.reports.add(r);
  return r;
}

export function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
}

// ---------- derived views of the day ----------

export interface PartDay {
  part: Part;
  ladder: 'install' | 'demo';
  fromStep: Step;      // first event of the day
  toStep: Step;        // last event of the day
  qtyDone?: number;
}

// One line per part touched today, with where it started and ended.
export function partsTouched(events: StatusEvent[], partsById: Map<string, Part>): PartDay[] {
  const map = new Map<string, PartDay>();
  const sorted = [...events].sort((a, b) => a.createdAt - b.createdAt);
  for (const e of sorted) {
    const part = partsById.get(e.partId); if (!part) continue;
    const key = `${e.partId}:${e.ladder}`;
    const cur = map.get(key);
    if (!cur) map.set(key, { part, ladder: e.ladder, fromStep: e.fromStep, toStep: e.toStep, qtyDone: e.qtyDone });
    else { cur.toStep = e.toStep; if (e.qtyDone !== undefined) cur.qtyDone = e.qtyDone; }
  }
  return [...map.values()];
}

export const CAT_WORD: Record<string, [string, string]> = {
  fixture: ['light', 'lights'], sign: ['sign', 'signs'], can: ['base can', 'base cans'], conduit: ['conduit run', 'conduit runs'],
  duct: ['duct bank', 'duct banks'], cable: ['cable run', 'cable runs'], handhole: ['handhole', 'handholes'], manhole: ['manhole', 'manholes'],
  regulator: ['regulator', 'regulators'], equipment: ['equipment', 'equipment'], pole: ['pole', 'poles'],
};
export const plural = (cat: string, n: number) => (CAT_WORD[cat] ?? [cat, cat + 's'])[n === 1 ? 0 : 1];

// Group touched parts by zone, then by category and end step, into readable lines.
export function workLines(touched: PartDay[], zones: Zone[]): { zone: Zone; lines: string[] }[] {
  const out: { zone: Zone; lines: string[] }[] = [];
  for (const zone of zones) {
    const mine = touched.filter(t => t.part.zoneId === zone.id);
    if (!mine.length) continue;
    const lines: string[] = [];
    const groups = new Map<string, PartDay[]>();
    for (const t of mine) {
      const k = `${t.ladder}|${t.part.category}|${t.toStep}`;
      groups.set(k, [...(groups.get(k) ?? []), t]);
    }
    for (const [k, items] of groups) {
      const [ladder, cat, step] = k.split('|');
      const s = Number(step) as Step;
      const linear = items[0].part.kind === 'linear';
      if (linear) {
        for (const t of items) {
          lines.push(`${ladder === 'demo' ? 'Demo, ' : ''}${t.part.label}: ${t.qtyDone ?? 0} of ${t.part.totalQty} LF ${stepName(s)}`);
        }
      } else {
        const labels = items.map(t => t.part.label.replace(' (RE)', '')).join(', ');
        lines.push(`${ladder === 'demo' ? 'Demo, ' : ''}${items.length} ${plural(cat, items.length)} ${stepName(s)}: ${labels}`);
      }
    }
    out.push({ zone, lines });
  }
  return out;
}

export interface CarryItem { key: string; text: string; zoneName: string }

// Anything touched today that isn't Complete, plus anything flagged.
export function carryover(touched: PartDay[], flags: Flag[], parts: Part[], zones: Zone[]): CarryItem[] {
  const zname = (id: string) => zones.find(z => z.id === id)?.name ?? '';
  const items: CarryItem[] = [];
  const seen = new Set<string>();
  for (const t of touched) {
    const p = t.part;
    const step = currentStep(p, t.ladder);
    if (step >= 4) continue;
    const linear = p.kind === 'linear';
    const rest = linear ? `${(p.totalQty ?? 0) - (p.qtyDone ?? 0)} LF left, at ${stepName(step)}` : `at ${stepName(step)}, needs ${stepName((step + 1) as Step)}`;
    items.push({ key: `p:${p.id}:${t.ladder}`, text: `${t.ladder === 'demo' ? 'Demo ' : ''}${p.label}: ${rest}`, zoneName: zname(p.zoneId) });
    seen.add(p.id);
  }
  for (const f of flags) {
    const p = f.partId ? parts.find(x => x.id === f.partId) : undefined;
    if (p && seen.has(p.id)) continue;
    items.push({ key: `f:${f.id}`, text: `${p ? p.label : 'Zone'}: ${f.reason} (${f.party})`, zoneName: zname(p?.zoneId ?? f.zoneId ?? '') });
  }
  return items;
}

export function delayLines(flags: Flag[], parts: Part[], zones: Zone[]): string[] {
  const zname = (id: string) => zones.find(z => z.id === id)?.name ?? '';
  return flags.map(f => {
    const p = f.partId ? parts.find(x => x.id === f.partId) : undefined;
    const where = p ? `${zname(p.zoneId)}, ${p.label}` : zname(f.zoneId ?? '');
    return `${where}: ${f.reason}${f.note ? `. ${f.note}` : ''}\n  Responsible: ${f.party}\n  Schedule impact: ${f.impact}`;
  });
}

// General status checklist, the ☑ ⚠ ⏳ list at the bottom of 1.6.
export function generalStatus(touched: PartDay[], flags: Flag[], parts: Part[], zones: Zone[], lumps: { description: string; percentComplete?: number }[]): string[] {
  const out: string[] = [];
  for (const zone of zones) {
    const mine = touched.filter(t => t.part.zoneId === zone.id);
    if (!mine.length) continue;
    const done = mine.filter(t => t.toStep === 4).length;
    const moving = mine.length - done;
    out.push(`☑ ${zone.name}: ${done} complete${moving ? `, ${moving} in progress` : ''}`);
  }
  for (const f of flags) {
    const p = f.partId ? parts.find(x => x.id === f.partId) : undefined;
    out.push(`⚠ ${p?.label ?? 'Zone'}: ${f.reason}, ${f.impact}`);
  }
  for (const zone of zones) {
    const zp = parts.filter(p => p.zoneId === zone.id);
    const open = zp.filter(p => (hasLadder(p, 'install') && p.installStep < 4) || (hasLadder(p, 'demo') && p.demoStep < 4)).length;
    if (zp.length && open === 0) out.push(`☑ ${zone.name} 100% complete`);
  }
  for (const l of lumps) if ((l.percentComplete ?? 0) > 0) out.push(`${l.percentComplete === 100 ? '☑' : '⏳'} ${l.description}: ${l.percentComplete}%`);
  return out;
}

export function activeLadderName(p: Part) { return activeLadder(p); }
