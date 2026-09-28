import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { stepName } from '../lib/status';
import type { Job } from '../types';

interface Props { job: Job; date: string; onBack: () => void }

// Build step 2 replaces this with the six section Autodesk layout.
// For now it shows today's taps so the foreman can see the log is real.
export default function ReportStub({ job, date, onBack }: Props) {
  const events = useLiveQuery(() => db.events.where('[jobId+reportDate]').equals([job.id, date]).reverse().sortBy('createdAt'), [job.id, date]) ?? [];
  const parts = useLiveQuery(() => db.parts.where('jobId').equals(job.id).toArray(), [job.id]) ?? [];
  const zones = useLiveQuery(() => db.zones.where('jobId').equals(job.id).toArray(), [job.id]) ?? [];
  const byId = new Map(parts.map(p => [p.id, p]));
  const zoneName = (zid: string) => zones.find(z => z.id === zid)?.name ?? zid;
  return (
    <div className="screen">
      <div className="toolbar">
        <button type="button" className="ege-btn" onClick={onBack}>&larr; Airfield</button>
        <h2 className="ege-h2" style={{ fontSize: 22, paddingBottom: 4 }}>Daily report, {window.EGE?.niceDate(date) ?? date}</h2>
      </div>
      <div className="ege-banner">Build step 2 turns this into the six Autodesk sections. Right now it's the raw log of today's taps, newest first.</div>
      <div className="plist" style={{ maxHeight: 'none' }}>
        {events.map(e => { const p = byId.get(e.partId); return (
          <div key={e.id} className="prow" style={{ cursor: 'default' }}>
            <span className={`dot s${e.toStep}`}>{e.toStep}</span>
            <span className="lab">{p?.label ?? e.partId}<small>{p ? zoneName(p.zoneId) : ''} · {e.foreman} · {new Date(e.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</small></span>
            <span className="st">{e.ladder === 'demo' ? 'Demo ' : ''}{stepName(e.fromStep)} → {stepName(e.toStep)}{e.qtyDone !== undefined ? ` · ${e.qtyDone} LF` : ''}</span>
          </div>
        ); })}
        {!events.length && <div className="stub">No taps yet today. Open a zone and get after it.</div>}
      </div>
    </div>
  );
}
