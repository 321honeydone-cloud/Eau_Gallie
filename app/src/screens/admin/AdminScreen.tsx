import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import AdminJobs from './AdminJobs';
import AdminSheets from './AdminSheets';
import AdminZones from './AdminZones';
import AdminPay from './AdminPay';
import AdminPins from './AdminPins';
import AdminPublish from './AdminPublish';

interface Props { onBack: () => void }

// Job setup. Same one thing per screen pattern as the report.
const STEPS = [
  { key: 'job', title: 'Job', hint: 'Pick the job you are setting up, or start a new one.' },
  { key: 'sheets', title: 'Plan sheets', hint: 'Upload the plan set PDF. Name the sheets that matter, pick the overview.' },
  { key: 'zones', title: 'Zones', hint: 'Draw a box on the overview for each area. Give it a phase and its detail sheet.' },
  { key: 'pay', title: 'Pay items', hint: 'The bid schedule. Type them in or paste from the spreadsheet.' },
  { key: 'pins', title: 'Pins', hint: 'Open a zone and tap the sheet where each part goes.' },
  { key: 'publish', title: 'Use it', hint: 'Check the counts, make it the active job, move it to the other tablets.' },
];

export default function AdminScreen({ onBack }: Props) {
  const [step, setStep] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useLiveQuery(() => (jobId ? db.jobs.get(jobId) : undefined), [jobId]);
  const cur = STEPS[step];
  const canGo = step === 0 || !!jobId;

  return (
    <div className="screen step-screen">
      <div className="toolbar">
        <button type="button" className="ege-btn" onClick={onBack}>&larr; Airfield</button>
        <h2 className="ege-h2" style={{ fontSize: 22, paddingBottom: 4 }}>Setup{job ? `, ${job.name}` : ''}</h2>
      </div>
      <div className="stepbar">
        {STEPS.map((s, i) => <button key={s.key} type="button" className={'stepdot' + (i === step ? ' on' : '')} disabled={i > 0 && !jobId} onClick={() => setStep(i)} style={{ minWidth: 100 }}>{s.title}</button>)}
      </div>
      <div className="stephead">
        <span className="stepnum">Step {step + 1} of {STEPS.length}</span>
        <h3>{cur.title}</h3>
        <p>{cur.hint}</p>
      </div>
      <div className="stepbody">
        {cur.key === 'job' && <AdminJobs jobId={jobId} onPick={id => { setJobId(id); }} onNext={() => setStep(1)} />}
        {cur.key === 'sheets' && jobId && <AdminSheets jobId={jobId} />}
        {cur.key === 'zones' && jobId && <AdminZones jobId={jobId} />}
        {cur.key === 'pay' && jobId && <AdminPay jobId={jobId} />}
        {cur.key === 'pins' && jobId && <AdminPins jobId={jobId} />}
        {cur.key === 'publish' && jobId && <AdminPublish jobId={jobId} onDone={onBack} />}
        <div className="barpad" />
      </div>
      <div className="ege-bar stepnav">
        <button type="button" className="ege-btn" disabled={step === 0} onClick={() => setStep(s => s - 1)}>&larr; Back</button>
        <span className="ege-bar-note">{step < STEPS.length - 1 ? `Next: ${STEPS[step + 1].title}` : ''}</span>
        {step < STEPS.length - 1 ? <button type="button" className="ege-btn primary" disabled={!canGo || !jobId} onClick={() => setStep(s => s + 1)}>Next &rarr;</button> : <button type="button" className="ege-btn primary" onClick={onBack}>Done</button>}
      </div>
    </div>
  );
}
