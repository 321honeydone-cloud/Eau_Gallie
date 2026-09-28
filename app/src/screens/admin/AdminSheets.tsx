import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, removeRow } from '../../db';
import { toast } from '../../ege/ege';
import { imageToSheet, pdfToSheets } from '../../lib/pdf';
import type { Sheet } from '../../types';

interface Props { jobId: string }

function Thumb({ sheet }: { sheet: Sheet }) {
  const [url, setUrl] = useState(sheet.src ?? '');
  useEffect(() => { if (sheet.blob) { const u = URL.createObjectURL(sheet.blob); setUrl(u); return () => URL.revokeObjectURL(u); } }, [sheet.blob]);
  return <img src={url} alt="" />;
}

export default function AdminSheets({ jobId }: Props) {
  const sheets = useLiveQuery(() => db.sheets.where('jobId').equals(jobId).sortBy('order'), [jobId]) ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState('');
  const [armed, setArmed] = useState<string | null>(null);

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []); e.target.value = '';
    let order = sheets.length; let failed = 0;
    for (const f of files) {
      try {
        if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
          setProgress(`Rendering ${f.name}…`);
          const out = await pdfToSheets(f, jobId, order, (d, t) => setProgress(`Rendering ${f.name}, page ${d} of ${t}`));
          await db.sheets.bulkAdd(out); order += out.length;
        } else {
          const s = await imageToSheet(f, jobId, order + 1); await db.sheets.add(s); order += 1;
        }
      } catch (err) { console.error('sheet load failed', err); failed += 1; setProgress(''); toast(`${f.name} did not load. ${(err as Error).message}`); }
    }
    setProgress('');
    if (files.length && !failed) toast('Sheets loaded. Name the ones that matter.');
  };
  const update = (id: string, patch: Partial<Sheet>) => db.sheets.update(id, patch);
  const setOverview = async (id: string) => { for (const s of sheets) await db.sheets.update(s.id, { isOverview: s.id === id }); };
  const remove = async (id: string) => {
    if (armed !== id) { setArmed(id); setTimeout(() => setArmed(a => (a === id ? null : a)), 3000); return; }
    const used = await db.zones.where('jobId').equals(jobId).filter(z => z.detailSheetId === id || z.overviewSheetId === id).count();
    if (used) { toast('A zone uses this sheet. Change the zone first.'); setArmed(null); return; }
    await removeRow('sheets', id, jobId); setArmed(null);
  };

  return (
    <>
      <div className="ege-row">
        <button type="button" className="ege-btn primary" style={{ minHeight: 60 }} onClick={() => fileRef.current?.click()} disabled={!!progress}>{progress || 'Upload plan set PDF or images'}</button>
        <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple hidden onChange={onFiles} />
        <span className="ege-bar-note">Every page renders on this device. Nothing uploads anywhere. A 40 page set takes a minute or two.</span>
      </div>
      <div className="admin-list">
        {sheets.map(s => (
          <div key={s.id} className={'arow' + (s.isOverview ? ' on' : '')}>
            <Thumb sheet={s} />
            <div className="fields">
              <input type="text" value={s.name} placeholder="E-108" onChange={e => update(s.id, { name: e.target.value })} aria-label="Sheet number" />
              <input type="text" value={s.title} placeholder="Taxiway A West Lighting Plan" onChange={e => update(s.id, { title: e.target.value })} aria-label="Sheet title" />
            </div>
            <div className="ege-row">
              <button type="button" className={'ege-btn small' + (s.isOverview ? ' primary' : '')} onClick={() => setOverview(s.id)}>{s.isOverview ? 'Overview' : 'Make overview'}</button>
              <button type="button" className={'ege-btn small' + (armed === s.id ? ' arm' : '')} onClick={() => remove(s.id)}>{armed === s.id ? 'Tap again' : 'Delete'}</button>
            </div>
          </div>
        ))}
        {!sheets.length && <div className="stub">No sheets yet. Upload the plan set.</div>}
      </div>
    </>
  );
}
