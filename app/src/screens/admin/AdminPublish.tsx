import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, setSetting } from '../../db';
import { toast } from '../../ege/ege';
import { exportJob } from '../../lib/jobio';

interface Props { jobId: string; onDone: () => void }

export default function AdminPublish({ jobId, onDone }: Props) {
  const job = useLiveQuery(() => db.jobs.get(jobId), [jobId]);
  const counts = useLiveQuery(async () => ({
    sheets: await db.sheets.where('jobId').equals(jobId).count(),
    zones: await db.zones.where('jobId').equals(jobId).count(),
    parts: await db.parts.where('jobId').equals(jobId).count(),
    pay: await db.payItems.where('jobId').equals(jobId).count(),
    unpaid: await db.parts.where('jobId').equals(jobId).filter(p => !p.installPay.length && !p.demoPay.length).count(),
    overview: await db.sheets.where('jobId').equals(jobId).filter(s => !!s.isOverview).count(),
  }), [jobId]);
  const activeId = useLiveQuery(() => db.settings.get('jobId').then(s => s?.value), []);
  const [busy, setBusy] = useState(false);
  const link = useRef<HTMLAnchorElement>(null);

  const useIt = async () => { await setSetting('jobId', jobId); toast(`${job?.name} is now the active job.`); onDone(); };
  const download = async () => {
    setBusy(true);
    try {
      const blob = await exportJob(jobId);
      const url = URL.createObjectURL(blob);
      const a = link.current!; a.href = url; a.download = `${(job?.name ?? 'job').replace(/[^\w]+/g, '-')}.egejob.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      const f = new File([blob], a.download, { type: 'application/json' });
      if (window.EGE && navigator.canShare?.({ files: [f] })) await window.EGE.share({ title: job?.name, files: [f] });
    } finally { setBusy(false); }
  };
  if (!counts || !job) return null;
  const warnings = [
    !counts.overview && 'No overview sheet picked.',
    !counts.zones && 'No zones drawn.',
    !counts.parts && 'No pins placed.',
    counts.unpaid > 0 && `${counts.unpaid} pins have no pay item, they will not bill.`,
    !counts.pay && 'No pay items.',
  ].filter(Boolean) as string[];

  return (
    <>
      <div className="stats">
        <div className="stat"><div className="k">Sheets</div><div className="v">{counts.sheets}</div></div>
        <div className="stat"><div className="k">Zones</div><div className="v">{counts.zones}</div></div>
        <div className="stat"><div className="k">Pins</div><div className="v">{counts.parts}</div></div>
        <div className="stat"><div className="k">Pay items</div><div className="v">{counts.pay}</div></div>
      </div>
      {warnings.map(w => <div key={w} className="ege-banner">{w}</div>)}
      <div className="choice-grid">
        <button type="button" className={'choice' + (activeId === jobId ? ' on' : '')} onClick={useIt}><b>{activeId === jobId ? 'Active on this tablet' : 'Use this job on this tablet'}</b><span>The airfield map switches to it.</span></button>
        <button type="button" className="choice" disabled={busy} onClick={download}><b>{busy ? 'Packing…' : 'Send to another tablet'}</b><span>Downloads a job file. AirDrop it, then Import a job file on the other iPad.</span></button>
      </div>
      <a ref={link} hidden>download</a>
      <p className="ege-intro">Sync between tablets comes in the next build. Until then the job file is the way to move a setup around.</p>
    </>
  );
}
