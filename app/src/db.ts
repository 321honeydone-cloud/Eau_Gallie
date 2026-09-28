import Dexie, { type EntityTable } from 'dexie';
import type {
  Job, Phase, Sheet, Zone, PayItem, Part, StatusEvent, Flag,
  CrewMember, Equipment, Photo, DailyReport, Setting,
} from './types';

export class FieldDB extends Dexie {
  jobs!: EntityTable<Job, 'id'>;
  phases!: EntityTable<Phase, 'id'>;
  sheets!: EntityTable<Sheet, 'id'>;
  zones!: EntityTable<Zone, 'id'>;
  payItems!: EntityTable<PayItem, 'id'>;
  parts!: EntityTable<Part, 'id'>;
  events!: EntityTable<StatusEvent, 'id'>;
  flags!: EntityTable<Flag, 'id'>;
  crew!: EntityTable<CrewMember, 'id'>;
  equipment!: EntityTable<Equipment, 'id'>;
  photos!: EntityTable<Photo, 'id'>;
  reports!: EntityTable<DailyReport, 'id'>;
  settings!: EntityTable<Setting, 'key'>;

  constructor() {
    super('eau-gallie-field');
    this.version(1).stores({
      jobs: 'id',
      phases: 'id, jobId',
      sheets: 'id, jobId',
      zones: 'id, jobId, phaseId',
      payItems: 'id, jobId',
      parts: 'id, jobId, zoneId',
      events: 'id, jobId, partId, reportDate, createdAt, [jobId+reportDate]',
      flags: 'id, jobId, partId, zoneId, closedAt',
      crew: 'id',
      equipment: 'id, jobId',
      photos: 'id, jobId, reportDate, partId, zoneId',
      reports: 'id, jobId, date',
      settings: 'key',
    });
  }
}

export const db = new FieldDB();

export function uid(prefix = ''): string {
  const r = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix ? `${prefix}_${r}` : r;
}

export function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export async function getSetting(key: string): Promise<string | undefined> {
  return (await db.settings.get(key))?.value;
}
export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}
