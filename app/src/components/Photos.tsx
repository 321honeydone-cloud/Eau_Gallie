import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../db';
import { toast } from '../ege/ege';
import type { Photo } from '../types';

interface ButtonProps { jobId: string; date: string; foreman: string; partId?: string; zoneId?: string; stamp: string; label?: string }

// Camera button. Opens the iPad camera, shrinks and stamps the photo, saves it on the device.
export function PhotoButton({ jobId, date, foreman, partId, zoneId, stamp, label }: ButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []); e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      for (const f of files) {
        const blob = window.EGE ? await window.EGE.photo(f, { max: 1600, stamp: window.EGE.stamp([stamp]) }) : f;
        await db.photos.add({ id: uid('ph'), jobId, reportDate: date, partId, zoneId, foreman, blob, createdAt: Date.now() });
      }
      toast(files.length === 1 ? 'Photo saved.' : `${files.length} photos saved.`);
    } finally { setBusy(false); }
  };
  return (
    <>
      <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={onFile} />
      <button type="button" className="ege-btn" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Saving…' : (label ?? 'Photo')}</button>
    </>
  );
}

interface StripProps { photos: Photo[]; canDelete?: boolean }

export function PhotoStrip({ photos, canDelete }: StripProps) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const p of photos) next[p.id] = URL.createObjectURL(p.blob);
    setUrls(next);
    return () => { for (const u of Object.values(next)) URL.revokeObjectURL(u); };
  }, [photos]);
  const [big, setBig] = useState<Photo | null>(null);
  if (!photos.length) return null;
  return (
    <>
      <div className="ege-thumbs">
        {photos.map(p => <button key={p.id} type="button" onClick={() => setBig(p)}><img src={urls[p.id]} alt={p.caption ?? ''} /></button>)}
      </div>
      {big && (
        <div className="ege-sheet" role="dialog" onClick={e => { if (e.target === e.currentTarget) setBig(null); }}>
          <div className="ege-sheet-box">
            <img src={urls[big.id]} alt="" style={{ width: '100%', height: 'auto' }} />
            <div className="ege-row" style={{ justifyContent: 'flex-end' }}>
              {canDelete && <button type="button" className="ege-btn" onClick={async () => { await db.photos.delete(big.id); setBig(null); toast('Photo deleted.'); }}>Delete</button>}
              <button type="button" className="ege-btn primary" onClick={() => setBig(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function usePhotos(jobId?: string, date?: string, partId?: string) {
  return useLiveQuery(async () => {
    if (!jobId || !date) return [];
    const all = await db.photos.where('jobId').equals(jobId).filter(p => p.reportDate === date).toArray();
    return (partId ? all.filter(p => p.partId === partId) : all).sort((a, b) => a.createdAt - b.createdAt);
  }, [jobId, date, partId]) ?? [];
}
