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
  { key: 'internal', title: 'Internal personnel' }, { key: 'sub', title: 'Subcontractor personnel' }, { key: 'temp', title: 'Temporary personnel' },
];

function Chips({ options, value, onPick, bad = false, locked }: { options: readonly string[]; value: string[]; onPick: (v: string) => void; bad?: boolean; locked: boolean }) {
  return <div className="chips">{options.map(o => <button key={o} type="button" disabled={locked} className={'chip' + (bad ? ' bad' : '') + (value.includes(o) ? ' on' : '')} onClick={() => onPick(o)} aria-pressed={value.includes(o)}>{o}</button>)}</div>;
}
function Card({ num, title, eg, active, onActive, onCopy, children }: { num: string; title: string; eg: string; active: string; onActive: (n: string) => void; onCopy: (n: string) => void; children: React.ReactNode }) {
  return (
    <section id={'sec-' + num.replace('.', '-')} className={'ege-card' + (active === num ? ' live' : '')}>
      <div className="ege-card-head" onClick={() => onActive(num)}><span className="ege-card-num">{num}</span><h3>{title}</h3>
        <button type="button" className="ege-btn small" onClick={e => { e.stopPropagation(); onCopy(num); }}>Copy</button></div>
      <p className="ege-card-eg">{eg}</p>
      {children}
    </section>
  );
}
function Auto({ lines, empty }: { lines: string[]; empty: string }) {
  return <div className="auto">{lines.length ? lines.map((l, i) => <div key={i} className="autoline">{l}</div>) : <div className="autoline muted">{empty}</div>}</div>;
}
function Note({ value, field, placeholder, locked, onSave }: { value: string; field: keyof DailyReport; placeholder: string; locked: boolean; onSave: (patch: Partial<DailyReport>) => void }) {
  return (
    <div className="ege-field"><label>Optional note, mic key on the keyboard works here</label>
      <textarea defaultValue={value} disabled={locked} rows={2} placeholder={placeholder} onBlur={e => onSave({ [field]: e.target.value } as Partial<DailyReport>)} /></div>
  );
}

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
  const [sig, setSig] = useState<Blob | null>(null);
  const [active, setActive] = useState('1.1');
  const [newName, setNewName] = useState<Record<BucketKey, string>>({ internal: '', sub: '', temp: '' });
  const [yardCat, setYardCat] = useState(''); const [yardQty, setYardQty] = useState(''); const [yardNote, setYardNote] = useState('');

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

  const setBucket = (k: BucketKey, patch: Partial<CrewBucket>) => save({ crew: { ...r.crew, [k]: { ...r.crew[k], ...patch } } });
  const addName = async (k: BucketKey) => {
    const name = newName[k].trim(); if (!name) return;
    if (!crew.some(c => c.name.toLowerCase() === name.toLowerCase())) await db.crew.add({ id: uid('cm'), name, role: k });
    await setBucket(k, { names: [...r.crew[k].names, name] });
    setNewName({ ...newName, [k]: '' });
  };
  const addYard = async () => {
    if (!yardCat) { toast('Pick a category first.'); return; }
    await save({ yardWork: [...r.yardWork, { category: yardCat, qty: yardQty ? Number(yardQty) : undefined, note: yardNote || undefined }] });
    setYardCat(''); setYardQty(''); setYardNote('');
  };
  const submit = async () => {
    if (!r.crew.internal.names.length) { toast('Add at least one name under crew.'); setActive('1.6'); return; }
    if (!sig) { toast('Sign at the bottom first.'); setActive('sign'); return; }
    await save({ submittedBy: foreman, signature: sig, signedAt: Date.now() });
    toast('Report submitted and signed.');
  };
  const reopen = async () => { await save({ submittedBy: undefined, signature: undefined, signedAt: undefined }); setSig(null); toast('Report reopened.'); };
  const copyAll = () => window.EGE?.copy(fullText(ctx, job.name, nice), 'Report');
  const copySection = (num: string) => { const s = sections.find(x => x.num === num)!; window.EGE?.copy(s.text || '(nothing)', `Section ${num}`); };
  const jump = (num: string) => { setActive(num); document.getElementById('sec-' + num.replace('.', '-'))?.scrollIntoView({ block: 'start', behavior: 'smooth' }); };

  return (
    <div className="screen wide">
      <div className="toolbar">
        <button type="button" className="ege-btn" onClick={onBack}>&larr; Airfield</button>
        <h2 className="ege-h2" style={{ fontSize: 22, paddingBottom: 4 }}>Daily report, {nice}</h2>
        {locked ? <span className="ege-flag ok">Signed by {r.submittedBy} at {new Date(r.signedAt!).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span> : <span className="ege-flag info">Draft, saves as you go</span>}
        <span className="spacer" />
        <button type="button" className="ege-btn" onClick={copyAll}>Copy for Autodesk</button>
      </div>

      <div className="ege-main report-main">
        <aside className="ege-panel sticky cuepanel">
          <span className="ege-legend">Sections</span>
          <div className="ege-cues">
            {sections.map(s => <button key={s.num} type="button" className={'ege-cue' + (active === s.num ? ' on' : '') + (s.text ? ' done' : '')} onClick={() => jump(s.num)}><b>{s.num}</b><span>{s.title}</span></button>)}
            <button type="button" className={'ege-cue' + (active === 'sign' ? ' on' : '') + (locked ? ' done' : '')} onClick={() => jump('sign')}><b>Sign</b><span>Review and submit</span></button>
          </div>
          <div className="stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="stat"><div className="k">Taps</div><div className="v">{events.length}</div></div>
            <div className="stat"><div className="k">Photos</div><div className="v">{photos.length}</div></div>
            <div className={'stat' + (flags.length ? ' bad' : '')}><div className="k">Flags</div><div className="v">{flags.length}</div></div>
            <div className="stat"><div className="k">Carryover</div><div className="v">{carry.filter(c => !r.carryDone.includes(c.key)).length}</div></div>
          </div>
        </aside>

        <div className="ege-pane report-pane">
          <Card active={active} onActive={setActive} onCopy={copySection} num="1.1" title="Planned Scope of Work for Today" eg="Prefilled from yesterday's action plan. Tap the zones you're working today.">
            <div className="ege-field"><label>Zones planned today</label>
              <Chips locked={locked} options={zones.map(z => z.name)} value={r.plannedZoneIds.map(id => zones.find(z => z.id === id)?.name ?? '')} onPick={n => { const z = zones.find(x => x.name === n)!; save({ plannedZoneIds: toggle(r.plannedZoneIds, z.id) }); }} /></div>
            <Note locked={locked} onSave={save} value={r.plannedScope} field="plannedScope" placeholder="Work type, area, planned qty, crew assigned" />
          </Card>

          <Card active={active} onActive={setActive} onCopy={copySection} num="1.2" title="Work Executed" eg="Built from today's taps. Add yard work and lump sum progress here.">
            <Auto lines={wl.flatMap(w => [w.zone.name, ...w.lines.map(l => '   ' + l)])} empty="No parts tapped yet today. Open a zone from the airfield." />
            {lumps.length > 0 && (
              <div className="ege-field"><label>Lump sum items, percent complete</label>
                {lumps.map(l => (
                  <div key={l.id} className="lump"><span>{l.description}</span>
                    <div className="chips">{PERCENTS.map(p => <button key={p} type="button" disabled={locked} className={'chip' + ((l.percentComplete ?? 0) === p ? ' on' : '')} onClick={() => db.payItems.update(l.id, { percentComplete: p })}>{p}%</button>)}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="ege-field"><label>Yard and other work, no pin on the drawing</label>
              {r.yardWork.map((y, i) => <div key={i} className="autoline">{y.category}{y.qty ? `, ${y.qty}` : ''}{y.note ? `. ${y.note}` : ''} {!locked && <button type="button" className="ege-link" onClick={() => save({ yardWork: r.yardWork.filter((_, j) => j !== i) })}>remove</button>}</div>)}
              {!locked && (<>
                <Chips locked={locked} options={YARD} value={yardCat ? [yardCat] : []} onPick={v => setYardCat(v === yardCat ? '' : v)} />
                <div className="ege-row"><input type="number" inputMode="numeric" className="num" placeholder="Qty" value={yardQty} onChange={e => setYardQty(e.target.value)} style={{ width: 110 }} />
                  <input type="text" placeholder="Note (optional)" value={yardNote} onChange={e => setYardNote(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
                  <button type="button" className="ege-btn" onClick={addYard}>Add</button></div>
              </>)}
            </div>
            <div className="ege-field"><label>Photos, {photos.length} today</label>
              <PhotoStrip photos={photos} canDelete={!locked} />
              {!locked && <div><PhotoButton jobId={job.id} date={date} foreman={foreman} stamp={`1.2 Work Executed | ${job.airport}`} label="Take photo" /></div>}
            </div>
            <Note locked={locked} onSave={save} value={r.workNote} field="workNote" placeholder="Anything the taps don't say" />
          </Card>

          <Card active={active} onActive={setActive} onCopy={copySection} num="1.3" title="Outstanding / Carryover Work" eg="Parts touched today that aren't Complete, plus every open flag.">
            <Auto lines={carry.filter(c => !r.carryDone.includes(c.key)).map(c => `${c.zoneName ? c.zoneName + ', ' : ''}${c.text}`)} empty="Nothing carrying over." />
            <Note locked={locked} onSave={save} value={r.carryNote} field="carryNote" placeholder="Reason not completed, impact" />
          </Card>

          <Card active={active} onActive={setActive} onCopy={copySection} num="1.4" title="Delays and Issues" eg="Straight from the flags. Flag a part from its card to add one.">
            <Auto lines={sections[3].text ? sections[3].text.split('\n\n').filter(x => x !== r.delayNote) : []} empty="No open flags." />
            <Note locked={locked} onSave={save} value={r.delayNote} field="delayNote" placeholder="Anything not tied to a part" />
          </Card>

          <Card active={active} onActive={setActive} onCopy={copySection} num="1.5" title="Action Plan and Projection" eg="Check off what's handled, pick tomorrow's zones. This becomes tomorrow's 1.1.">
            <div className="ege-field"><label>Carryover, tap to mark handled</label>
              {carry.length ? carry.map(c => <button key={c.key} type="button" disabled={locked} className={'prow' + (r.carryDone.includes(c.key) ? ' sel' : '')} onClick={() => save({ carryDone: toggle(r.carryDone, c.key) })}><span className="chk">{r.carryDone.includes(c.key) ? '✓' : ''}</span><span className="lab">{c.text}<small>{c.zoneName}</small></span></button>) : <div className="autoline muted">Nothing to carry.</div>}
            </div>
            <div className="ege-field"><label>Zones for tomorrow</label>
              <Chips locked={locked} options={zones.map(z => z.name)} value={r.nextZoneIds.map(id => zones.find(z => z.id === id)?.name ?? '')} onPick={n => { const z = zones.find(x => x.name === n)!; save({ nextZoneIds: toggle(r.nextZoneIds, z.id) }); }} /></div>
            <Note locked={locked} onSave={save} value={r.actionPlan} field="actionPlan" placeholder="Recovery needed, materials, manning, timeline" />
          </Card>

          <Card active={active} onActive={setActive} onCopy={copySection} num="1.6" title="Crew and Production Summary" eg="Tap names into a bucket. Shift and lunch are presets.">
            {BUCKETS.map(b => { const bk = r.crew[b.key]; return (
              <div key={b.key} className="bucket">
                <span className="ege-legend">{b.title}</span>
                <div className="chips">
                  {bk.names.map(n => <button key={n} type="button" disabled={locked} className="chip on" onClick={() => setBucket(b.key, { names: bk.names.filter(x => x !== n) })}>{n} ✕</button>)}
                  {crew.filter(c => !bk.names.includes(c.name) && !Object.values(r.crew).some(x => x.names.includes(c.name))).map(c => <button key={c.id} type="button" disabled={locked} className="chip" onClick={() => setBucket(b.key, { names: [...bk.names, c.name] })}>+ {c.name}</button>)}
                </div>
                {!locked && <div className="ege-row"><input type="text" placeholder="Add a name" value={newName[b.key]} onChange={e => setNewName({ ...newName, [b.key]: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') addName(b.key); }} style={{ width: 220 }} /><button type="button" className="ege-btn small" onClick={() => addName(b.key)}>Add</button></div>}
                {bk.names.length > 0 && (
                  <div className="shiftrow">
                    <span>Start</span><Chips locked={locked} options={SHIFT_STARTS.map(fmtTime)} value={[fmtTime(bk.shiftStart)]} onPick={v => setBucket(b.key, { shiftStart: SHIFT_STARTS[SHIFT_STARTS.map(fmtTime).indexOf(v)] })} />
                    <span>End</span><Chips locked={locked} options={SHIFT_ENDS.map(fmtTime)} value={[fmtTime(bk.shiftEnd)]} onPick={v => setBucket(b.key, { shiftEnd: SHIFT_ENDS[SHIFT_ENDS.map(fmtTime).indexOf(v)] })} />
                    <span>Lunch</span><Chips locked={locked} options={['30', '60']} value={[String(bk.lunchMinutes)]} onPick={v => setBucket(b.key, { lunchMinutes: Number(v) })} />
                  </div>
                )}
              </div>
            ); })}
            <div className="ege-field"><label>Equipment on site</label>
              <Chips locked={locked} options={equipment.map(e => e.name)} value={equipment.filter(e => r.equipmentIds.includes(e.id)).map(e => e.name)} onPick={n => { const e = equipment.find(x => x.name === n)!; save({ equipmentIds: toggle(r.equipmentIds, e.id) }); }} /></div>
            <div className="ege-field"><label>Weather</label><Chips locked={locked} options={WEATHER} value={r.weather} onPick={v => save({ weather: toggle(r.weather, v) })} />
              <div className="chips">{[70, 80, 90, 100].map(t => <button key={t} type="button" disabled={locked} className={'chip' + (r.tempF === t ? ' on' : '')} onClick={() => save({ tempF: r.tempF === t ? undefined : t })}>{t}F</button>)}</div></div>
            <div className="ege-field"><label>Safety</label><Chips locked={locked} options={SAFETY} value={r.safety} onPick={v => save({ safety: toggle(r.safety, v) })} /></div>
            <div className="ege-field"><label>Visitors</label><Chips locked={locked} options={VISITORS} value={r.visitors} onPick={v => save({ visitors: toggle(r.visitors, v) })} /></div>
            <div className="ege-field"><label>General status, builds itself</label><Auto lines={status} empty="Nothing yet." /></div>
            <div className="ege-field"><label>Executive comment, optional</label>
              <textarea key="exec" defaultValue={r.executiveComment} disabled={locked} rows={3} placeholder="One paragraph if you want it. Mic key works." onBlur={e => save({ executiveComment: e.target.value })} /></div>
          </Card>

          <section id="sec-sign" className={'ege-card' + (active === 'sign' ? ' live' : '')}>
            <div className="ege-card-head" onClick={() => setActive('sign')}><span className="ege-card-num">✎</span><h3>Review and sign</h3></div>
            <p className="ege-card-eg">This is what goes to Autodesk, section by section.</p>
            <pre className="preview">{fullText(ctx, job.name, nice)}</pre>
            {locked ? (
              <div className="ege-row"><span className="ege-flag ok">Signed by {r.submittedBy}</span><button type="button" className="ege-btn" onClick={reopen}>Reopen to edit</button></div>
            ) : (
              <>
                <Signature onChange={setSig} />
                <div className="ege-row" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className="ege-btn accent" style={{ minHeight: 60, minWidth: 220 }} onClick={submit}>Submit and sign</button>
                </div>
              </>
            )}
          </section>
          <div className="barpad" />
        </div>
      </div>
    </div>
  );
}
