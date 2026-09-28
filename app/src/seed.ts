import { db, setApplyingRemote } from './db';
import placeholder from './data/placeholder.json';
import pensacola from './data/pensacola.json';
import type { Job, Phase, Sheet, Zone, PayItem, Part, CrewMember, Equipment } from './types';

// First run: load the placeholder airfield so there is something to tap on.
type SeedFile = { job: Job; phases: Phase[]; sheets: Sheet[]; zones: Zone[]; payItems: PayItem[]; parts: Part[]; crew: CrewMember[]; equipment: Equipment[] };

export async function seedIfEmpty(): Promise<void> {
  const count = await db.jobs.count();
  if (count > 0) { await seedMissing(); return; }
  await seedOne(placeholder as unknown as SeedFile);
  await seedOne(pensacola as unknown as SeedFile);
  let active = (pensacola as unknown as SeedFile).job.id;
  try { const want = localStorage.getItem('ege.activeJob'); if (want) active = want; } catch { /* no storage */ }
  await db.settings.put({ key: 'jobId', value: active });
}

// A tablet that already has the placeholder gets the real job added on the next load.
async function seedMissing(): Promise<void> {
  const d = pensacola as unknown as SeedFile;
  if (await db.jobs.get(d.job.id)) {
    // tablets that got the job before the vector layer existed pick up the PDF links
    setApplyingRemote(true);
    try {
      for (const sh of d.sheets) { const cur = await db.sheets.get(sh.id); if (cur && !cur.pdfSrc && sh.pdfSrc) await db.sheets.update(sh.id, { pdfSrc: sh.pdfSrc, pdfPage: sh.pdfPage }); }
      // tablets that got the job before the symbol finder ran pick up the auto-placed pins
      if (d.parts.length && (await db.parts.where('jobId').equals(d.job.id).count()) === 0) {
        await db.parts.bulkAdd(d.parts.map(r => ({ ...r, updatedAt: 1, _dirty: 1 })));
      }
    }
    finally { setApplyingRemote(false); }
    return;
  }
  await seedOne(d);
  await db.settings.put({ key: 'jobId', value: d.job.id });
}

async function seedOne(d: SeedFile): Promise<void> {
  // Seed rows carry an ancient stamp so anything a foreman actually does outranks them on sync,
  // even when a second tablet seeds the same placeholder a week later.
  const old = <T extends object>(rows: T[]) => rows.map(r => ({ ...r, updatedAt: 1, _dirty: 1 }));
  setApplyingRemote(true);
  try {
  await db.transaction('rw', [db.jobs, db.phases, db.sheets, db.zones, db.payItems, db.parts, db.crew, db.equipment, db.settings], async () => {
    await db.jobs.add({ ...d.job, updatedAt: 1, _dirty: 1 });
    await db.phases.bulkAdd(old(d.phases));
    await db.sheets.bulkAdd(old(d.sheets));
    await db.zones.bulkAdd(old(d.zones));
    await db.payItems.bulkAdd(old(d.payItems));
    await db.parts.bulkAdd(old(d.parts));
    await db.equipment.bulkAdd(old(d.equipment));
    for (const c of old(d.crew)) if (!(await db.crew.get(c.id))) await db.crew.add(c);
  });
  } finally { setApplyingRemote(false); }
}
