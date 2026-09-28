import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, today } from '../db';
import { toast } from '../ege/ege';
import { lockRollup, money, previewRollup, rollupCsv, type RollupPreview } from '../lib/billing';
import type { BillingRollup, Job } from '../types';

interface Props { job: Job; foreman: string; onBack: () => void }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function preset(kind: string): [string, string] {
  const now = new Date(); const t = today();
  if (kind === 'week') { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [iso(d), t]; }
  if (kind === 'lastweek') { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); const e = new Date(d); e.setDate(e.getDate() + 6); return [iso(d), iso(e)]; }
  if (kind === 'month') return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), t];
  if (kind === 'lastmonth') return [iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 0))];
  return ['2000-01-01', t];
}

// Office side. Foremen never see this. Unit prices live here and nowhere else on screen.
export default function BillingScreen({ job, foreman, onBack }: Props) {
  const [range, setRange] = useState<[string, string]>(preset('all'));
  const [which, setWhich] = useState('all');
  const [prev, setPrev] = useState<RollupPreview | null>(null);
  const [view, setView] = useState<BillingRollup | null>(null);
  const [armed, setArmed] = useState(false);
  const rollups = useLiveQuery(() => db.rollups.where('jobId').equals(job.id).reverse().sortBy('number'), [job.id]) ?? [];
  const eventCount = useLiveQuery(() => db.events.where('jobId').equals(job.id).count(), [job.id]) ?? 0;
  useEffect(() => { previewRollup(job.id, range[0], range[1]).then(setPrev); }, [job.id, range, rollups.length, eventCount]);

  const lock = async () => {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; }
    const r = await lockRollup(job.id, range[0], range[1], foreman || 'office');
    setArmed(false); toast(`Pay app ${r.number} locked, ${money(r.total)}.`); setView(r);
  };
  const download = (r: BillingRollup) => {
    const blob = new Blob([rollupCsv(r)], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${job.name.replace(/[^\w]+/g, '-')}-pay-app-${r.number}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  const Table = ({ lines, total }: { lines: BillingRollup['lines']; total: number }) => (
    <table className="paytable billtable">
      <thead><tr><th>Item</th><th>Spec</th><th>Description</th><th>Unit</th><th className="r">Bid</th><th className="r">This period</th><th className="r">Unit price</th><th className="r">Amount</th><th className="r">To date</th><th>What</th></tr></thead>
      <tbody>
        {lines.map(l => (
          <tr key={l.payItemId} className={l.qty < 0 ? 'credit' : ''}>
            <td className="mono">{l.itemNo}{l.subItemNo ? ` / ${l.subItemNo}` : ''}</td><td className="mono">{l.specRef}</td><td>{l.description}</td><td>{l.unit}</td>
            <td className="r mono">{l.bidQty}</td><td className="r mono">{l.billingType === 'lumpsum' ? `${l.qty}%` : l.qty}</td><td className="r mono">{money(l.unitPrice)}</td><td className="r mono"><b>{money(l.amount)}</b></td>
            <td className="r mono">{l.billingType === 'lumpsum' ? `${l.toDateQty}%` : `${l.toDateQty} (${l.bidQty ? Math.round((l.toDateQty / l.bidQty) * 100) : 0}%)`}</td>
            <td className="detail">{l.detail.join(', ')}</td>
          </tr>
        ))}
        {!lines.length && <tr><td colSpan={10} className="stub">Nothing billable in this window.</td></tr>}
      </tbody>
      <tfoot><tr><td colSpan={7} className="r"><b>Total</b></td><td className="r mono"><b>{money(total)}</b></td><td colSpan={2} /></tr></tfoot>
    </table>
  );

  return (
    <div className="screen wide">
      <div className="toolbar">
        <button type="button" className="ege-btn" onClick={onBack}>&larr; Airfield</button>
        <h2 className="ege-h2" style={{ fontSize: 22, paddingBottom: 4 }}>Billing, {job.name}</h2>
        <span className="ege-tag">{job.billingList === 'sub' ? 'Our subcontract SOV' : "Owner's bid schedule"}</span>
      </div>

      {view ? (<>
        <div className="toolbar">
          <button type="button" className="ege-btn" onClick={() => setView(null)}>&larr; Back to open work</button>
          <b style={{ fontFamily: 'Oswald', fontSize: 20 }}>Pay app {view.number}, {window.EGE?.niceDate(view.dateFrom)} to {window.EGE?.niceDate(view.dateTo)}</b>
          <span className="ege-flag ok">Locked {new Date(view.createdAt).toLocaleDateString()} by {view.createdBy}</span>
          <span className="spacer" />
          <button type="button" className="ege-btn primary" onClick={() => download(view)}>Download CSV</button>
        </div>
        <Table lines={view.lines} total={view.total} />
      </>) : (<>
        <div className="ege-field"><label>Window. Only taps not already in a locked pay app count.</label>
          <div className="bigchips">
            {[['all', 'Everything open'], ['week', 'This week'], ['lastweek', 'Last week'], ['month', 'This month'], ['lastmonth', 'Last month']].map(([k, l]) => <button key={k} type="button" className={'chip big' + (which === k ? ' on' : '')} onClick={() => { setWhich(k); setRange(preset(k)); }}>{l}</button>)}
            <input type="date" value={range[0]} onChange={e => { setWhich(''); setRange([e.target.value, range[1]]); }} />
            <input type="date" value={range[1]} onChange={e => { setWhich(''); setRange([range[0], e.target.value]); }} />
          </div>
        </div>
        {prev && <Table lines={prev.lines} total={prev.total} />}
        <div className="ege-row" style={{ justifyContent: 'flex-end' }}>
          <span className="ege-bar-note">Locking stamps every tap in this window so it can never bill again. Rolling a part back later makes a credit line.</span>
          <button type="button" className={'ege-btn' + (armed ? ' arm' : ' accent')} style={{ minHeight: 56 }} disabled={!prev || !prev.lines.length} onClick={lock}>{armed ? 'Tap again to lock' : `Lock as pay app ${rollups.length + 1}`}</button>
        </div>
        {rollups.length > 0 && (
          <div className="ege-field"><label>Locked pay apps</label>
            <div className="plist" style={{ maxHeight: 'none' }}>
              {rollups.map(r => <button key={r.id} type="button" className="prow" onClick={() => setView(r)}><span className="lab">Pay app {r.number}<small>{window.EGE?.niceDate(r.dateFrom)} to {window.EGE?.niceDate(r.dateTo)} · {r.lines.length} lines · {r.createdBy}</small></span><span className="st mono">{money(r.total)}</span></button>)}
            </div>
          </div>
        )}
      </>)}
    </div>
  );
}
