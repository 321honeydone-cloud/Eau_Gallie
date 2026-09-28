import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, removeRow } from '../../db';
import { toast } from '../../ege/ege';
import type { BillingType, PayItem } from '../../types';

interface Props { jobId: string }

const guessType = (unit: string): BillingType => (/^LS$/i.test(unit) ? 'lumpsum' : /^AL/i.test(unit) ? 'allowance' : 'unit');

// Paste from Excel (tabs) or a CSV. Header row optional. Columns in any order if there is a header.
function parseRows(text: string): Partial<PayItem>[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const split = (l: string) => l.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
  let rows = lines.map(split);
  const head = rows[0].map(h => h.toLowerCase());
  const find = (...names: string[]) => head.findIndex(h => names.some(n => h.includes(n)));
  let idx = { itemNo: 0, specRef: 1, description: 2, bidQty: 3, unit: 4, unitPrice: 5, subItemNo: -1 };
  const hasHeader = head.some(h => /item|desc|unit|qty|quant|price|spec/.test(h));
  if (hasHeader) {
    idx = { itemNo: find('item no', 'item #', 'item'), specRef: find('spec'), description: find('desc'), bidQty: find('qty', 'quant'), unit: find('unit'), unitPrice: find('price'), subItemNo: find('sub') };
    if (idx.unit === idx.unitPrice) idx.unit = head.findIndex((h, i) => h.includes('unit') && i !== idx.unitPrice);
    rows = rows.slice(1);
  }
  const num = (s?: string) => Number(String(s ?? '').replace(/[^0-9.\-]/g, '')) || 0;
  return rows.map(r => {
    const unit = (idx.unit >= 0 ? r[idx.unit] : '') ?? '';
    return { itemNo: r[idx.itemNo] ?? '', subItemNo: idx.subItemNo >= 0 ? r[idx.subItemNo] : undefined, specRef: idx.specRef >= 0 ? r[idx.specRef] ?? '' : '', description: r[idx.description] ?? '', unit, billingType: guessType(unit), bidQty: num(r[idx.bidQty]), unitPrice: num(r[idx.unitPrice]) };
  }).filter(r => r.description);
}

export default function AdminPay({ jobId }: Props) {
  const items = useLiveQuery(() => db.payItems.where('jobId').equals(jobId).toArray(), [jobId]) ?? [];
  const sorted = [...items].sort((a, b) => a.itemNo.localeCompare(b.itemNo, undefined, { numeric: true }));
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const update = (id: string, patch: Partial<PayItem>) => db.payItems.update(id, patch);
  const add = () => db.payItems.add({ id: uid('pi'), jobId, itemNo: String(items.length + 1), specRef: '', description: '', unit: 'EA', billingType: 'unit', unitPrice: 0, bidQty: 0 });
  const remove = async (id: string) => {
    const used = await db.parts.where('jobId').equals(jobId).filter(p => p.installPay.some(l => l.payItemId === id) || p.demoPay.some(l => l.payItemId === id)).count();
    if (used) { toast(`${used} pins bill this item. Change them first.`); return; }
    await removeRow('payItems', id, jobId);
  };
  const doPaste = async () => {
    const rows = parseRows(paste);
    if (!rows.length) { toast('Nothing I could read. Columns: item no, spec ref, description, qty, unit, unit price.'); return; }
    await db.payItems.bulkAdd(rows.map(r => ({ id: uid('pi'), jobId, itemNo: r.itemNo!, subItemNo: r.subItemNo, specRef: r.specRef!, description: r.description!, unit: r.unit!, billingType: r.billingType!, unitPrice: r.unitPrice!, bidQty: r.bidQty! })));
    setPaste(''); setShowPaste(false); toast(`${rows.length} pay items added.`);
  };

  return (
    <>
      <div className="ege-row">
        <button type="button" className="ege-btn primary" onClick={add}>+ Add a line</button>
        <button type="button" className="ege-btn" onClick={() => setShowPaste(s => !s)}>Paste from spreadsheet</button>
        <span className="ege-bar-note">Foremen never see prices. Unit price drives the billing rollup. LS gets percent buttons, AL is an allowance.</span>
      </div>
      {showPaste && (
        <div className="ege-field">
          <label>Copy the rows out of Excel and paste here. A header row helps but is not required. Order without one: item no, spec ref, description, qty, unit, unit price.</label>
          <textarea rows={6} value={paste} onChange={e => setPaste(e.target.value)} placeholder={'30\tL-125-5.1\tTaxiway Edge Light L-861T\t40\tEA\t1450'} />
          <div className="ege-row"><button type="button" className="ege-btn primary" onClick={doPaste}>Add these</button></div>
        </div>
      )}
      <table className="paytable">
        <thead><tr><th>Item</th><th>Sub #</th><th>Spec</th><th>Description</th><th>Unit</th><th>Type</th><th>Bid qty</th><th>Unit price</th><th></th></tr></thead>
        <tbody>
          {sorted.map(i => (
            <tr key={i.id}>
              <td className="narrow"><input type="text" value={i.itemNo} onChange={e => update(i.id, { itemNo: e.target.value })} /></td>
              <td className="narrow"><input type="text" value={i.subItemNo ?? ''} onChange={e => update(i.id, { subItemNo: e.target.value || undefined })} /></td>
              <td className="mid"><input type="text" value={i.specRef} onChange={e => update(i.id, { specRef: e.target.value })} /></td>
              <td><input type="text" value={i.description} onChange={e => update(i.id, { description: e.target.value })} /></td>
              <td className="narrow"><input type="text" value={i.unit} onChange={e => update(i.id, { unit: e.target.value, billingType: guessType(e.target.value) })} /></td>
              <td className="mid"><select value={i.billingType} onChange={e => update(i.id, { billingType: e.target.value as BillingType })}><option value="unit">Unit price</option><option value="lumpsum">Lump sum</option><option value="allowance">Allowance</option></select></td>
              <td className="narrow"><input type="number" className="num" value={i.bidQty} onChange={e => update(i.id, { bidQty: Number(e.target.value) })} /></td>
              <td className="mid"><input type="number" className="num" step="0.01" value={i.unitPrice} onChange={e => update(i.id, { unitPrice: Number(e.target.value) })} /></td>
              <td className="narrow"><button type="button" className="ege-btn small" onClick={() => remove(i.id)}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <div className="stub">No pay items yet.</div>}
    </>
  );
}
