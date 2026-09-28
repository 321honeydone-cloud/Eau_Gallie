import { useCrew } from '../hooks/useJob';
import { setSetting } from '../db';

interface Props { foreman: string; onDone: () => void }

export default function Start({ foreman, onDone }: Props) {
  const crew = useCrew().filter(c => c.role === 'foreman');
  const pick = async (name: string) => { await setSetting('foreman', name); onDone(); };
  return (
    <div className="screen">
      <div className="ege-panel">
        <h2 className="ege-h2">Who's running the tablet today?</h2>
        <p className="ege-intro">Tap your name. Everything you tap after this gets stamped with it. Change it any time from the top bar.</p>
        <div className="choice-grid">
          {crew.map(c => (
            <button key={c.id} type="button" className={'choice' + (foreman === c.name ? ' on' : '')} onClick={() => pick(c.name)}>
              <b>{c.name}</b><span>Foreman</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
