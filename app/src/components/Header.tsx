import { useEffect, useState } from 'react';
import type { Job } from '../types';

interface Props {
  job?: Job;
  foreman: string;
  date: string;
  onChangeForeman: () => void;
  onHome: () => void;
}

export default function Header({ job, foreman, date, onChangeForeman, onHome }: Props) {
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
        <img src="/logo.svg" alt="Eau Gallie Electric" />
        <h1>Field Report<small>{job?.airport ?? 'No job loaded'}</small></h1>
      </div>
      <div className="pills">
        <span className={'ege-pill' + (online ? '' : ' off')}>{online ? 'Online' : 'Offline, saving here'}</span>
        <span className="ege-pill light">{nice}</span>
        <button type="button" className="ege-pill tap" onClick={onChangeForeman}>{foreman || 'Pick foreman'}</button>
      </div>
    </header>
  );
}
