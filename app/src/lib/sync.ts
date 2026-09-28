import { db, getSetting, setApplyingRemote, setSetting, SYNCED, applyingRemote, type SyncedTable } from '../db';
import type { DailyReport, Part, StatusEvent } from '../types';

// Offline first sync. Every synced table row carries updatedAt (local clock).
// The server keeps one generic table, sync_rows, plus a files bucket for blobs.
// Push: rows with updatedAt newer than the last push. Pull: rows the server
// stamped after our last pull (server clock, so tablet clocks don't matter).
// Merge: newer updatedAt wins, except reports union their crew, and part steps
// are recomputed from the event log so two foremen on one part settle by time.

export interface SyncConfig { url: string; key: string }
export interface SyncStatus { state: 'off' | 'idle' | 'syncing' | 'error'; lastAt?: number; pending: number; message?: string }

type Row = { id: string; tbl: string; job_id: string; updated_at: number; server_at?: number; deleted?: boolean; data: Record<string, unknown> | null };

const BLOB_TABLES: Partial<Record<SyncedTable, string>> = { photos: 'blob', sheets: 'blob', files: 'blob' };
const listeners = new Set<(s: SyncStatus) => void>();
let status: SyncStatus = { state: 'off', pending: 0 };
let running = false;
let rerun = false;
let timer: number | undefined;

export function onSyncStatus(fn: (s: SyncStatus) => void) { listeners.add(fn); fn(status); return () => { listeners.delete(fn); }; }
function emit(patch: Partial<SyncStatus>) { status = { ...status, ...patch }; if (import.meta.env.DEV || localStorage.getItem('ege.syncdebug')) console.log('[sync]', JSON.stringify(status)); listeners.forEach(fn => fn(status)); }

export async function getSyncConfig(): Promise<SyncConfig | null> {
  const url = await getSetting('sync.url'), key = await getSetting('sync.key');
  return url && key ? { url: url.replace(/\/$/, ''), key } : null;
}
export async function setSyncConfig(c: SyncConfig | null) {
  await setSetting('sync.url', c?.url ?? ''); await setSetting('sync.key', c?.key ?? '');
  if (c) { emit({ state: 'idle', message: undefined }); void syncNow(); } else emit({ state: 'off' });
}

function headers(c: SyncConfig, extra: Record<string, string> = {}) {
  return { apikey: c.key, Authorization: `Bearer ${c.key}`, ...extra };
}

