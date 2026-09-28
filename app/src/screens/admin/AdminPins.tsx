import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, removeRow } from '../../db';
import { toast } from '../../ege/ege';
import PanZoom from '../../components/PanZoom';
import { useSheetSrc } from '../../hooks/useSheetSrc';
import { STEP_NAMES, type Part, type PartCategory, type PartKind, type PayItem, type Step, type WorkType, type PayLink } from '../../types';

interface Props { jobId: string }

const CATS: { key: PartCategory; label: string; kind: PartKind }[] = [
  { key: 'fixture', label: 'Light', kind: 'point' }, { key: 'sign', label: 'Sign', kind: 'point' }, { key: 'can', label: 'Base can', kind: 'point' },
  { key: 'handhole', label: 'Handhole', kind: 'point' }, { key: 'manhole', label: 'Manhole', kind: 'point' }, { key: 'regulator', label: 'Regulator', kind: 'point' },
  { key: 'pole', label: 'Pole', kind: 'point' }, { key: 'equipment', label: 'Equipment', kind: 'point' },
  { key: 'conduit', label: 'Conduit run', kind: 'linear' }, { key: 'duct', label: 'Duct bank', kind: 'linear' }, { key: 'cable', label: 'Cable run', kind: 'linear' },
];

// Bump the trailing number on a label: TWA-N05 becomes TWA-N06.
function nextLabel(label: string): string {
  const m = label.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return label;
  const n = String(Number(m[2]) + 1).padStart(m[2].length, '0');
  return `${m[1]}${n}${m[3]}`;
}

type Tpl = { label: string; category: PartCategory; work: WorkType; installPay: PayLink[]; demoPay: PayLink[]; totalQty?: number };

