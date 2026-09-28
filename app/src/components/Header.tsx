import { useEffect, useState } from 'react';
import type { Job } from '../types';
import { SyncPill } from './SyncPanel';

interface Props {
  job?: Job;
  foreman: string;
  date: string;
  onChangeForeman: () => void;
  onHome: () => void;
  onSetup: () => void;
  onBilling: () => void;
  onSync: () => void;
}

export default function Header({ job, foreman, date, onChangeForeman, onHome, onSetup, onBilling, onSync }: Props) {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const nice = window.EGE?.niceDate(date) ?? date;
  return (
    <header className="ege-header app-header">
      <div className="ege-brand wordmark" onClick={onHome} role="button" tabIndex={0}>
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Eau Gallie Electric" />
        <h1>Field Report<small>{job?.airport ?? 'No job loaded'}</small></h1>
      </div>
      <div className="pills">
        <span className={'ege-pill' + (online ? '' : ' off')}>{online ? 'Online' : 'Offline, saving here'}</span>
        <SyncPill onOpen={onSync} />
        <span className="ege-pill light">{nice}</span>
        <button type="button" className="ege-pill tap" onClick={onChangeForeman}>{foreman || 'Pick foreman'}</button>
        <button type="button" className="ege-pill tap light" onClick={onBilling} aria-label="Billing">Billing</button>
        <button type="button" className="ege-pill tap light" onClick={onSetup} aria-label="Setup">Setup</button>
      </div>
    </header>
  );
}
