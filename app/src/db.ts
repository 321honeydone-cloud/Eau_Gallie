import Dexie, { type EntityTable } from 'dexie';
import type {
  Job, Phase, Sheet, Zone, PayItem, Part, StatusEvent, Flag,
  CrewMember, Equipment, Photo, DailyReport, Setting, BillingRollup, Tombstone, StoredFile,
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
  rollups!: EntityTable<BillingRollup, 'id'>;
  tombstones!: EntityTable<Tombstone, 'id'>;
  files!: EntityTable<StoredFile, 'id'>;

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
    this.version(2).stores({
      rollups: 'id, jobId, number',
    });
    this.version(3).stores({
      jobs: 'id, updatedAt',
      phases: 'id, jobId, updatedAt',
      sheets: 'id, jobId, updatedAt',
      zones: 'id, jobId, phaseId, updatedAt',
      payItems: 'id, jobId, updatedAt',
      parts: 'id, jobId, zoneId, updatedAt',
      events: 'id, jobId, partId, reportDate, createdAt, updatedAt, [jobId+reportDate]',
      flags: 'id, jobId, partId, zoneId, closedAt, updatedAt',
      crew: 'id, updatedAt',
      equipment: 'id, jobId, updatedAt',
      photos: 'id, jobId, reportDate, partId, zoneId, updatedAt',
      reports: 'id, jobId, date, updatedAt',
      rollups: 'id, jobId, number, updatedAt',
      tombstones: 'id, tbl, jobId, updatedAt',
    }).upgrade(async tx => {
      // rows written before sync existed get a stamp so they push
      const now = Date.now();
      for (const t of SYNCED) if (t !== 'tombstones') await tx.table(t).toCollection().modify((r: { updatedAt?: number }) => { if (!r.updatedAt) r.updatedAt = now; });
    });
    this.version(4).stores({
      jobs: 'id, updatedAt, _dirty',
      phases: 'id, jobId, updatedAt, _dirty',
      sheets: 'id, jobId, updatedAt, _dirty',
      zones: 'id, jobId, phaseId, updatedAt, _dirty',
      payItems: 'id, jobId, updatedAt, _dirty',
      parts: 'id, jobId, zoneId, updatedAt, _dirty',
      events: 'id, jobId, partId, reportDate, createdAt, updatedAt, _dirty, [jobId+reportDate]',
      flags: 'id, jobId, partId, zoneId, closedAt, updatedAt, _dirty',
      crew: 'id, updatedAt, _dirty',
      equipment: 'id, jobId, updatedAt, _dirty',
      photos: 'id, jobId, reportDate, partId, zoneId, updatedAt, _dirty',
      reports: 'id, jobId, date, updatedAt, _dirty',
      rollups: 'id, jobId, number, updatedAt, _dirty',
      tombstones: 'id, tbl, jobId, updatedAt, _dirty',
    }).upgrade(async tx => {
      for (const t of SYNCED) await tx.table(t).toCollection().modify((r: { _dirty?: number }) => { if (r._dirty === undefined) r._dirty = 1; });
    });
    this.version(5).stores({
      files: 'id, jobId, updatedAt, _dirty',
    });
    // Every local write gets a timestamp and a dirty flag so sync knows what to push.
    // Rows arriving from the server keep their own stamp and come in clean.
    for (const t of SYNCED) {
      const table = this.table(t);
      table.hook('creating', function (_pk, obj: { updatedAt?: number; _dirty?: number }) { if (!applyingRemote) { obj.updatedAt = Date.now(); obj._dirty = 1; } });
      table.hook('updating', function (mods: object) { return applyingRemote ? mods : { ...mods, updatedAt: Date.now(), _dirty: 1 }; });
    }
  }
}

export const SYNCED = ['jobs', 'phases', 'sheets', 'zones', 'payItems', 'parts', 'events', 'flags', 'crew', 'equipment', 'photos', 'reports', 'rollups', 'files', 'tombstones'] as const;
export type SyncedTable = typeof SYNCED[number];
export let applyingRemote = false;
export function setApplyingRemote(v: boolean) { applyingRemote = v; }

// Delete plus a tombstone so the other tablets delete it too.
export async function removeRow(tbl: SyncedTable, id: string, jobId: string): Promise<void> {
  await db.transaction('rw', db.table(tbl), db.tombstones, async () => {
    await db.table(tbl).delete(id);
    await db.tombstones.put({ id: `${tbl}:${id}`, tbl, rowId: id, jobId });
  });
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
