import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../../db';
import { toast } from '../../ege/ege';
import PanZoom from '../../components/PanZoom';
import { useSheetSrc } from '../../hooks/useSheetSrc';
import type { Zone } from '../../types';

interface Props { jobId: string }

export default function AdminZones({ jobId }: Props) {
  const sheets = useLiveQuery(() => db.sheets.where('jobId').equals(jobId).sortBy('order'), [jobId]) ?? [];
  const phases = useLiveQuery(() => db.phases.where('jobId').equals(jobId).sortBy('order'), [jobId]) ?? [];
  const zones = useLiveQuery(() => db.zones.where('jobId').equals(jobId).toArray(), [jobId]) ?? [];
  const overview = sheets.find(s => s.isOverview);
  const src = useSheetSrc(overview);
  const [drawing, setDrawing] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [newPhase, setNewPhase] = useState('');
  const selZone = zones.find(z => z.id === sel);

  const addPhase = async () => {
    const name = newPhase.trim(); if (!name) return;
    await db.phases.add({ id: uid('ph'), jobId, name, order: phases.length + 1 }); setNewPhase('');
  };
  const onDraw = async (r: { x1: number; y1: number; x2: number; y2: number }) => {
    if (!overview) return;
    if (r.x2 - r.x1 < 1 || r.y2 - r.y1 < 1) return;
    if (!phases.length) { toast('Add a phase first, even if it is just Phase 1.'); return; }
    const z: Zone = {
      id: uid('z'), jobId, phaseId: phases[0].id, name: `Zone ${zones.length + 1}`,
      overviewSheetId: overview.id, detailSheetId: overview.id,
      shape: [{ x: r.x1, y: r.y1 }, { x: r.x2, y: r.y1 }, { x: r.x2, y: r.y2 }, { x: r.x1, y: r.y2 }],
    };
    await db.zones.add(z); setSel(z.id); setDrawing(false);
    toast('Zone drawn. Name it and pick its detail sheet.');
  };
  const update = (patch: Partial<Zone>) => sel && db.zones.update(sel, patch);
  const remove = async () => {
    if (!sel) return;
    const n = await db.parts.where('zoneId').equals(sel).count();
    if (n) { toast(`This zone has ${n} pins. Delete those first.`); return; }
    await db.zones.delete(sel); setSel(null);
  };

  if (!overview) return <div className="ege-banner">Pick an overview sheet on the Plan sheets step first.</div>;

  return (
    <>
      <div className="ege-field"><label>Phases (a phase is a group of zones)</label>
        <div className="ege-row">
          {phases.map(p => <span key={p.id} className="chip big on">{p.name}</span>)}
          <input type="text" placeholder="Phase 1, Taxiway A" value={newPhase} onChange={e => setNewPhase(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addPhase(); }} style={{ minHeight: 52, fontSize: 16, width: 260, border: '1px solid var(--ege-line)', borderRadius: 3, padding: '6px 10px' }} />
          <button type="button" className="ege-btn" onClick={addPhase}>Add phase</button>
        </div>
      </div>

      <div className="toolbar">
        <button type="button" className={'ege-btn' + (drawing ? ' accent' : ' primary')} style={{ minHeight: 56 }} onClick={() => setDrawing(d => !d)}>{drawing ? 'Cancel drawing' : '+ Draw a zone'}</button>
        <span className="mode-tip">{drawing ? 'Drag a box on the overview around the area. Pinch still zooms.' : 'Tap a zone to edit it. Drag on the sheet to pan.'}</span>
      </div>

      <div className="zone-layout">
        <PanZoom width={overview.width} height={overview.height} src={src} resetKey={overview.id} onDrawRect={drawing ? onDraw : undefined} hint={overview.name}>
          <svg viewBox={`0 0 ${overview.width} ${overview.height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            {zones.map(z => {
              const pts = z.shape.map(p => `${(p.x / 100) * overview.width},${(p.y / 100) * overview.height}`).join(' ');
              const x0 = (Math.min(...z.shape.map(p => p.x)) / 100) * overview.width, y0 = (Math.min(...z.shape.map(p => p.y)) / 100) * overview.height;
              return (
                <g key={z.id} className="zone-tap" onClick={() => { if (!drawing) setSel(z.id); }} style={{ cursor: 'pointer' }}>
                  <polygon className={'zone-rect' + (sel === z.id ? ' on' : '')} points={pts} />
                  <text className="zone-label" x={x0 + 12} y={y0 + 40}>{z.name}</text>
                </g>
              );
            })}
          </svg>
        </PanZoom>
        <div className="pinform">
          {selZone ? (<>
            <div className="ege-field"><label>Zone name</label><input type="text" value={selZone.name} onChange={e => update({ name: e.target.value })} placeholder="E-108 Taxiway A West" /></div>
            <div className="ege-field"><label>Phase</label>
              <div className="bigchips">{phases.map(p => <button key={p.id} type="button" className={'chip big' + (selZone.phaseId === p.id ? ' on' : '')} onClick={() => update({ phaseId: p.id })}>{p.name}</button>)}</div></div>
            <div className="ege-field"><label>Detail sheet the foreman sees for this zone</label>
              <select value={selZone.detailSheetId} onChange={e => update({ detailSheetId: e.target.value })}>
                {sheets.map(s => <option key={s.id} value={s.id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>)}
              </select></div>
            <div className="ege-row"><button type="button" className="ege-btn" onClick={remove}>Delete zone</button><button type="button" className="ege-btn primary" onClick={() => setSel(null)}>Done</button></div>
          </>) : (
            <div className="admin-list">
              {zones.map(z => <button key={z.id} type="button" className="choice" onClick={() => setSel(z.id)}><b>{z.name}</b><span>{phases.find(p => p.id === z.phaseId)?.name ?? 'no phase'} · {sheets.find(s => s.id === z.detailSheetId)?.name ?? 'no sheet'}</span></button>)}
              {!zones.length && <div className="stub">No zones yet. Tap Draw a zone, then drag a box on the overview.</div>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
