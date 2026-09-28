import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, setSetting } from '../../db';
import { toast } from '../../ege/ege';
import { importJob, deleteJob } from '../../lib/jobio';
import type { Job } from '../../types';

interface Props { jobId: string | null; onPick: (id: string) => void; onNext: () => void }

const DEFAULT_EQUIPMENT = ['Trencher', 'Mini excavator', 'Skid steer', 'Directional bore rig', 'Core drill', 'Saw cut rig', 'Concrete mixer', 'Bucket truck', 'Service truck', 'Van', 'Light tower'];

export default function AdminJobs({ jobId, onPick, onNext }: Props) {
  const jobs = useLiveQuery(() => db.jobs.toArray(), []) ?? [];
  const activeId = useLiveQuery(() => db.settings.get('jobId').then(s => s?.value), []);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', customer: '', airport: '', contractNo: '', billingList: 'owner' as Job['billingList'] });
  const fileRef = useRef<HTMLInputElement>(null);
  const [armed, setArmed] = useState<string | null>(null);

  const create = async () => {
    if (!form.name.trim() || !form.airport.trim()) { toast('Job name and airport are required.'); return; }
    const id = uid('job');
    await db.transaction('rw', db.jobs, db.equipment, async () => {
      await db.jobs.add({ id, ...form, name: form.name.trim(), airport: form.airport.trim() });
      await db.equipment.bulkAdd(DEFAULT_EQUIPMENT.map((name, i) => ({ id: `${id}_eq${i}`, jobId: id, name })));
    });
    setCreating(false); setForm({ name: '', customer: '', airport: '', contractNo: '', billingList: 'owner' });
    onPick(id); toast('Job created. Next, the plan sheets.'); onNext();
  };
  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    try { const job = await importJob(f); onPick(job.id); toast(`Imported ${job.name}.`); } catch (err) { toast('That file did not import. ' + (err as Error).message); }
  };
  const remove = async (id: string) => {
    if (armed !== id) { setArmed(id); setTimeout(() => setArmed(a => (a === id ? null : a)), 3000); return; }
    await deleteJob(id);
    if (activeId === id) { const rest = await db.jobs.toArray(); await setSetting('jobId', rest[0]?.id ?? ''); }
    if (jobId === id) onPick('');
    setArmed(null); toast('Job deleted.');
  };

  return (
    <>
      <div className="choice-grid">
        {jobs.map(j => (
          <div key={j.id} className={'choice' + (jobId === j.id ? ' on' : '')} role="button" tabIndex={0} onClick={() => onPick(j.id)}>
            <b>{j.name}</b>
            <span>{j.airport}{j.customer ? ` · ${j.customer}` : ''}{activeId === j.id ? ' · ACTIVE on this tablet' : ''}{j.placeholder ? ' · placeholder' : ''}</span>
            <div className="ege-row" style={{ marginTop: 6 }}>
              <button type="button" className={'ege-btn small' + (armed === j.id ? ' arm' : '')} onClick={e => { e.stopPropagation(); remove(j.id); }}>{armed === j.id ? 'Tap again to delete' : 'Delete'}</button>
            </div>
          </div>
        ))}
        {!creating && <button type="button" className="choice" onClick={() => setCreating(true)}><b>+ New job</b><span>Name, customer, airport, contract</span></button>}
        <button type="button" className="choice" onClick={() => fileRef.current?.click()}><b>Import a job file</b><span>A .json exported from another tablet</span></button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
      </div>
      {creating && (
        <div className="form-grid">
          <div className="ege-field"><label>Job name</label><input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Taxiway A Rehab" /></div>
          <div className="ege-field"><label>Airport</label><input type="text" value={form.airport} onChange={e => setForm({ ...form, airport: e.target.value })} placeholder="Pensacola International" /></div>
          <div className="ege-field"><label>Customer (GC or owner)</label><input type="text" value={form.customer} onChange={e => setForm({ ...form, customer: e.target.value })} /></div>
          <div className="ege-field"><label>Contract number</label><input type="text" value={form.contractNo} onChange={e => setForm({ ...form, contractNo: e.target.value })} /></div>
          <div className="ege-field"><label>We bill against</label>
            <div className="bigchips">
              <button type="button" className={'chip big' + (form.billingList === 'owner' ? ' on' : '')} onClick={() => setForm({ ...form, billingList: 'owner' })}>Owner's bid schedule</button>
              <button type="button" className={'chip big' + (form.billingList === 'sub' ? ' on' : '')} onClick={() => setForm({ ...form, billingList: 'sub' })}>Our subcontract SOV</button>
            </div></div>
          <div className="ege-row" style={{ alignSelf: 'end' }}>
            <button type="button" className="ege-btn" onClick={() => setCreating(false)}>Cancel</button>
            <button type="button" className="ege-btn primary" onClick={create}>Create job</button>
          </div>
        </div>
      )}
    </>
  );
}
