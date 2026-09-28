import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../db';
import { toast } from '../ege/ege';
import { useCrew, useOpenFlags, useParts, useZones } from '../hooks/useJob';
import { PhotoButton, PhotoStrip, usePhotos } from '../components/Photos';
import Signature from '../components/Signature';
import { PERCENTS, SAFETY, SHIFT_ENDS, SHIFT_STARTS, VISITORS, WEATHER, YARD, carryover, fmtTime, getOrCreateReport, partsTouched, generalStatus, workLines } from '../lib/report';
import { buildSections, fullText } from '../lib/reportText';
import type { CrewBucket, DailyReport, Job } from '../types';

interface Props { job: Job; date: string; foreman: string; onBack: () => void }

type BucketKey = 'internal' | 'sub' | 'temp';
const BUCKETS: { key: BucketKey; title: string }[] = [
  { key: 'internal', title: 'Our crew' }, { key: 'sub', title: 'Subcontractor' }, { key: 'temp', title: 'Temporary' },
];

// One screen per section. Big buttons, Back and Next at the bottom.
const STEPS = [
  { key: '1.1', title: 'Planned scope for today', hint: 'Prefilled from yesterday. Tap the zones you worked or planned.' },
  { key: '1.2', title: 'Work executed', hint: 'Built from your taps. Add yard work, lump sum progress, and photos.' },
  { key: '1.3', title: 'Carryover', hint: 'Touched today but not Complete, plus open flags. Nothing to do here unless you want to add a note.' },
  { key: '1.4', title: 'Delays and issues', hint: 'Straight from the flags. Flag a part from its card to add one.' },
  { key: '1.5', title: 'Plan for tomorrow', hint: 'Tap what got handled. Pick tomorrow\'s zones.' },
  { key: 'crew', title: 'Crew and hours', hint: 'Tap names into a bucket. Shift and lunch are one tap.' },
  { key: 'site', title: 'Site conditions', hint: 'Equipment, weather, safety, visitors.' },
  { key: 'sign', title: 'Review and sign', hint: 'This is what goes to Autodesk. Sign with your finger.' },
];

