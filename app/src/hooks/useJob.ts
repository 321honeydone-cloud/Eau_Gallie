import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Part, Flag } from '../types';

export function useJobId() {
  return useLiveQuery(() => db.settings.get('jobId').then(s => s?.value), []);
}
export function useForeman() {
  return useLiveQuery(() => db.settings.get('foreman').then(s => s?.value ?? ''), []);
}
export function useJob(jobId?: string) {
  return useLiveQuery(() => (jobId ? db.jobs.get(jobId) : undefined), [jobId]);
}
export function usePhases(jobId?: string) {
  return useLiveQuery(() => (jobId ? db.phases.where('jobId').equals(jobId).sortBy('order') : []), [jobId]) ?? [];
}
export function useZones(jobId?: string) {
  return useLiveQuery(() => (jobId ? db.zones.where('jobId').equals(jobId).toArray() : []), [jobId]) ?? [];
}
export function useSheets(jobId?: string) {
  return useLiveQuery(() => (jobId ? db.sheets.where('jobId').equals(jobId).toArray() : []), [jobId]) ?? [];
}
export function useParts(jobId?: string): Part[] {
  return useLiveQuery(() => (jobId ? db.parts.where('jobId').equals(jobId).toArray() : []), [jobId]) ?? [];
}
export function useZoneParts(zoneId?: string): Part[] {
  return useLiveQuery(() => (zoneId ? db.parts.where('zoneId').equals(zoneId).toArray() : []), [zoneId]) ?? [];
}
export function useOpenFlags(jobId?: string): Flag[] {
  return useLiveQuery(
    () => (jobId ? db.flags.where('jobId').equals(jobId).filter(f => !f.closedAt).toArray() : []),
    [jobId],
  ) ?? [];
}
export function useCrew() {
  return useLiveQuery(() => db.crew.toArray(), []) ?? [];
}
export function useTodayEventCount(jobId: string | undefined, date: string) {
  return useLiveQuery(() => (jobId ? db.events.where('[jobId+reportDate]').equals([jobId, date]).count() : 0), [jobId, date]) ?? 0;
}

// Night look on the sheets is the default. One tap flips to daylight when the sun wins.
export function useSheetDark(): boolean {
  return useLiveQuery(() => db.settings.get('sheetLook').then(s => s?.value !== 'day'), []) ?? true;
}
