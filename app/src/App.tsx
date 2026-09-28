import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, today } from './db';
import { seedIfEmpty } from './seed';
import { useForeman, useJob, useJobId, useZones } from './hooks/useJob';
import Header from './components/Header';
import Start from './screens/Start';
import MapScreen from './screens/MapScreen';
import ZoneScreen from './screens/ZoneScreen';
import ReportScreen from './screens/ReportScreen';
import AdminScreen from './screens/admin/AdminScreen';
import { toast } from './ege/ege';

type Route = { name: 'start' } | { name: 'map' } | { name: 'zone'; zoneId: string } | { name: 'report' } | { name: 'admin' };

export default function App() {
  const [ready, setReady] = useState(false);
  const [route, setRoute] = useState<Route>({ name: 'map' });
  useEffect(() => { seedIfEmpty().then(() => setReady(true)); }, []);

  const jobId = useJobId();
  const job = useJob(jobId);
  const foreman = useForeman();
  const zones = useZones(jobId);
  const date = today();

  // Undo the last tap. Gloves and sun mean mis-taps happen.
  const lastEvent = useLiveQuery(() => db.events.orderBy('createdAt').reverse().first(), []);
  const [undoShown, setUndoShown] = useState<string | null>(null);
  useEffect(() => {
    if (!lastEvent || Date.now() - lastEvent.createdAt > 5000) return;
    setUndoShown(lastEvent.id);
    const t = setTimeout(() => setUndoShown(null), 6000);
    return () => clearTimeout(t);
  }, [lastEvent?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const undo = async () => {
    if (!lastEvent) return;
    await db.transaction('rw', db.events, db.parts, async () => {
      const patch = lastEvent.ladder === 'demo' ? { demoStep: lastEvent.fromStep } : { installStep: lastEvent.fromStep };
      await db.parts.update(lastEvent.partId, patch);
      await db.events.delete(lastEvent.id);
    });
    setUndoShown(null);
    toast('Undone.');
  };

  if (!ready || foreman === undefined) return <div className="stub">Loading…</div>;

  const needForeman = !foreman && route.name !== 'admin';
  const show: Route = needForeman ? { name: 'start' } : route;
  const zone = show.name === 'zone' ? zones.find(z => z.id === show.zoneId) : undefined;

  return (
    <>
      <Header job={job} foreman={foreman} date={date} onChangeForeman={() => setRoute({ name: 'start' })} onHome={() => setRoute({ name: 'map' })} onSetup={() => setRoute({ name: 'admin' })} />
      {show.name === 'start' && <Start foreman={foreman} onDone={() => setRoute({ name: 'map' })} />}
      {show.name === 'map' && !job && <div className="screen"><div className="ege-panel"><h2 className="ege-h2">No job on this tablet</h2><p className="ege-intro">Open Setup to create one or import a job file.</p><button type="button" className="ege-btn primary" onClick={() => setRoute({ name: 'admin' })}>Setup</button></div></div>}
      {show.name === 'map' && job && <MapScreen job={job} date={date} onZone={id => setRoute({ name: 'zone', zoneId: id })} onReport={() => setRoute({ name: 'report' })} />}
      {show.name === 'zone' && zone && <ZoneScreen zone={zone} foreman={foreman} date={date} onBack={() => setRoute({ name: 'map' })} />}
      {show.name === 'admin' && <AdminScreen onBack={() => setRoute({ name: 'map' })} />}
      {show.name === 'report' && job && <ReportScreen job={job} date={date} foreman={foreman} onBack={() => setRoute({ name: 'map' })} />}
      {undoShown && lastEvent && show.name !== 'report' && (
        <div className="undo"><span>Saved.</span><button type="button" onClick={undo}>Undo</button></div>
      )}
    </>
  );
}
