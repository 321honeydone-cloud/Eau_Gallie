import { db, uid } from '../db';
import type { Job, Phase, Sheet, Zone, PayItem, Part, Equipment, StoredFile } from '../types';

// Moves a whole job definition between devices as one file until sync exists.
// Sheets go in as base64 JPEGs. Status, flags, reports and photos stay put.
interface JobFile {
  version: 1;
  job: Job; phases: Phase[]; sheets: (Omit<Sheet, 'blob'> & { blobB64?: string; blobType?: string })[];
  zones: Zone[]; payItems: PayItem[]; parts: Part[]; equipment: Equipment[];
  files?: (Omit<StoredFile, 'blob'> & { blobB64: string; blobType: string })[];
}

const toB64 = (b: Blob) => new Promise<string>(res => { const r = new FileReader(); r.onload = () => res((r.result as string).split(',')[1]); r.readAsDataURL(b); });
const fromB64 = (s: string, type: string) => { const bin = atob(s); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new Blob([arr], { type }); };

export async function exportJob(jobId: string): Promise<Blob> {
  const job = (await db.jobs.get(jobId))!;
  const sheets = await db.sheets.where('jobId').equals(jobId).toArray();
  const f: JobFile = {
    version: 1, job,
    phases: await db.phases.where('jobId').equals(jobId).toArray(),
    sheets: await Promise.all(sheets.map(async s => { const { blob, ...rest } = s; return blob ? { ...rest, blobB64: await toB64(blob), blobType: blob.type } : rest; })),
    zones: await db.zones.where('jobId').equals(jobId).toArray(),
    payItems: await db.payItems.where('jobId').equals(jobId).toArray(),
    parts: await db.parts.where('jobId').equals(jobId).toArray(),
    equipment: await db.equipment.where('jobId').equals(jobId).toArray(),
    files: await Promise.all((await db.files.where('jobId').equals(jobId).toArray()).map(async f => { const { blob, ...rest } = f; return { ...rest, blobB64: await toB64(blob), blobType: blob.type }; })),
  };
  return new Blob([JSON.stringify(f)], { type: 'application/json' });
}

// Imports as a new copy if the job id already exists here, so nothing gets clobbered.
export async function importJob(file: File): Promise<Job> {
  const f = JSON.parse(await file.text()) as JobFile;
  if (f.version !== 1) throw new Error('Unknown job file version');
  const exists = await db.jobs.get(f.job.id);
  const map = new Map<string, string>();
  const re = (id: string) => { if (!exists) return id; if (!map.has(id)) map.set(id, uid()); return map.get(id)!; };
  const job: Job = { ...f.job, id: re(f.job.id), name: exists ? f.job.name + ' (imported)' : f.job.name };
  const sheets: Sheet[] = f.sheets.map(s => { const { blobB64, blobType, ...rest } = s; return { ...rest, id: re(s.id), jobId: job.id, pdfFileId: s.pdfFileId ? re(s.pdfFileId) : undefined, blob: blobB64 ? fromB64(blobB64, blobType ?? 'image/jpeg') : undefined }; });
  const files: StoredFile[] = (f.files ?? []).map(x => { const { blobB64, blobType, ...rest } = x; return { ...rest, id: re(x.id), jobId: job.id, blob: fromB64(blobB64, blobType || 'application/pdf') }; });
  await db.transaction('rw', [db.jobs, db.phases, db.sheets, db.zones, db.payItems, db.parts, db.equipment, db.files], async () => {
    await db.jobs.put(job);
    await db.files.bulkPut(files);
    await db.phases.bulkPut(f.phases.map(p => ({ ...p, id: re(p.id), jobId: job.id })));
    await db.sheets.bulkPut(sheets);
    await db.zones.bulkPut(f.zones.map(z => ({ ...z, id: re(z.id), jobId: job.id, phaseId: re(z.phaseId), overviewSheetId: re(z.overviewSheetId), detailSheetId: re(z.detailSheetId) })));
    await db.payItems.bulkPut(f.payItems.map(p => ({ ...p, id: re(p.id), jobId: job.id })));
    await db.parts.bulkPut(f.parts.map(p => ({ ...p, id: re(p.id), jobId: job.id, zoneId: re(p.zoneId), installPay: p.installPay.map(l => ({ ...l, payItemId: re(l.payItemId) })), demoPay: p.demoPay.map(l => ({ ...l, payItemId: re(l.payItemId) })) })));
    await db.equipment.bulkPut(f.equipment.map(e => ({ ...e, id: re(e.id), jobId: job.id })));
  });
  return job;
}

export async function deleteJob(jobId: string): Promise<void> {
  await db.transaction('rw', [db.jobs, db.phases, db.sheets, db.zones, db.payItems, db.parts, db.equipment, db.events, db.flags, db.photos, db.reports, db.files], async () => {
    for (const t of [db.phases, db.sheets, db.zones, db.payItems, db.parts, db.equipment, db.events, db.flags, db.photos, db.reports, db.files]) await t.where('jobId').equals(jobId).delete();
    await db.jobs.delete(jobId);
    await db.tombstones.put({ id: `jobs:${jobId}`, tbl: 'jobs', rowId: jobId, jobId });
  });
}
