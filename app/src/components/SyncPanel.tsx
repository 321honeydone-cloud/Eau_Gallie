import { useEffect, useState } from 'react';
import { toast } from '../ege/ege';
import { getSyncConfig, onSyncStatus, resetSyncWatermarks, setSyncConfig, syncNow, type SyncStatus } from '../lib/sync';

// Header pill plus the sheet that opens from it. Paste the project URL and key once per tablet.
export function SyncPill({ onOpen }: { onOpen: () => void }) {
  const [s, setS] = useState<SyncStatus>({ state: 'off', pending: 0 });
  useEffect(() => onSyncStatus(setS), []);
  const label = s.state === 'off' ? 'Not synced' : s.state === 'syncing' ? 'Syncing…' : s.state === 'error' ? `Sync error` : s.pending ? `${s.pending} to send` : s.lastAt ? `Synced ${ago(s.lastAt)}` : 'Synced';
  return <button type="button" className={'ege-pill tap' + (s.state === 'error' ? ' off' : s.state === 'off' ? ' light' : '')} onClick={onOpen}>{label}</button>;
}
function ago(t: number) { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`; }

export function SyncSheet({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState(''); const [key, setKey] = useState('');
  const [s, setS] = useState<SyncStatus>({ state: 'off', pending: 0 });
  useEffect(() => { getSyncConfig().then(c => { if (c) { setUrl(c.url); setKey(c.key); } }); return onSyncStatus(setS); }, []);
  const save = async () => {
    if (!url.trim() || !key.trim()) { toast('Both the URL and the key are needed.'); return; }
    await setSyncConfig({ url: url.trim(), key: key.trim() }); toast('Connected. Syncing now.');
  };
  const off = async () => { await setSyncConfig(null); toast('Sync turned off. Everything stays on this tablet.'); };
  return (
    <div className="ege-sheet" role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ege-sheet-box">
        <h2 className="ege-h2" style={{ fontSize: 22 }}>Sync between tablets</h2>
        <p className="ege-intro">Paste the project URL and the anon key from the Supabase project once. After that every tap goes up when the tablet has signal and comes down to the other tablets. Offline, it queues.</p>
        <div className="ege-field"><label>Project URL</label><input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" autoCapitalize="off" autoCorrect="off" /></div>
        <div className="ege-field"><label>Anon key</label><input type="text" value={key} onChange={e => setKey(e.target.value)} placeholder="eyJ…" autoCapitalize="off" autoCorrect="off" /></div>
        <div className="ege-row">
          <span className={'ege-flag ' + (s.state === 'error' ? 'bad' : s.state === 'off' ? 'info' : 'ok')}>{s.state === 'off' ? 'Not connected' : s.state === 'error' ? `Error: ${s.message}` : s.state === 'syncing' ? 'Syncing…' : `${s.pending} waiting · last ${s.lastAt ? ago(s.lastAt) : 'never'}`}</span>
        </div>
        <div className="ege-row" style={{ justifyContent: 'flex-end' }}>
          {s.state !== 'off' && <button type="button" className="ege-btn" onClick={off}>Turn off</button>}
          {s.state !== 'off' && <button type="button" className="ege-btn" onClick={async () => { await resetSyncWatermarks(); await syncNow(); toast('Full resync done.'); }}>Resend everything</button>}
          {s.state !== 'off' && <button type="button" className="ege-btn" onClick={() => void syncNow()}>Sync now</button>}
          <button type="button" className="ege-btn primary" onClick={save}>Connect</button>
          <button type="button" className="ege-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
