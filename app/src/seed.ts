import { db, setApplyingRemote } from './db';
import placeholder from './data/placeholder.json';
import type { Job, Phase, Sheet, Zone, PayItem, Part, CrewMember, Equipment } from './types';

// First run: load the placeholder airfield so there is something to tap on.
export async function seedIfEmpty(): Promise<void> {
  const count = await db.jobs.count();
  if (count > 0) return;
  const d = placeholder as unknown as {
    job: Job; phases: Phase[]; sheets: Sheet[]; zones: Zone[]; payItems: PayItem[];
    parts: Part[]; crew: CrewMember[]; equipment: Equipment[];
  };
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
    await db.crew.bulkAdd(old(d.crew));
    await db.equipment.bulkAdd(old(d.equipment));
    await db.settings.put({ key: 'jobId', value: d.job.id });
  });
  } finally { setApplyingRemote(false); }
}