async function pushRows(c: SyncConfig, rows: Row[]) {
  for (let i = 0; i < rows.length; i += 200) {
    const r = await fetch(`${c.url}/rest/v1/sync_rows`, { method: 'POST', headers: headers(c, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(rows.slice(i, i + 200)) });
    if (!r.ok) throw new Error(`push ${r.status} ${await r.text()}`);
  }
}
async function pullRows(c: SyncConfig, tbl: string, since: number): Promise<Row[]> {
  const out: Row[] = [];
  let cursor = since;
  for (;;) {
    const q = new URLSearchParams({ tbl: `eq.${tbl}`, server_at: `gt.${cursor}`, order: 'server_at.asc', limit: '500' });
    const r = await fetch(`${c.url}/rest/v1/sync_rows?${q}`, { headers: headers(c) });
    if (!r.ok) throw new Error(`pull ${r.status} ${await r.text()}`);
    const rows = (await r.json()) as Row[];
    out.push(...rows);
    if (rows.length < 500) break;
    cursor = rows[rows.length - 1].server_at!;
  }
  return out;
}
async function uploadBlob(c: SyncConfig, key: string, blob: Blob) {
  const r = await fetch(`${c.url}/storage/v1/object/files/${key}`, { method: 'POST', headers: headers(c, { 'Content-Type': blob.type || 'application/octet-stream', 'x-upsert': 'true' }), body: blob });
  if (!r.ok && r.status !== 409) throw new Error(`upload ${r.status} ${await r.text()}`);
}
async function downloadBlob(c: SyncConfig, key: string): Promise<Blob> {
  const r = await fetch(`${c.url}/storage/v1/object/files/${key}`, { headers: headers(c) });
  if (!r.ok) throw new Error(`download ${r.status}`);
  return await r.blob();
}

async function pendingCount(): Promise<number> {
  let n = 0;
  for (const t of SYNCED) n += await db.table(t).where('_dirty').equals(1).count();
  return n;
}

export async function syncNow(): Promise<void> {
  const c = await getSyncConfig();
  if (!c) { emit({ state: 'off', pending: 0 }); return; }
  if (running) { rerun = true; return; }        // a change landed mid sync, go again after
  if (!navigator.onLine) { emit({ state: 'idle', pending: await pendingCount(), message: 'offline' }); return; }
  running = true; emit({ state: 'syncing' });
  try {
    // push: every dirty row, then clear the flag on the exact version that went up
    for (const t of SYNCED) {
      const rows = await db.table(t).where('_dirty').equals(1).toArray() as Record<string, unknown>[];
      if (!rows.length) continue;
      const blobField = BLOB_TABLES[t];
      const out: Row[] = [];
      for (const r of rows) {
        const data: Record<string, unknown> = { ...r, _dirty: undefined };
        if (blobField && data[blobField] instanceof Blob) {
          const key = `${data.jobId}/${t}/${data.id}`;
          await uploadBlob(c, key, data[blobField] as Blob);
          data[blobField] = undefined; data.blobKey = key;
        }
        if (t === 'reports' && data.signature instanceof Blob) { const key = `${data.jobId}/sig/${data.id}`; await uploadBlob(c, key, data.signature as Blob); data.signature = undefined; data.sigKey = key; }
        const isTomb = t === 'tombstones';
        out.push({ id: `${t}:${data.id}`, tbl: t, job_id: String(data.jobId ?? ''), updated_at: Number(data.updatedAt), deleted: isTomb, data: isTomb ? { tbl: data.tbl, rowId: data.rowId } : data });
      }
      await pushRows(c, out);
      setApplyingRemote(true);
      try {
        for (const r of rows) await db.table(t).where('id').equals(r.id as string).and(x => x.updatedAt === r.updatedAt).modify({ _dirty: 0 });
      } finally { setApplyingRemote(false); }
    }
    // pull
    const touchedParts = new Set<string>();
    for (const t of SYNCED) {
      const since = Number((await getSetting(`sync.pulled.${t}`)) ?? 0);
      const rows = await pullRows(c, t, since);
      if (!rows.length) continue;
      let maxServer = since;
      setApplyingRemote(true);
      try {
        for (const row of rows) {
          maxServer = Math.max(maxServer, row.server_at ?? 0);
          if (t === 'tombstones' && row.data) { await db.table(row.data.tbl as string).delete(row.data.rowId as string); continue; }
          if (!row.data) continue;
          const data = { ...row.data, _dirty: 0 } as Record<string, unknown>;
          const local = await db.table(t).get(data.id as string) as Record<string, unknown> | undefined;
          if (local && Number(local.updatedAt ?? 0) > row.updated_at) continue;   // ours is newer, it will push
          const blobField = BLOB_TABLES[t];
          if (blobField && data.blobKey) { try { data[blobField] = await downloadBlob(c, data.blobKey as string); } catch { /* next sync */ } }
          if (t === 'reports' && data.sigKey && !data.signature) { try { data.signature = await downloadBlob(c, data.sigKey as string); } catch { /* next sync */ } }
          if (t === 'reports' && local && mergeReport(data as unknown as DailyReport, local as unknown as DailyReport)) { data.updatedAt = Date.now(); data._dirty = 1; }
          if (t === 'events') touchedParts.add(String(data.partId));
          await db.table(t).put(data);
        }
      } finally { setApplyingRemote(false); }
      await setSetting(`sync.pulled.${t}`, String(maxServer));
    }
    if (touchedParts.size) await recomputeParts([...touchedParts]);
    emit({ state: 'idle', lastAt: Date.now(), pending: await pendingCount(), message: undefined });
  } catch (e) {
    emit({ state: 'error', pending: await pendingCount(), message: (e as Error).message });
  } finally {
    running = false;
    if (rerun) { rerun = false; void syncNow(); }
  }
}

// Two foremen, one report: union the people and the yard work, newest wins the rest.
// Returns true when the local copy added something the remote didn't have, so it goes back up.
function mergeReport(remote: DailyReport, local: DailyReport): boolean {
  const before = JSON.stringify(remote);
  const uniq = (a: string[], b: string[]) => [...new Set([...a, ...b])];
  remote.foremen = uniq(remote.foremen, local.foremen);
  for (const k of ['internal', 'sub', 'temp'] as const) remote.crew[k] = { ...remote.crew[k], names: uniq(remote.crew[k].names, local.crew[k].names) };
  remote.equipmentIds = uniq(remote.equipmentIds, local.equipmentIds);
  remote.weather = uniq(remote.weather, local.weather);
  remote.safety = uniq(remote.safety, local.safety);
  remote.visitors = uniq(remote.visitors, local.visitors);
  remote.carryDone = uniq(remote.carryDone, local.carryDone);
  const seen = new Set(remote.yardWork.map(y => JSON.stringify(y)));
  for (const y of local.yardWork) if (!seen.has(JSON.stringify(y))) remote.yardWork.push(y);
  return JSON.stringify(remote) !== before;
}

// The event log is the truth. After pulling events, a part's step is whatever the latest event says.
async function recomputeParts(ids: string[]) {
  setApplyingRemote(true);
  try {
    for (const id of ids) {
      const part = await db.parts.get(id) as Part | undefined; if (!part) continue;
      const evs = (await db.events.where('partId').equals(id).toArray() as StatusEvent[]).sort((a, b) => a.createdAt - b.createdAt);
      const patch: Partial<Part> = {};
      const li = [...evs].reverse().find(e => e.ladder === 'install'); if (li) { patch.installStep = li.toStep; if (li.qtyDone !== undefined) patch.qtyDone = li.qtyDone; }
      const ld = [...evs].reverse().find(e => e.ladder === 'demo'); if (ld) patch.demoStep = ld.toStep;
      if (Object.keys(patch).length) await db.parts.update(id, patch);
    }
  } finally { setApplyingRemote(false); }
}

// Runs on start, when the tablet comes back online, every minute, and shortly after any write.
export function startSync() {
  void syncNow();
  window.addEventListener('online', () => void syncNow());
  timer = window.setInterval(() => void syncNow(), 60_000);
  let debounce: number | undefined;
  const kick = () => {
    if (applyingRemote) return;                       // rows coming down don't need to go back up
    if (status.state !== 'off') emit({ pending: status.pending + 1 });   // pill says "1 to send" right away
    window.clearTimeout(debounce); debounce = window.setTimeout(() => void syncNow(), 4000);
  };
  for (const t of SYNCED) { const table = db.table(t); table.hook('creating', kick); table.hook('updating', kick); table.hook('deleting', kick); }
  return () => window.clearInterval(timer);
}

// Marks everything dirty and forgets the pull point, so the next sync sends and fetches it all. For a fresh server.
export async function resetSyncWatermarks() {
  setApplyingRemote(true);
  try { for (const t of SYNCED) { await db.table(t).toCollection().modify({ _dirty: 1 }); await setSetting(`sync.pulled.${t}`, '0'); } }
  finally { setApplyingRemote(false); }
}
