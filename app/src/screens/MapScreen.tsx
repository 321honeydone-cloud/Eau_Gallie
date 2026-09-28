import PanZoom from '../components/PanZoom';
import { useSheetSrc } from '../hooks/useSheetSrc';
import { usePhases, useZones, useSheets, useParts, useOpenFlags, useTodayEventCount } from '../hooks/useJob';
import { zoneProgress } from '../lib/status';
import type { Job } from '../types';

interface Props { job: Job; date: string; onZone: (zoneId: string) => void; onReport: () => void }

export default function MapScreen({ job, date, onZone, onReport }: Props) {
  const phases = usePhases(job.id);
  const zones = useZones(job.id);
  const sheets = useSheets(job.id);
  const parts = useParts(job.id);
  const flags = useOpenFlags(job.id);
  const taps = useTodayEventCount(job.id, date);
  const overview = sheets.find(s => s.isOverview) ?? sheets.find(s => zones[0] && s.id === zones[0].overviewSheetId) ?? sheets[0];
  const overviewSrc = useSheetSrc(overview);

  const complete = parts.filter(p => (p.work === 'demo' ? p.demoStep === 4 : p.installStep === 4)).length;

  return (
    <div className="screen wide">
      <div className="stats">
        <div className="stat"><div className="k">Parts</div><div className="v">{parts.length}</div></div>
        <div className="stat ok"><div className="k">Complete</div><div className="v">{complete}</div></div>
        <div className={'stat' + (flags.length ? ' bad' : '')}><div className="k">Open flags</div><div className="v">{flags.length}</div></div>
        <div className="stat"><div className="k">Taps today</div><div className="v">{taps}</div></div>
        <button type="button" className="ege-btn primary" style={{ minHeight: 64 }} onClick={onReport}>Daily report</button>
      </div>
      <div className="legend">
        <span><b>Tap a zone</b> to open its sheet.</span>
        {phases.map((p, i) => <span key={p.id}><span className="sw" style={{ background: i === 0 ? 'rgba(105,166,213,.6)' : 'rgba(236,28,45,.35)', borderRadius: 3 }} />{p.name}</span>)}
      </div>
      {!zones.length && <div className="ege-banner">No zones on this job yet. Open Setup from the top bar to load the plans and draw zones.</div>}
      {overview && overviewSrc && (
        <PanZoom width={overview.width} height={overview.height} src={overviewSrc} hint="Pinch to zoom, drag to pan, double tap to zoom in">
          <svg viewBox={`0 0 ${overview.width} ${overview.height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            {zones.map(z => {
              const pts = z.shape.map(p => `${(p.x / 100) * overview.width},${(p.y / 100) * overview.height}`).join(' ');
              const zparts = parts.filter(p => p.zoneId === z.id);
              const pct = zoneProgress(zparts);
              const zflags = flags.filter(f => f.zoneId === z.id || zparts.some(p => p.id === f.partId)).length;
              const x0 = (Math.min(...z.shape.map(p => p.x)) / 100) * overview.width;
              const y0 = (Math.min(...z.shape.map(p => p.y)) / 100) * overview.height;
              const x1 = (Math.max(...z.shape.map(p => p.x)) / 100) * overview.width;
              const phaseIdx = phases.findIndex(p => p.id === z.phaseId);
              const barW = Math.min(260, x1 - x0 - 24);
              return (
                <g key={z.id} onClick={() => onZone(z.id)} style={{ cursor: 'pointer' }}>
                  <polygon className={'zone-poly' + (phaseIdx === 1 ? ' p2' : '')} points={pts} />
                  <text className="zone-label" x={x0 + 12} y={y0 + 40}>{z.name}</text>
                  <rect className="zone-bar" x={x0 + 12} y={y0 + 52} width={barW} height={16} rx={2} />
                  <rect className="zone-fill" x={x0 + 12} y={y0 + 52} width={(barW * pct) / 100} height={16} rx={2} />
                  <text className="zone-sub" x={x0 + 20 + barW} y={y0 + 67}>{pct}% · {zparts.length} parts{zflags ? ` · ${zflags} flag${zflags > 1 ? 's' : ''}` : ''}</text>
                </g>
              );
            })}
          </svg>
        </PanZoom>
      )}
    </div>
  );
}