export default function ReportScreen({ job, date, foreman, onBack }: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => { getOrCreateReport(job.id, date, foreman).then(() => setReady(true)); }, [job.id, date, foreman]);
  const report = useLiveQuery(() => db.reports.get(`${job.id}_${date}`), [job.id, date]);
  const zones = useZones(job.id);
  const parts = useParts(job.id);
  const flags = useOpenFlags(job.id);
  const crew = useCrew();
  const equipment = useLiveQuery(() => db.equipment.where('jobId').equals(job.id).toArray(), [job.id]) ?? [];
  const payItems = useLiveQuery(() => db.payItems.where('jobId').equals(job.id).toArray(), [job.id]) ?? [];
  const events = useLiveQuery(() => db.events.where('[jobId+reportDate]').equals([job.id, date]).toArray(), [job.id, date]) ?? [];
  const photos = usePhotos(job.id, date);
  const partsById = useMemo(() => new Map(parts.map(p => [p.id, p])), [parts]);
  const touched = useMemo(() => partsTouched(events, partsById), [events, partsById]);
  const [step, setStep] = useState(0);
  const [sig, setSig] = useState<Blob | null>(null);
  const [newName, setNewName] = useState('');
  const [yardCat, setYardCat] = useState(''); const [yardQty, setYardQty] = useState(''); const [yardNote, setYardNote] = useState('');
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);

  if (!ready || !report) return <div className="stub">Loading…</div>;
  const r = report;
  const locked = !!r.signedAt;
  const save = (patch: Partial<DailyReport>) => db.reports.update(r.id, patch);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  const ctx = { report: r, zones, parts, touched, flags, payItems, equipment, photoCount: photos.length };
  const sections = buildSections(ctx);
  const wl = workLines(touched, zones);
  const carry = carryover(touched, flags, parts, zones);
  const lumps = payItems.filter(p => p.billingType === 'lumpsum');
  const status = generalStatus(touched, flags, parts, zones, lumps);
  const nice = window.EGE?.niceDate(date) ?? date;
  const cur = STEPS[step];

  const setBucket = (k: BucketKey, patch: Partial<CrewBucket>) => save({ crew: { ...r.crew, [k]: { ...r.crew[k], ...patch } } });
  const inBucket = (name: string): BucketKey | null => (Object.keys(r.crew) as BucketKey[]).find(k => r.crew[k].names.includes(name)) ?? null;
  const moveName = async (name: string, k: BucketKey) => {
    const crewNext = { ...r.crew };
    for (const b of Object.keys(crewNext) as BucketKey[]) crewNext[b] = { ...crewNext[b], names: crewNext[b].names.filter(n => n !== name) };
    if (inBucket(name) !== k) crewNext[k] = { ...crewNext[k], names: [...crewNext[k].names, name] };
    await save({ crew: crewNext });
  };
  const addName = async () => {
    const name = newName.trim(); if (!name) return;
    if (!crew.some(c => c.name.toLowerCase() === name.toLowerCase())) await db.crew.add({ id: uid('cm'), name, role: 'internal' });
    await moveName(name, 'internal');
    setNewName('');
  };
  const addYard = async () => {
    if (!yardCat) { toast('Pick a category first.'); return; }
    await save({ yardWork: [...r.yardWork, { category: yardCat, qty: yardQty ? Number(yardQty) : undefined, note: yardNote || undefined }] });
    setYardCat(''); setYardQty(''); setYardNote('');
  };
  const submit = async () => {
    if (!r.crew.internal.names.length) { toast('Add at least one name under crew.'); setStep(5); return; }
    if (!sig) { toast('Sign first.'); return; }
    await save({ submittedBy: foreman, signature: sig, signedAt: Date.now() });
    toast('Report submitted and signed.');
  };
  const reopen = async () => { await save({ submittedBy: undefined, signature: undefined, signedAt: undefined }); setSig(null); toast('Report reopened.'); };
  const copyAll = () => window.EGE?.copy(fullText(ctx, job.name, nice), 'Report');
  const secText = (num: string) => sections.find(s => s.num === num)?.text ?? '';

  const zoneTiles = (value: string[], onPick: (id: string) => void) => (
    <div className="choice-grid">
      {zones.map(z => <button key={z.id} type="button" disabled={locked} className={'choice' + (value.includes(z.id) ? ' on' : '')} onClick={() => onPick(z.id)}><b>{z.name}</b><span>{parts.filter(p => p.zoneId === z.id).length} parts</span></button>)}
    </div>
  );
  const big = (options: readonly string[], value: string[], onPick: (v: string) => void, bad = false) => (
    <div className="bigchips">{options.map(o => <button key={o} type="button" disabled={locked} className={'chip big' + (bad ? ' bad' : '') + (value.includes(o) ? ' on' : '')} onClick={() => onPick(o)} aria-pressed={value.includes(o)}>{o}</button>)}</div>
  );
  const note = (field: keyof DailyReport, value: string, placeholder: string) => (
    <div className="ege-field"><label>Optional note. Mic key on the keyboard works here.</label>
      <textarea key={field} defaultValue={value} disabled={locked} rows={3} placeholder={placeholder} onBlur={e => save({ [field]: e.target.value } as Partial<DailyReport>)} /></div>
  );
  const auto = (lines: string[], empty: string) => (
    <div className="auto">{lines.length ? lines.map((l, i) => <div key={i} className="autoline">{l}</div>) : <div className="autoline muted">{empty}</div>}</div>
  );

  return (
    <div className="screen step-screen">
      <div className="toolbar">
        <button type="button" className="ege-btn" onClick={onBack}>&larr; Airfield</button>
        <h2 className="ege-h2" style={{ fontSize: 22, paddingBottom: 4 }}>Daily report, {nice}</h2>
        {locked ? <span className="ege-flag ok">Signed by {r.submittedBy}</span> : <span className="ege-flag info">Saves as you go</span>}
        <span className="spacer" />
        <button type="button" className="ege-btn" onClick={copyAll}>Copy for Autodesk</button>
      </div>

      <div className="stepbar">
        {STEPS.map((s, i) => <button key={s.key} type="button" className={'stepdot' + (i === step ? ' on' : '') + (i < step ? ' done' : '')} onClick={() => setStep(i)} aria-label={s.title}>{s.key === 'crew' || s.key === 'site' ? '1.6' : s.key === 'sign' ? '✎' : s.key}</button>)}
      </div>

      <div className="stephead">
        <span className="stepnum">Step {step + 1} of {STEPS.length}</span>
        <h3>{cur.title}</h3>
        <p>{cur.hint}</p>
      </div>

      <div className="stepbody">
        {cur.key === '1.1' && (<>
          {zoneTiles(r.plannedZoneIds, id => save({ plannedZoneIds: toggle(r.plannedZoneIds, id) }))}
          {note('plannedScope', r.plannedScope, 'Work type, area, planned qty, crew assigned')}
        </>)}

        {cur.key === '1.2' && (<>
          {auto(wl.flatMap(w => [w.zone.name, ...w.lines.map(l => '   ' + l)]), 'No parts tapped yet today. Go back to the airfield and open a zone.')}
          {lumps.length > 0 && (
            <div className="ege-field"><label>Lump sum items, how far along</label>
              {lumps.map(l => (
                <div key={l.id} className="lump"><b>{l.description}</b>
                  {big(PERCENTS.map(p => `${p}%`), [`${l.percentComplete ?? 0}%`], v => db.payItems.update(l.id, { percentComplete: Number(v.replace('%', '')) }))}
                </div>
              ))}
            </div>
          )}
          <div className="ege-field"><label>Yard and other work, nothing on the drawing for it</label>
            {r.yardWork.map((y, i) => <div key={i} className="autoline">{y.category}{y.qty ? `, ${y.qty}` : ''}{y.note ? `. ${y.note}` : ''} {!locked && <button type="button" className="ege-link" onClick={() => save({ yardWork: r.yardWork.filter((_, j) => j !== i) })}>remove</button>}</div>)}
            {!locked && (<>
              {big(YARD, yardCat ? [yardCat] : [], v => setYardCat(v === yardCat ? '' : v))}
              <div className="ege-row"><input type="number" inputMode="numeric" className="num" placeholder="Qty" value={yardQty} onChange={e => setYardQty(e.target.value)} style={{ width: 110 }} />
                <input type="text" placeholder="Note (optional)" value={yardNote} onChange={e => setYardNote(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
                <button type="button" className="ege-btn primary" onClick={addYard}>Add</button></div>
            </>)}
          </div>
          <div className="ege-field"><label>Photos, {photos.length} today</label>
            <PhotoStrip photos={photos} canDelete={!locked} />
            {!locked && <div><PhotoButton jobId={job.id} date={date} foreman={foreman} stamp={`1.2 Work Executed | ${job.airport}`} label="Take photo" /></div>}
          </div>
          {note('workNote', r.workNote, 'Anything the taps don\'t say')}
        </>)}

        {cur.key === '1.3' && (<>
          {auto(carry.filter(c => !r.carryDone.includes(c.key)).map(c => `${c.zoneName ? c.zoneName + ', ' : ''}${c.text}`), 'Nothing carrying over.')}
          {note('carryNote', r.carryNote, 'Reason not completed, impact')}
        </>)}

        {cur.key === '1.4' && (<>
          {auto(secText('1.4') ? secText('1.4').split('\n\n').filter(x => x !== r.delayNote) : [], 'No open flags.')}
          {note('delayNote', r.delayNote, 'Anything not tied to a part')}
        </>)}

        {cur.key === '1.5' && (<>
          <div className="ege-field"><label>Carryover, tap what got handled</label>
            {carry.length ? <div className="choice-grid">{carry.map(c => <button key={c.key} type="button" disabled={locked} className={'choice' + (r.carryDone.includes(c.key) ? ' on' : '')} onClick={() => save({ carryDone: toggle(r.carryDone, c.key) })}><b>{r.carryDone.includes(c.key) ? '✓ ' : ''}{c.text}</b><span>{c.zoneName}</span></button>)}</div> : <div className="autoline muted">Nothing to carry.</div>}
          </div>
          <div className="ege-field"><label>Zones for tomorrow</label>{zoneTiles(r.nextZoneIds, id => save({ nextZoneIds: toggle(r.nextZoneIds, id) }))}</div>
          {note('actionPlan', r.actionPlan, 'Recovery needed, materials, manning, timeline')}
        </>)}

        {cur.key === 'crew' && (<>
          <div className="ege-field"><label>Tap a name to move it to a bucket. Tap again to take it off.</label>
            <div className="bucketgrid">
              {BUCKETS.map(b => (
                <div key={b.key} className="bucketcol">
                  <div className="buckettitle">{b.title}<small>{r.crew[b.key].names.length} on site</small></div>
                  {r.crew[b.key].names.map(n => <button key={n} type="button" disabled={locked} className="choice on" onClick={() => moveName(n, b.key)}><b>{n}</b><span>Tap to remove</span></button>)}
                  {r.crew[b.key].names.length > 0 && (
                    <div className="shiftblock">
                      <span>Start</span>{big(SHIFT_STARTS.map(fmtTime), [fmtTime(r.crew[b.key].shiftStart)], v => setBucket(b.key, { shiftStart: SHIFT_STARTS[SHIFT_STARTS.map(fmtTime).indexOf(v)] }))}
                      <span>End</span>{big(SHIFT_ENDS.map(fmtTime), [fmtTime(r.crew[b.key].shiftEnd)], v => setBucket(b.key, { shiftEnd: SHIFT_ENDS[SHIFT_ENDS.map(fmtTime).indexOf(v)] }))}
                      <span>Lunch</span>{big(['30 min', '60 min'], [`${r.crew[b.key].lunchMinutes} min`], v => setBucket(b.key, { lunchMinutes: Number(v.split(' ')[0]) }))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="ege-field"><label>Not on site yet. Tap a name, then the bucket it goes in.</label>
            <div className="choice-grid">
              {crew.filter(c => !inBucket(c.name)).map(c => (
                <div key={c.id} className="choice namepick"><b>{c.name}</b>
                  <div className="ege-row">{BUCKETS.map(b => <button key={b.key} type="button" disabled={locked} className="ege-btn small" onClick={() => moveName(c.name, b.key)}>{b.title}</button>)}</div>
                </div>
              ))}
            </div>
            {!locked && <div className="ege-row" style={{ marginTop: 8 }}><input type="text" placeholder="Add a new name" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addName(); }} style={{ width: 260 }} /><button type="button" className="ege-btn primary" onClick={addName}>Add to our crew</button></div>}
          </div>
        </>)}

        {cur.key === 'site' && (<>
          <div className="ege-field"><label>Equipment on site</label>{big(equipment.map(e => e.name), equipment.filter(e => r.equipmentIds.includes(e.id)).map(e => e.name), n => { const e = equipment.find(x => x.name === n)!; save({ equipmentIds: toggle(r.equipmentIds, e.id) }); })}</div>
          <div className="ege-field"><label>Weather</label>{big(WEATHER, r.weather, v => save({ weather: toggle(r.weather, v) }))}
            {big(['70F', '80F', '90F', '100F'], r.tempF ? [`${r.tempF}F`] : [], v => { const t = Number(v.replace('F', '')); save({ tempF: r.tempF === t ? undefined : t }); })}</div>
          <div className="ege-field"><label>Safety</label>{big(SAFETY, r.safety, v => save({ safety: toggle(r.safety, v) }))}</div>
          <div className="ege-field"><label>Visitors</label>{big(VISITORS, r.visitors, v => save({ visitors: toggle(r.visitors, v) }))}</div>
          <div className="ege-field"><label>Executive comment, optional. One paragraph if you want it.</label>
            <textarea key="exec" defaultValue={r.executiveComment} disabled={locked} rows={3} placeholder="Mic key works." onBlur={e => save({ executiveComment: e.target.value })} /></div>
        </>)}

        {cur.key === 'sign' && (<>
          <div className="ege-field"><label>General status, builds itself</label>{auto(status, 'Nothing yet.')}</div>
          <pre className="preview">{fullText(ctx, job.name, nice)}</pre>
          {locked ? (
            <div className="ege-row"><span className="ege-flag ok">Signed by {r.submittedBy} at {new Date(r.signedAt!).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span><button type="button" className="ege-btn" onClick={reopen}>Reopen to edit</button></div>
          ) : <Signature onChange={setSig} />}
        </>)}
        <div className="barpad" />
      </div>

      <div className="ege-bar stepnav">
        <button type="button" className="ege-btn" disabled={step === 0} onClick={() => setStep(s => s - 1)}>&larr; Back</button>
        <span className="ege-bar-note">{cur.key === 'sign' ? '' : `Next: ${STEPS[step + 1].title}`}</span>
        {cur.key === 'sign'
          ? (locked ? <button type="button" className="ege-btn primary" onClick={onBack}>Done</button> : <button type="button" className="ege-btn accent" onClick={submit}>Submit and sign</button>)
          : <button type="button" className="ege-btn primary" onClick={() => setStep(s => s + 1)}>Next &rarr;</button>}
      </div>
    </div>
  );
}
