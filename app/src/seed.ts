import { db } from './db';
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
  await db.transaction('rw', [db.jobs, db.phases, db.sheets, db.zones, db.payItems, db.parts, db.crew, db.equipment, db.settings], async () => {
    await db.jobs.add(d.job);
    await db.phases.bulkAdd(d.phases);
    await db.sheets.bulkAdd(d.sheets);
    await db.zones.bulkAdd(d.zones);
    await db.payItems.bulkAdd(d.payItems);
    await db.parts.bulkAdd(d.parts);
    await db.crew.bulkAdd(d.crew);
    await db.equipment.bulkAdd(d.equipment);
    await db.settings.put({ key: 'jobId', value: d.job.id });
  });
}
