import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import PanZoom from '../components/PanZoom';
import PartCard, { ladderLabel } from './PartCard';
import { useOpenFlags, useSheets, useZoneParts, useSheetDark } from '../hooks/useJob';
import { useSheetSrc } from '../hooks/useSheetSrc';
import { db, setSetting } from '../db';
import { activeLadder, currentStep, setStep, stepName, zoneProgress } from '../lib/status';
import { toast } from '../ege/ege';
import { STEPS, type Step, type Zone } from '../types';

interface Props { zone: Zone; foreman: string; date: string; onBack: () => void }

const CAT_ORDER = ['fixture', 'sign', 'can', 'pole', 'regulator', 'equipment', 'handhole', 'manhole', 'conduit', 'duct', 'cable'];
const CAT_LABEL: Record<string, string> = { fixture: 'Lights', sign: 'Signs', can: 'Base cans', pole: 'Poles', regulator: 'Regulators', equipment: 'Equipment', handhole: 'Handholes', manhole: 'Manholes', conduit: 'Conduit', duct: 'Duct bank', cable: 'Cable' };
const MIN_W = 240;

export default function ZoneScreen({ zone, foreman, date, onBack }: Props) {
  const sheets = useSheets(zone.jobId);
  const sheet = sheets.find(s => s.id === zone.detailSheetId);
  const sheetSrc = useSheetSrc(sheet);
  const dark = useSheetDark();
  const parts = useZoneParts(zone.id);
  const flags = useOpenFlags(zone.jobId);
  const [openId, setOpenIdRaw] = useState<string | null>(null);
  const openedAt = useRef(0);
  const setOpenId = (id: string | null) => { if (id) openedAt.current = Date.now(); setOpenIdRaw(id); };
  const [bulk, setBulk] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'open' | 'flagged'>('all');
  const [focus, setFocus] = useState(false);

  // the list drawer: open or closed, pinned as a column or floating over the sheet, and how wide
  const prefs = useLiveQuery(async () => ({
    open: (await db.settings.get('list.open'))?.value, pinned: (await db.settings.get('list.pinned'))?.value, width: (await db.settings.get('list.width'))?.value,
  }), []);
  const [listOpen, setListOpen] = useState(window.innerWidth >= 900);
  const [pinned, setPinned] = useState(true);
  const [listW, setListW] = useState(340);
  const [dragW, setDragW] = useState<number | null>(null);
  useEffect(() => {
    if (!prefs) return;
    if (prefs.open) setListOpen(prefs.open === '1');
    if (prefs.pinned) setPinned(prefs.pinned === '1');
    if (prefs.width) setListW(Number(prefs.width));
  }, [prefs?.open, prefs?.pinned, prefs?.width]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleList = () => { const n = !listOpen; setListOpen(n); void setSetting('list.open', n ? '1' : '0'); };
  const togglePin = () => { const n = !pinned; setPinned(n); void setSetting('list.pinned', n ? '1' : '0'); };
  const maxW = () => Math.max(MIN_W, Math.min(window.innerWidth * 0.6, window.innerWidth - 80));
  const width = Math.min(maxW(), dragW ?? listW);

  // drag the grip to size the column
  const gripDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = width;
    const move = (ev: PointerEvent) => setDragW(Math.max(MIN_W, Math.min(maxW(), startW + (startX - ev.clientX))));
    const up = (ev: PointerEvent) => {
      const w = Math.max(MIN_W, Math.min(maxW(), startW + (startX - ev.clientX)));
      setDragW(null); setListW(w); void setSetting('list.width', String(Math.round(w)));
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const flagByPart = useMemo(() => new Map(flags.filter(f => f.partId).map(f => [f.partId!, f])), [flags]);
  const sorted = useMemo(() => [...parts].sort((a, b) => CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category) || a.label.localeCompare(b.label, undefined, { numeric: true })), [parts]);
  const shown = sorted.filter(p => filter === 'all' ? true : filter === 'flagged' ? flagByPart.has(p.id) : currentStep(p) < 4);
  const open = parts.find(p => p.id === openId);
  const pct = zoneProgress(parts);
  const openCount = parts.filter(p => currentStep(p) < 4).length;
  const lastEvent = useLiveQuery(() => db.events.orderBy('createdAt').reverse().first(), []);
  const popId = lastEvent && Date.now() - lastEvent.createdAt < 1500 ? lastEvent.partId : null;

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
  // an unpinned drawer gets out of the way when the sheet is touched
  const sheetTouched = () => { if (listOpen && !pinned) { setListOpen(false); void setSetting('list.open', '0'); } };

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
    <div className={'screen wide zone-screen' + (focus ? ' focus' : '')}>
      {focus && (
        <div className="floatbar">
          <button type="button" className="ege-btn" onClick={onBack}>&larr; Airfield</button>
          <span className="ege-tag">{zone.name} · {pct}%</span>
          <span className="spacer" />
          <button type="button" className="ege-btn" onClick={() => setFocus(false)}>Show bars</button>
        </div>
      )}
      <div className="toolbar">
        <button type="button" className="ege-btn" onClick={onBack}>&larr; Airfield</button>
        <h2 className="ege-h2" style={{ fontSize: 22, paddingBottom: 4 }}>{zone.name}</h2>
        <span className="ege-tag">{pct}% complete</span>
        <span className="spacer" />
        <button type="button" className={'ege-btn' + (bulk ? ' accent' : '')} onClick={() => { setBulk(b => !b); setSel(new Set()); }}>{bulk ? 'Cancel select' : 'Select many'}</button>
        <button type="button" className="ege-btn" onClick={() => setSetting('sheetLook', dark ? 'day' : 'night')}>{dark ? 'Daylight' : 'Night'}</button>
        <button type="button" className="ege-btn" onClick={() => setFocus(true)} title="Hide the bars, sheet only">Hide bars</button>
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

      <div className={'sheetwrap' + (listOpen ? ' open' : '') + (pinned ? ' pinned' : ' floating') + (dragW !== null ? ' sizing' : '')} style={{ ['--listw' as string]: `${width}px` }}>
        {sheet && (
          <div className="sheetarea" onPointerDownCapture={sheetTouched}>
            <PanZoom dark={dark} sheet={sheet} width={sheet.width} height={sheet.height} src={sheetSrc} resetKey={zone.id} hint={`${sheet.name} · pinch, drag, double tap`}>
              {pins}
            </PanZoom>
          </div>
        )}
        <button type="button" className="listtab" onClick={toggleList} aria-label={listOpen ? 'Hide list' : 'Show list'}>
          <span className="chev">{listOpen ? '›' : '‹'}</span>
          <span className="lbl">{listOpen ? 'Hide' : `List · ${openCount} open`}</span>
        </button>
        <aside className="drawer" aria-hidden={!listOpen}>
          <div className="grip" onPointerDown={gripDown} title="Drag to size" />
          <div className="drawerhead">
            <div className="seg">
              <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All {parts.length}</button>
              <button type="button" className={filter === 'open' ? 'on' : ''} onClick={() => setFilter('open')}>Open {openCount}</button>
              <button type="button" className={filter === 'flagged' ? 'on' : ''} onClick={() => setFilter('flagged')}>Flag {parts.filter(p => flagByPart.has(p.id)).length}</button>
            </div>
            <button type="button" className={'ege-btn small pinbtn' + (pinned ? ' primary' : '')} onClick={togglePin} aria-pressed={pinned} title={pinned ? 'Pinned as a column. Tap to let it float over the sheet.' : 'Floating. Tap to pin it beside the sheet.'}>{pinned ? 'Pinned' : 'Pin'}</button>
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
            {!shown.length && <div className="stub">{parts.length ? 'Nothing here.' : 'No pins on this sheet yet. Setup, Pins.'}</div>}
          </div>
        </aside>
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