function PayPicker({ links, onChange, payItems }: { links: PayLink[]; onChange: (l: PayLink[]) => void; payItems: PayItem[] }) {
  return (
    <div className="admin-list">
      {links.map((l, i) => (
        <div key={i} className="ege-row">
          <select value={l.payItemId} onChange={e => onChange(links.map((x, j) => (j === i ? { ...x, payItemId: e.target.value } : x)))} style={{ flex: 1 }}>
            {payItems.map(p => <option key={p.id} value={p.id}>{p.itemNo} {p.specRef} {p.description} ({p.unit})</option>)}
          </select>
          <span style={{ fontSize: 13 }}>bills at</span>
          <select value={l.billAtStep} onChange={e => onChange(links.map((x, j) => (j === i ? { ...x, billAtStep: Number(e.target.value) as Step } : x)))}>
            {[1, 2, 3, 4].map(s => <option key={s} value={s}>{STEP_NAMES[s]}</option>)}
          </select>
          <button type="button" className="ege-btn small" onClick={() => onChange(links.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      {payItems.length ? <button type="button" className="ege-btn small" onClick={() => onChange([...links, { payItemId: payItems[0].id, billAtStep: 4 }])}>+ Pay item</button> : <span className="ege-bar-note">Add pay items on the Pay items step first.</span>}
    </div>
  );
}

function PinForm({ value, onChange, isTemplate, payItems }: { value: Tpl; onChange: (v: Tpl) => void; isTemplate: boolean; payItems: PayItem[] }) {
  const kind = CATS.find(c => c.key === value.category)!.kind;
  return (
    <div className="pinform">
      <div className="ege-field"><label>{isTemplate ? 'Label for the next pin (the number bumps itself)' : 'Label'}</label><input type="text" value={value.label} onChange={e => onChange({ ...value, label: e.target.value })} /></div>
      <div className="ege-field"><label>Part type</label>
        <div className="bigchips">{CATS.map(c => <button key={c.key} type="button" className={'chip big' + (value.category === c.key ? ' on' : '')} onClick={() => onChange({ ...value, category: c.key })}>{c.label}</button>)}</div></div>
      <div className="ege-field"><label>Work</label>
        <div className="bigchips">{(['install', 'demo', 're'] as WorkType[]).map(w => <button key={w} type="button" className={'chip big' + (value.work === w ? ' on' : '')} onClick={() => onChange({ ...value, work: w })}>{w === 're' ? 'Remove and reinstall' : w === 'demo' ? 'Demo' : 'Install'}</button>)}</div></div>
      {kind === 'linear' && <div className="ege-field"><label>Total length, LF</label><input type="number" inputMode="numeric" value={value.totalQty ?? ''} onChange={e => onChange({ ...value, totalQty: Number(e.target.value) || undefined })} /></div>}
      {value.work !== 'demo' && <div className="ege-field"><label>Install bills these pay items</label><PayPicker payItems={payItems} links={value.installPay} onChange={l => onChange({ ...value, installPay: l })} /></div>}
      {value.work !== 'install' && <div className="ege-field"><label>Demo bills these pay items</label><PayPicker payItems={payItems} links={value.demoPay} onChange={l => onChange({ ...value, demoPay: l })} /></div>}
    </div>
  );
}

export default function AdminPins({ jobId }: Props) {
  const zones = useLiveQuery(() => db.zones.where('jobId').equals(jobId).toArray(), [jobId]) ?? [];
  const sheets = useLiveQuery(() => db.sheets.where('jobId').equals(jobId).toArray(), [jobId]) ?? [];
  const payItems = useLiveQuery(() => db.payItems.where('jobId').equals(jobId).toArray(), [jobId]) ?? [];
  const [zoneId, setZoneId] = useState<string | null>(null);
  const zone = zones.find(z => z.id === zoneId);
  const parts = useLiveQuery(() => (zoneId ? db.parts.where('zoneId').equals(zoneId).toArray() : []), [zoneId]) ?? [];
  const sheet = sheets.find(s => s.id === zone?.detailSheetId);
  const src = useSheetSrc(sheet);
  const [sel, setSel] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [moving, setMoving] = useState(false);
  // the template for the next pin, so a row of lights is tap tap tap
  const [tpl, setTpl] = useState<Tpl>({ label: 'L-01', category: 'fixture', work: 'install', installPay: [], demoPay: [] });
  const selPart = parts.find(p => p.id === sel);
  const payById = useMemo(() => new Map(payItems.map(p => [p.id, p])), [payItems]);

  const place = async (pt: { x: number; y: number }) => {
    if (moving && sel) { await db.parts.update(sel, { x: pt.x, y: pt.y }); setMoving(false); toast('Moved.'); return; }
    if (!placing || !zone) return;
    const kind = CATS.find(c => c.key === tpl.category)!.kind;
    const p: Part = { id: uid('pt'), jobId, zoneId: zone.id, label: tpl.label, category: tpl.category, kind, work: tpl.work, x: pt.x, y: pt.y, installPay: tpl.installPay, demoPay: tpl.demoPay, installStep: 0, demoStep: 0, totalQty: kind === 'linear' ? tpl.totalQty : undefined };
    await db.parts.add(p);
    setTpl(t => ({ ...t, label: nextLabel(t.label) }));
  };
  const update = (patch: Partial<Part>) => sel && db.parts.update(sel, patch);
  const remove = async () => { if (!sel) return; await removeRow('parts', sel, jobId); setSel(null); };
  const useAsTemplate = (p: Part) => { setTpl({ label: nextLabel(p.label), category: p.category, work: p.work, installPay: p.installPay, demoPay: p.demoPay, totalQty: p.totalQty }); setPlacing(true); setSel(null); };

  if (!zone) return (
    <div className="choice-grid">
      {zones.map(z => <button key={z.id} type="button" className="choice" onClick={() => setZoneId(z.id)}><b>{z.name}</b><span>{sheets.find(s => s.id === z.detailSheetId)?.name ?? 'no sheet'}</span></button>)}
      {!zones.length && <div className="stub">Draw zones first.</div>}
    </div>
  );
  if (!sheet) return <div className="ege-banner">This zone has no detail sheet. Fix it on the Zones step.</div>;

  return (
    <>
      <div className="toolbar">
        <button type="button" className="ege-btn" onClick={() => { setZoneId(null); setSel(null); setPlacing(false); }}>&larr; Zones</button>
        <b style={{ fontFamily: 'Oswald', fontSize: 20 }}>{zone.name}</b>
        <span className="ege-tag">{parts.length} pins</span>
        <span className="spacer" />
        <button type="button" className={'ege-btn' + (placing ? ' accent' : ' primary')} style={{ minHeight: 56 }} onClick={() => { setPlacing(p => !p); setSel(null); setMoving(false); }}>{placing ? 'Stop placing' : '+ Place pins'}</button>
      </div>
      <div className="mode-tip">{moving ? 'Tap the sheet where this pin should go.' : placing ? `Tap the sheet to drop "${tpl.label}". Each tap bumps the number. Set the type and pay items on the right first.` : 'Tap a pin to edit it. Drag to pan, pinch to zoom.'}</div>
      <div className="zone-layout">
        <PanZoom sheet={sheet} width={sheet.width} height={sheet.height} src={src} resetKey={zone.id} onTapStage={placing || moving ? place : undefined} hint={sheet.name}>
          {parts.filter(p => p.x !== undefined).map(p => (
            <button key={p.id} type="button" className={'pin s0' + (sel === p.id ? ' selected' : '') + (p.work !== 'install' ? ' demo' : '') + (['handhole', 'manhole', 'regulator', 'sign'].includes(p.category) ? ' sq' : '')} style={{ left: `${p.x}%`, top: `${p.y}%` }} aria-label={p.label} onClick={() => { if (!placing) { setSel(p.id); setMoving(false); } }}><i>{p.label.replace(/^\D+/, '').slice(-2) || '•'}</i></button>
          ))}
        </PanZoom>
        <div>
          {selPart ? (<>
            <PinForm payItems={payItems} value={{ label: selPart.label, category: selPart.category, work: selPart.work, installPay: selPart.installPay, demoPay: selPart.demoPay, totalQty: selPart.totalQty }} onChange={v => update({ ...v, kind: CATS.find(c => c.key === v.category)!.kind })} isTemplate={false} />
            <div className="ege-row" style={{ marginTop: 10 }}>
              <button type="button" className="ege-btn" onClick={remove}>Delete pin</button>
              <button type="button" className={'ege-btn' + (moving ? ' accent' : '')} onClick={() => setMoving(m => !m)}>{moving ? 'Cancel move' : 'Move pin'}</button>
              <button type="button" className="ege-btn" onClick={() => useAsTemplate(selPart)}>Place more like this</button>
              <button type="button" className="ege-btn primary" onClick={() => setSel(null)}>Done</button>
            </div>
          </>) : placing ? (
            <PinForm payItems={payItems} value={tpl} onChange={setTpl} isTemplate />
          ) : (
            <div className="plist" style={{ maxHeight: 520 }}>
              {parts.map(p => <button key={p.id} type="button" className="prow" onClick={() => setSel(p.id)}><span className="lab">{p.label}<small>{p.category} · {p.work}{p.x === undefined ? ' · no pin, list only' : ''} · {[...p.installPay, ...p.demoPay].map(l => payById.get(l.payItemId)?.itemNo ?? '?').join(', ') || 'no pay item'}</small></span></button>)}
              {!parts.length && <div className="stub">No pins in this zone. Tap Place pins.</div>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
