import { useEffect, useRef, useState } from 'react';

interface Props { onChange: (blob: Blob | null) => void; disabled?: boolean }

// Finger signature. Draws on a canvas, hands back a PNG blob after each stroke.
export default function Signature({ onChange, disabled }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current!; const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = 180;
    c.width = w * dpr; c.height = h * dpr; c.style.height = h + 'px';
    const g = c.getContext('2d')!; g.scale(dpr, dpr); g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#131A46';
  }, []);

  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: React.PointerEvent) => { if (disabled) return; drawing.current = true; const g = ref.current!.getContext('2d')!; const p = pos(e); g.beginPath(); g.moveTo(p.x, p.y); ref.current!.setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const g = ref.current!.getContext('2d')!; const p = pos(e); g.lineTo(p.x, p.y); g.stroke(); };
  const up = () => { if (!drawing.current) return; drawing.current = false; setEmpty(false); ref.current!.toBlob(b => onChange(b), 'image/png'); };
  const clear = () => { const c = ref.current!; const g = c.getContext('2d')!; g.clearRect(0, 0, c.width, c.height); setEmpty(true); onChange(null); };

  return (
    <div className="sigwrap">
      <canvas ref={ref} className="sig" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      {empty && <span className="sighint">Sign here with your finger</span>}
      {!disabled && <button type="button" className="ege-btn small sigclear" onClick={clear}>Clear</button>}
    </div>
  );
}
