import { useEffect, useRef, useState } from 'react';

/** Word comment style pointer: a line from the open part card (or the part's list row when there is no
 *  card) to its pin on the sheet, plus a dot on the pin. Follows the sheet as it pans and zooms. */
export default function Leader({ partId }: { partId: string }) {
  const [geo, setGeo] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const raf = useRef(0);
  useEffect(() => {
    const tick = () => {
      const pin = document.querySelector<HTMLElement>(`.pin[data-part="${CSS.escape(partId)}"]`);
      const src = document.querySelector<HTMLElement>(`.ege-sheet-box[data-card="${CSS.escape(partId)}"]`) ?? document.querySelector<HTMLElement>('.prow.hot');
      const viewer = document.querySelector<HTMLElement>('.viewer');
      if (pin && src && viewer) {
        const a = pin.getBoundingClientRect(), b = src.getBoundingClientRect(), v = viewer.getBoundingClientRect();
        const x2 = a.left + a.width / 2, y2 = a.top + a.height / 2;
        const onSheet = x2 > v.left && x2 < v.right && y2 > v.top && y2 < v.bottom;
        // leave from whichever side of the source faces the pin
        const x1 = x2 < b.left ? b.left : x2 > b.right ? b.right : Math.max(b.left, Math.min(b.right, x2));
        const y1 = y2 < b.top ? b.top : y2 > b.bottom ? b.bottom : Math.max(b.top + 24, Math.min(b.bottom - 24, y2));
        setGeo(onSheet ? { x1, y1, x2, y2 } : null);
      } else setGeo(null);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [partId]);
  if (!geo) return null;
  const mx = (geo.x1 + geo.x2) / 2;
  return (
    <svg className="leader" aria-hidden="true">
      <path d={`M${geo.x1},${geo.y1} C${mx},${geo.y1} ${mx},${geo.y2} ${geo.x2},${geo.y2}`} />
      <circle cx={geo.x2} cy={geo.y2} r="30" className="ring" />
      <circle cx={geo.x2} cy={geo.y2} r="6" className="dot" />
    </svg>
  );
}
