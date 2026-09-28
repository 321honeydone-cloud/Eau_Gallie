import { useEffect, useState } from 'react';
import { db, uid } from '../db';
import { PhotoButton, PhotoStrip, usePhotos } from '../components/Photos';
import { toast } from '../ege/ege';
import { activeLadder, currentStep, hasLadder, setStep, stepMeaning, stepName, workLabel } from '../lib/status';
import { FLAG_IMPACTS, FLAG_PARTIES, FLAG_REASONS, STEPS, type Flag, type Ladder, type Part, type Step } from '../types';

interface Props {
  part: Part;
  flag?: Flag;
  foreman: string;
  date: string;
  onClose: () => void;
  onNext?: () => void;
}

export default function PartCard({ part, flag, foreman, date, onClose, onNext }: Props) {
  const [ladder, setLadder] = useState<Ladder>(activeLadder(part));
  const [qty, setQty] = useState<number>(part.qtyDone ?? 0);
  const [note, setNote] = useState(part.note ?? '');
  const [flagging, setFlagging] = useState(false);
  const [reason, setReason] = useState(flag?.reason ?? '');
  const [party, setParty] = useState(flag?.party ?? '');
  const [impact, setImpact] = useState(flag?.impact ?? '');
  const [flagNote, setFlagNote] = useState(flag?.note ?? '');
  useEffect(() => { setLadder(activeLadder(part)); setQty(part.qtyDone ?? 0); setNote(part.note ?? ''); }, [part.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = currentStep(part, ladder);
  const isLinear = part.kind === 'linear';
  const photos = usePhotos(part.jobId, date, part.id);

  const tap = async (to: Step) => {
    await setStep({ part, ladder, toStep: to, foreman, reportDate: date, qtyDone: isLinear ? qty : undefined, note: note || undefined });
    toast(`${part.label}: ${stepName(to)}`);
    if (!isLinear) onClose();
  };
  const saveLinear = async () => {
    await setStep({ part, ladder, toStep: step, foreman, reportDate: date, qtyDone: qty, note: note || undefined });
    await db.parts.update(part.id, { qtyDone: qty, note });
    toast(`${part.label}: ${qty} LF at ${stepName(step)}`);
    onClose();
  };
  const saveNote = async () => { await db.parts.update(part.id, { note }); };

  const saveFlag = async () => {
    if (!reason || !party || !impact) { toast('Pick a reason, who, and the impact.'); return; }
    if (flag) await db.flags.update(flag.id, { reason, party, impact, note: flagNote });
    else await db.flags.add({ id: uid('fl'), jobId: part.jobId, partId: part.id, zoneId: part.zoneId, reason, party, impact, openedBy: foreman, openedAt: Date.now(), note: flagNote });
    toast('Flag saved. It shows up under Delays on the report.');
    setFlagging(false);
  };
  const clearFlag = async () => { if (flag) { await db.flags.update(flag.id, { closedAt: Date.now() }); toast('Flag cleared.'); } };

  return (
    <div className="pcard">
      <div className="head">
        <span className="lbl">{part.label}</span>
        <span className="ege-tag">{part.category}</span>
        <span className={'ege-tag' + (part.work !== 'install' ? ' warn' : '')}>{workLabel(part.work)}</span>
        {isLinear && <span className="ege-tag">{part.totalQty} LF total</span>}
      </div>

      {part.work === 're' && (
        <div className="seg">
          <button type="button" className={ladder === 'demo' ? 'on' : ''} onClick={() => setLadder('demo')}>Demo {part.demoStep === 4 ? '✓' : ''}</button>
          <button type="button" className={ladder === 'install' ? 'on' : ''} onClick={() => setLadder('install')}>Reinstall {part.installStep === 4 ? '✓' : ''}</button>
        </div>
      )}

      {flag && !flagging && (
        <div className="flagbox">
          <b>Flagged: {flag.reason}</b>
          <span>{flag.party} · {flag.impact}{flag.note ? ` · ${flag.note}` : ''}</span>
          <div className="ege-row">
            <button type="button" className="ege-btn small" onClick={() => setFlagging(true)}>Edit flag</button>
            <button type="button" className="ege-btn small" onClick={clearFlag}>Clear flag</button>
          </div>
        </div>
      )}

      {!flagging && (
        <>
          <div className="steps">
            {STEPS.map(s => (
              <button key={s} type="button" className={`stepbtn s${s}` + (s === step ? ' on' : '') + (s < step ? ' done' : '')} onClick={() => tap(s)}>
                <span className="n">{s}</span>
                <b>{stepName(s)}</b>
                <span>{stepMeaning(part, ladder, s)}</span>
              </button>
            ))}
          </div>

          {isLinear && (
            <div className="ege-field">
              <label>Footage done at this step</label>
              <div className="qty-row">
                <input type="number" inputMode="numeric" className="num" value={qty} onChange={e => setQty(Math.max(0, Number(e.target.value)))} />
                <span className="ege-mono">of {part.totalQty} LF</span>
                {[50, 100, 250].map(n => <button key={n} type="button" className="ege-btn bump" onClick={() => setQty(q => Math.min(part.totalQty ?? 1e9, q + n))}>+{n}</button>)}
                <button type="button" className="ege-btn bump" onClick={() => setQty(part.totalQty ?? 0)}>All</button>
              </div>
            </div>
          )}

          <div className="ege-field">
            <label>Note (optional, use the mic key on the keyboard)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} onBlur={saveNote} rows={2} placeholder="Anything the office should know about this one" />
          </div>

          <PhotoStrip photos={photos} canDelete />
          <div className="ege-bar" style={{ position: 'static', padding: 0, border: 'none', justifyContent: 'flex-start' }}>
            <PhotoButton jobId={part.jobId} date={date} foreman={foreman} partId={part.id} zoneId={part.zoneId} stamp={`${part.label} | 1.2 Work Executed`} label={photos.length ? `Photo (${photos.length})` : 'Photo'} />
            {!flag && <button type="button" className="ege-btn" onClick={() => setFlagging(true)}>Flag a problem</button>}
            <span className="ege-bar-note" />
            {onNext && <button type="button" className="ege-btn" onClick={onNext}>Next part</button>}
            {isLinear ? <button type="button" className="ege-btn primary" onClick={saveLinear}>Save</button>
              : <button type="button" className="ege-btn primary" onClick={onClose}>Close</button>}
          </div>
        </>
      )}

      {flagging && (
        <>
          <div className="ege-field"><label>What's wrong</label>
            <div className="chips">{FLAG_REASONS.map(r => <button key={r} type="button" className={'chip bad' + (reason === r ? ' on' : '')} onClick={() => setReason(r)}>{r}</button>)}</div></div>
          <div className="ege-field"><label>Who owns it</label>
            <div className="chips">{FLAG_PARTIES.map(r => <button key={r} type="button" className={'chip' + (party === r ? ' on' : '')} onClick={() => setParty(r)}>{r}</button>)}</div></div>
          <div className="ege-field"><label>Schedule impact</label>
            <div className="chips">{FLAG_IMPACTS.map(r => <button key={r} type="button" className={'chip' + (impact === r ? ' on' : '')} onClick={() => setImpact(r)}>{r}</button>)}</div></div>
          <div className="ege-field"><label>Note (optional)</label>
            <textarea value={flagNote} onChange={e => setFlagNote(e.target.value)} rows={2} /></div>
          <div className="ege-row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="ege-btn" onClick={() => setFlagging(false)}>Back</button>
            <button type="button" className="ege-btn accent" onClick={saveFlag}>Save flag</button>
          </div>
        </>
      )}
    </div>
  );
}

export function ladderLabel(part: Part): string {
  const l = activeLadder(part);
  const s = currentStep(part, l);
  return (hasLadder(part, 'demo') && l === 'demo' ? 'Demo ' : '') + stepName(s);
}
