import { useEffect, useMemo, useRef, useState } from 'react';
import PanZoom from '../components/PanZoom';
import { useSheetSrc } from '../hooks/useSheetSrc';
import PartCard, { ladderLabel } from './PartCard';
import { useOpenFlags, useSheets, useZoneParts, useSheetDark } from '../hooks/useJob';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, setSetting } from '../db';
import { activeLadder, currentStep, setStep, stepName, zoneProgress } from '../lib/status';
import { toast } from '../ege/ege';
import { STEPS, type Step, type Zone } from '../types';

interface Props { zone: Zone; foreman: string; date: string; onBack: () => void }
type Mode = 'both' | 'pins' | 'list';

const CAT_ORDER = ['fixture', 'sign', 'can', 'pole', 'regulator', 'equipment', 'handhole', 'manhole', 'conduit', 'duct', 'cable'];
const CAT_LABEL: Record<string, string> = { fixture: 'Lights', sign: 'Signs', can: 'Base cans', pole: 'Poles', regulator: 'Regulators', equipment: 'Equipment', handhole: 'Handholes', manhole: 'Manholes', conduit: 'Conduit', duct: 'Duct bank', cable: 'Cable' };

export default function ZoneScreen({ zone, foreman, date, onBack }: Props) {
  const sheets = useSheets(zone.jobId);
  const sheet = sheets.find(s => s.id === zone.detailSheetId);
  const sheetSrc = useSheetSrc(sheet);
  const dark = useSheetDark();
  // the part that changed most recently gets a pop, so the tap has a visible answer on the sheet
  const lastEvent = useLiveQuery(() => db.events.orderBy('createdAt').reverse().first(), []);
  const popId = lastEvent && Date.now() - lastEvent.createdAt < 1500 ? lastEvent.partId : null;
  const parts = useZoneParts(zone.id);
  const flags = useOpenFlags(zone.jobId);
  const [mode, setMode] = useState<Mode>(() => (window.innerWidth < 900 ? 'pins' : 'both'));
  const [openId, setOpenIdRaw] = useState<string | null>(null);
  const openedAt = useRef(0);
  const setOpenId = (id: string | null) => { if (id) openedAt.current = Date.now(); setOpenIdRaw(id); };
  const [bulk, setBulk] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'open' | 'flagged'>('all');

  const flagByPart = useMemo(() => new Map(flags.filter(f => f.partId).map(f => [f.partId!, f])), [flags]);
  const sorted = useMemo(() => [...parts].sort((a, b) => CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category) || a.label.localeCompare(b.label, undefined, { numeric: true })), [parts]);
  const shown = sorted.filter(p => filter === 'all' ? true : filter === 'flagged' ? flagByPart.has(p.id) : currentStep(p) < 4);
  const open = parts.find(p => p.id === openId);
  const pct = zoneProgress(parts);

  // keep the screen awake while a foreman is working a zone
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then(l => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, []);

  const nextAfter = (id: string) => {
    const i = shown.findIndex(p => p.id === id);
    const n = shown.slice(i + 1).find(p => currentStep(p) < 4) ?? shown.find(p => currentStep(p) < 4 && p.id !== id);
    if (n) setOpenId(n.id); else { setOpenId(null); toast('Nothing left open in this zone.'); }
  };

  const toggleSel = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bulkSet = async (to: Step) => {
    const targets = parts.filter(p => sel.has(p.id));
    for (const p of targets) await setStep({ part: p, ladder: activeLadder(p), toStep: to, foreman, reportDate: date });
    toast(`${targets.length} parts set to ${stepName(to)}`);
    setSel(new Set()); setBulk(false);
  };

  const onTap = (id: string) => { if (bulk) toggleSel(id); else setOpenId(id); };

  const pins = sheet && parts.filter(p => p.x !== undefined).map(p => {
    const s = currentStep(p);
    const cls = ['pin', `s${s}`, flagByPart.has(p.id) ? 'flagged' : '', activeLadder(p) === 'demo' ? 'demo' : '', sel.has(p.id) ? 'selected' : '', ['handhole', 'manhole', 'regulator', 'sign'].includes(p.category) ? 'sq' : '', popId === p.id ? 'pop' : ''].join(' ');
    return (
      <button key={p.id} type="button" className={cls} style={{ left: `${p.x}%`, top: `${p.y}%` }} aria-label={p.label} onClick={() => onTap(p.id)}>
        <i>{s}</i>
      </button>
    );
  });

  return (
    <div className="screen wide">
      <div className="toolbar">
        <button type="button" className="ege-btn" onClick={onBack}>&larr; Airfield</button>
        <h2 className="ege-h2" style={{ fontSize: 22, paddingBottom: 4 }}>{zone.name}</h2>
        <span className="ege-tag">{pct}% complete</span>
        <span className="spacer" />
        <div className="seg">
          <button type="button" className={mode === 'both' ? 'on' : ''} onClick={() => setMode('both')}>Both</button>
          <button type="button" className={mode === 'pins' ? 'on' : ''} onClick={() => setMode('pins')}>Sheet</button>
          <button type="button" className={mode === 'list' ? 'on' : ''} onClick={() => setMode('list')}>List</button>
        </div>
        <button type="button" className={'ege-btn' + (bulk ? ' accent' : '')} onClick={() => { setBulk(b => !b); setSel(new Set()); }}>{bulk ? 'Cancel select' : 'Select many'}</button>
        <button type="button" className="ege-btn" onClick={() => setSetting('sheetLook', dark ? 'day' : 'night')}>{dark ? 'Daylight' : 'Night'}</button>
      </div>

      {bulk && (
        <div className="ege-tip">
          <b>{sel.size} selected.</b> Tap pins or rows, then pick the step for all of them:
          <div className="chips" style={{ marginTop: 8 }}>
            {STEPS.map(s => <button key={s} type="button" className="chip" disabled={!sel.size} onClick={() => bulkSet(s)}>{s} {stepName(s)}</button>)}
          </div>
        </div>
      )}

      <div className="legend">
        {STEPS.map(s => <span key={s}><span className="sw" style={{ background: `var(--step${s})` }} />{stepName(s)}</span>)}
        <span><span className="sw" style={{ background: '#fff', boxShadow: '0 0 0 3px var(--ege-red)' }} />Flagged</span>
        <span><span className="sw" style={{ background: '#fff', border: '2px dashed var(--ege-navy2)' }} />Demo</span>
      </div>

      <div className={'zone-layout' + (mode === 'list' ? ' list-only' : mode === 'pins' ? ' pins-only' : '')}>
        {mode !== 'list' && sheet && (
          <PanZoom dark={dark} width={sheet.width} height={sheet.height} src={sheetSrc} resetKey={zone.id} hint={`${sheet.name} · pinch, drag, double tap`}>
            {pins}
          </PanZoom>
        )}
        {mode !== 'pins' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
            <div className="seg">
              <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All {parts.length}</button>
              <button type="button" className={filter === 'open' ? 'on' : ''} onClick={() => setFilter('open')}>Not done {parts.filter(p => currentStep(p) < 4).length}</button>
              <button type="button" className={filter === 'flagged' ? 'on' : ''} onClick={() => setFilter('flagged')}>Flagged {parts.filter(p => flagByPart.has(p.id)).length}</button>
            </div>
            <div className="plist">
              {CAT_ORDER.filter(c => shown.some(p => p.category === c)).map(c => (
                <div key={c}>
                  <div className="group">{CAT_LABEL[c]}</div>
                  {shown.filter(p => p.category === c).map(p => {
                    const s = currentStep(p);
                    return (
                      <button key={p.id} type="button" className={'prow' + (sel.has(p.id) ? ' sel' : '')} onClick={() => onTap(p.id)}>
                        {bulk && <span className="chk">{sel.has(p.id) ? '✓' : ''}</span>}
                        <span className={`dot s${s}` + (flagByPart.has(p.id) ? ' flagged' : '')}>{s}</span>
                        <span className="lab">{p.label}{p.kind === 'linear' && <small>{p.qtyDone ?? 0} of {p.totalQty} LF</small>}{flagByPart.has(p.id) && <small style={{ color: 'var(--ege-bad)' }}>{flagByPart.get(p.id)!.reason}</small>}</span>
                        <span className="st">{ladderLabel(p)}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {!shown.length && <div className="stub">Nothing here.</div>}
            </div>
          </div>
        )}
      </div>

      {open && (
        <div className="ege-sheet" role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget && Date.now() - openedAt.current > 450) setOpenId(null); }}>
          <div className="ege-sheet-box">
            <PartCard part={open} flag={flagByPart.get(open.id)} foreman={foreman} date={date} onClose={() => setOpenId(null)} onNext={() => nextAfter(open.id)} />
          </div>
        </div>
      )}
    </div>
  );
}
