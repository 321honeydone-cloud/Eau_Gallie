import { db, uid } from '../db';
import type { BillingRollup, Part, PayItem, RollupLine, StatusEvent } from '../types';

// Unit price billing off the event log.
// A part bills a pay item the first time it crosses that link's billAtStep.
// Linear parts bill the footage added while at or past billAtStep.
// A move back below billAtStep after it was billed makes a credit.
// Events already pulled into a locked rollup are skipped, so nothing bills twice.

export interface Charge { event: StatusEvent; part: Part; payItemId: string; qty: number; label: string }

export function computeCharges(parts: Part[], events: StatusEvent[]): Charge[] {
  const byPart = new Map<string, StatusEvent[]>();
  for (const e of [...events].sort((a, b) => a.createdAt - b.createdAt)) byPart.set(e.partId, [...(byPart.get(e.partId) ?? []), e]);
  const out: Charge[] = [];
  for (const part of parts) {
    const evs = byPart.get(part.id) ?? [];
    for (const ladder of ['install', 'demo'] as const) {
      const links = ladder === 'install' ? part.installPay : part.demoPay;
      const mine = evs.filter(e => e.ladder === ladder);
      for (const link of links) {
        if (part.kind === 'linear') {
          // footage: bill the increase in qtyDone recorded at or past the bill step
          let billedQty = 0;
          for (const e of mine) {
            if (e.toStep >= link.billAtStep && e.qtyDone !== undefined) {
              const delta = e.qtyDone - billedQty;
              if (delta !== 0) { out.push({ event: e, part, payItemId: link.payItemId, qty: delta, label: `${part.label} ${delta > 0 ? '+' : ''}${delta} LF` }); billedQty = e.qtyDone; }
            } else if (e.toStep < link.billAtStep && e.fromStep >= link.billAtStep && billedQty > 0) {
              out.push({ event: e, part, payItemId: link.payItemId, qty: -billedQty, label: `${part.label} credit ${billedQty} LF` }); billedQty = 0;
            }
          }
        } else {
          let crossed = false;
          for (const e of mine) {
            if (!crossed && e.fromStep < link.billAtStep && e.toStep >= link.billAtStep) { out.push({ event: e, part, payItemId: link.payItemId, qty: 1, label: part.label }); crossed = true; }
            else if (crossed && e.fromStep >= link.billAtStep && e.toStep < link.billAtStep) { out.push({ event: e, part, payItemId: link.payItemId, qty: -1, label: `${part.label} credit` }); crossed = false; }
          }
        }
      }
    }
  }
  return out;
}

export interface RollupPreview { lines: RollupLine[]; total: number; eventIds: string[]; lumpBilled: Record<string, number> }

export async function previewRollup(jobId: string, dateFrom: string, dateTo: string): Promise<RollupPreview> {
  const [parts, events, payItems, prior] = await Promise.all([
    db.parts.where('jobId').equals(jobId).toArray(),
    db.events.where('jobId').equals(jobId).toArray(),
    db.payItems.where('jobId').equals(jobId).toArray(),
    db.rollups.where('jobId').equals(jobId).toArray(),
  ]);
  const charges = computeCharges(parts, events);
  const inWindow = (e: StatusEvent) => e.reportDate >= dateFrom && e.reportDate <= dateTo;
  const toDate = new Map<string, number>();
  for (const c of charges) if (c.event.billedIn) toDate.set(c.payItemId, (toDate.get(c.payItemId) ?? 0) + c.qty);
  const open = charges.filter(c => !c.event.billedIn && inWindow(c.event));
  const lumpPrev: Record<string, number> = {};
  for (const r of prior) for (const [k, v] of Object.entries(r.lumpBilled)) lumpPrev[k] = Math.max(lumpPrev[k] ?? 0, v);
  const lines: RollupLine[] = [];
  const lumpBilled: Record<string, number> = { ...lumpPrev };
  for (const pi of [...payItems].sort((a, b) => a.itemNo.localeCompare(b.itemNo, undefined, { numeric: true }))) {
    if (pi.billingType === 'unit') {
      const mine = open.filter(c => c.payItemId === pi.id);
      const qty = mine.reduce((s, c) => s + c.qty, 0);
      if (!mine.length) continue;
      lines.push(line(pi, qty, qty * pi.unitPrice, (toDate.get(pi.id) ?? 0) + qty, mine.map(c => c.label)));
    } else if (pi.billingType === 'lumpsum') {
      const now = pi.percentComplete ?? 0, prev = lumpPrev[pi.id] ?? 0;
      if (now === prev) continue;
      const pts = now - prev;
      lines.push(line(pi, pts, (pts / 100) * pi.unitPrice, now, [`${prev}% to ${now}%`]));
      lumpBilled[pi.id] = now;
    }
  }
  return { lines, total: lines.reduce((s, l) => s + l.amount, 0), eventIds: [...new Set(open.map(c => c.event.id))], lumpBilled };
}

function line(pi: PayItem, qty: number, amount: number, toDateQty: number, detail: string[]): RollupLine {
  return { payItemId: pi.id, itemNo: pi.itemNo, subItemNo: pi.subItemNo, specRef: pi.specRef, description: pi.description, unit: pi.unit, billingType: pi.billingType, unitPrice: pi.unitPrice, bidQty: pi.bidQty, qty, amount: Math.round(amount * 100) / 100, toDateQty, detail };
}

export async function lockRollup(jobId: string, dateFrom: string, dateTo: string, createdBy: string): Promise<BillingRollup> {
  const p = await previewRollup(jobId, dateFrom, dateTo);
  const n = (await db.rollups.where('jobId').equals(jobId).count()) + 1;
  const r: BillingRollup = { id: uid('ru'), jobId, number: n, dateFrom, dateTo, createdAt: Date.now(), createdBy, lines: p.lines, total: Math.round(p.total * 100) / 100, lumpBilled: p.lumpBilled };
  await db.transaction('rw', db.rollups, db.events, async () => {
    await db.rollups.add(r);
    for (const id of p.eventIds) await db.events.update(id, { billedIn: r.id });
  });
  return r;
}

export function rollupCsv(r: BillingRollup): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Item', 'Sub Item', 'Spec', 'Description', 'Unit', 'Bid Qty', 'This Period Qty', 'Unit Price', 'This Period Amount', 'To Date Qty', 'Detail'];
  const rows = r.lines.map(l => [l.itemNo, l.subItemNo, l.specRef, l.description, l.unit, l.bidQty, l.qty, l.unitPrice, l.amount, l.toDateQty, l.detail.join('; ')].map(esc).join(','));
  return [head.map(esc).join(','), ...rows, ['', '', '', 'TOTAL', '', '', '', '', r.total, '', ''].map(esc).join(',')].join('\n');
}

export const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
