import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from 'react';
import type { Sheet } from '../types';
import { getSheetPage, renderRegion, sheetHasVector } from '../lib/pdf';
import type { RenderTask } from 'pdfjs-dist';

// Pinch, drag, double tap, plus buttons. Taps on children still work: a drag
// longer than 8px cancels the click that would follow it.
interface Props {
  width: number;   // natural size of the image
  height: number;
  src: string;
  children?: ReactNode;   // overlays positioned in percent inside the stage
  hint?: string;
  resetKey?: string;
  onTapStage?: (pt: { x: number; y: number }) => void;          // clean tap on the sheet, percent coords
  onDrawRect?: (r: { x1: number; y1: number; x2: number; y2: number }) => void;  // drag draws a box, percent coords
  dark?: boolean;          // CAD night look: the sheet inverts, pins glow
  sheet?: Sheet;           // when the sheet has a PDF page, the visible area redraws from the vector
}

export interface PanZoomHandle {
  flyTo: (r: { x1: number; y1: number; x2: number; y2: number }, ms?: number) => Promise<void>;   // percent rect
  fit: () => void;
}

interface View { s: number; tx: number; ty: number }

const PanZoom = forwardRef<PanZoomHandle, Props>(function PanZoom({ width, height, src, children, hint, resetKey, onTapStage, onDrawRect, dark, sheet }, ref) {
  const [eased, setEased] = useState(false);   // transitions on for button, double tap and fly zooms, off while a finger is down
  const [drawBox, setDrawBoxState] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  // Window listeners are attached on pointer down and would see stale state, so the live values live in refs.
  const drawRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const setDrawBox = (b: { x1: number; y1: number; x2: number; y2: number } | null) => { drawRef.current = b; setDrawBoxState(b); };
  const viewRef = useRef<View>({ s: 1, tx: 0, ty: 0 });
  const box = useRef<HTMLDivElement>(null);
  const [view, setViewState] = useState<View>({ s: 1, tx: 0, ty: 0 });
  const setView = (v: View | ((p: View) => View)) => { setViewState(prev => { const n = typeof v === 'function' ? v(prev) : v; viewRef.current = n; return n; }); };
  const [stageW, setStageW] = useState(1000);
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ view: View; dist: number; mid: { x: number; y: number }; moved: number; t: number } | null>(null);
  const lastTap = useRef(0);
  const suppressClick = useRef(false);

  const fit = () => {
    const el = box.current; if (!el) return;
    const bw = el.clientWidth, bh = el.clientHeight;
    const sw = bw; const sh = (height / width) * bw;
    setStageW(sw);
    const s = Math.min(1, bh / sh);
    setView({ s, tx: (bw - sw * s) / 2, ty: (bh - sh * s) / 2 });
  };
  useEffect(() => { fit(); const ro = new ResizeObserver(fit); if (box.current) ro.observe(box.current); return () => ro.disconnect(); }, [width, height, resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const clamp = (v: View): View => {
    const el = box.current; if (!el) return v;
    const s = Math.min(Math.max(v.s, 0.5), 8);
    const sw = stageW * s, sh = stageW * (height / width) * s;
    const bw = el.clientWidth, bh = el.clientHeight;
    let tx = v.tx, ty = v.ty;
    if (sw <= bw) tx = (bw - sw) / 2; else tx = Math.min(0, Math.max(bw - sw, tx));
    if (sh <= bh) ty = (bh - sh) / 2; else ty = Math.min(0, Math.max(bh - sh, ty));
    return { s, tx, ty };
  };

  const zoomAt = (factor: number, cx: number, cy: number) => {
    setEased(true);
    setView(v => {
      const s = Math.min(Math.max(v.s * factor, 0.5), 8);
      const k = s / v.s;
      return clamp({ s, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k });
    });
  };

  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toPct = (p: { x: number; y: number }, v: View = viewRef.current) => ({ x: ((p.x - v.tx) / (stageW * v.s)) * 100, y: ((p.y - v.ty) / (stageW * (height / width) * v.s)) * 100 });

  const onDown = (e: RPointerEvent) => {
    setEased(false);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    // No pointer capture: it would re-target the click that follows, and
    // then taps on pins and zones stop working. Window listeners instead.
    if (pointers.current.size === 1) {
      const move = (ev: PointerEvent) => onMove(ev as unknown as RPointerEvent);
      const up = (ev: PointerEvent) => { onUp(ev as unknown as RPointerEvent); if (pointers.current.size === 0) { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); } };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }
    const pts = [...pointers.current.values()];
    const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : p;
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    start.current = { view: viewRef.current, dist, mid, moved: 0, t: Date.now() };
  };
  const onMove = (e: RPointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !start.current) return;
    pointers.current.set(e.pointerId, local(e));
    const pts = [...pointers.current.values()];
    const st = start.current;
    if (pts.length > 1) {
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const k = st.dist > 0 ? dist / st.dist : 1;
      const s = Math.min(Math.max(st.view.s * k, 0.5), 8);
      const kk = s / st.view.s;
      st.moved = 100;
      setView(clamp({ s, tx: mid.x - (st.mid.x - st.view.tx) * kk, ty: mid.y - (st.mid.y - st.view.ty) * kk }));
    } else {
      const dx = pts[0].x - st.mid.x, dy = pts[0].y - st.mid.y;
      st.moved = Math.max(st.moved, Math.hypot(dx, dy));
      if (onDrawRect) {
        if (st.moved > 4) { const a = toPct(st.mid, st.view), b = toPct(pts[0], st.view); setDrawBox({ x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) }); }
      } else if (st.moved > 8) { setDragging(true); setView(clamp({ s: st.view.s, tx: st.view.tx + dx, ty: st.view.ty + dy })); }
    }
  };
  const onUp = (e: RPointerEvent) => {
    pointers.current.delete(e.pointerId);
    const st = start.current;
    if (pointers.current.size === 0) {
      setDragging(false);
      const onTarget = !!(e.target as Element | null)?.closest?.('.pin, .zone-poly, .zone-tap');
      if (onDrawRect && drawRef.current && st && st.moved > 4) { const b = drawRef.current; setDrawBox(null); start.current = null; onDrawRect(b); return; }
      if (st && st.moved <= 8 && Date.now() - st.t < 400 && !onTarget && onTapStage && (e.target as Element | null)?.closest?.('.zoomctl') === null) {
        onTapStage(toPct(local(e))); suppressClick.current = true; start.current = null; return;
      }
      if (st && st.moved <= 8 && Date.now() - st.t < 400 && !onTarget) {
        const now = Date.now();
        if (now - lastTap.current < 320) { const p = local(e); zoomAt(viewRef.current.s < 2 ? 2.2 : 0.45, p.x, p.y); lastTap.current = 0; suppressClick.current = true; }
        else lastTap.current = now;
      } else if (st && st.moved > 8) suppressClick.current = true;
      start.current = null;
    } else {
      // one finger left after a pinch, restart the drag from here
      const p = [...pointers.current.values()][0];
      start.current = { view: viewRef.current, dist: 0, mid: p, moved: 100, t: Date.now() };
    }
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) { e.stopPropagation(); e.preventDefault(); suppressClick.current = false; }
  };
  const onWheel = (e: React.WheelEvent) => { const p = local(e); zoomAt(e.deltaY < 0 ? 1.15 : 0.87, p.x, p.y); };

  // Glide the view so a percent rect fills the box. Used when a zone is tapped on the airfield.
  const flyTo = (r: { x1: number; y1: number; x2: number; y2: number }, ms = 420) => new Promise<void>(res => {
    const el = box.current; if (!el) return res();
    const bw = el.clientWidth, bh = el.clientHeight;
    const sh = stageW * (height / width);
    const rw = ((r.x2 - r.x1) / 100) * stageW, rh = ((r.y2 - r.y1) / 100) * sh;
    const s = Math.min(8, Math.min(bw / rw, bh / rh) * 0.9);
    const cx = ((r.x1 + r.x2) / 200) * stageW * s, cy = ((r.y1 + r.y2) / 200) * sh * s;
    setEased(true);
    setView({ s, tx: bw / 2 - cx, ty: bh / 2 - cy });
    window.setTimeout(res, ms);
  });
  useImperativeHandle(ref, () => ({ flyTo, fit }), [stageW, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={box} className={'viewer' + (dragging ? ' dragging' : '') + (dark ? ' dark' : '') + (eased ? ' eased' : '')}
      onPointerDown={onDown} onClickCapture={onClickCapture} onWheel={onWheel}>
      <div className="stage" style={{ width: stageW, transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, ['--inv' as string]: String(1 / view.s) }}>
        <img src={src} width={width} height={height} alt="" draggable={false} />
        {sheetHasVector(sheet) && <VectorLayer sheet={sheet!} view={view} stageW={stageW} aspect={height / width} box={box} />}
        {children}
        {drawBox && <div className="drawbox" style={{ left: `${drawBox.x1}%`, top: `${drawBox.y1}%`, width: `${drawBox.x2 - drawBox.x1}%`, height: `${drawBox.y2 - drawBox.y1}%` }} />}
      </div>
      <div className="zoomctl" onPointerDown={e => e.stopPropagation()}>
        <button type="button" aria-label="Zoom in" onClick={() => { const el = box.current!; zoomAt(1.4, el.clientWidth / 2, el.clientHeight / 2); }}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => { const el = box.current!; zoomAt(0.7, el.clientWidth / 2, el.clientHeight / 2); }}>&minus;</button>
        <button type="button" aria-label="Fit" onClick={fit} style={{ fontSize: 13, fontFamily: 'Oswald' }}>FIT</button>
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
});
export default PanZoom;

// Redraws whatever part of the sheet is on screen from the PDF once the view settles.
// The raster preview underneath covers the moment between a gesture and the redraw.
function VectorLayer({ sheet, view, stageW, aspect, box }: { sheet: Sheet; view: View; stageW: number; aspect: number; box: React.RefObject<HTMLDivElement | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [place, setPlace] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const task = useRef<RenderTask | null>(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const t = window.setTimeout(async () => {
      const bw = el.clientWidth, bh = el.clientHeight;
      const sw = stageW * view.s, sh = stageW * aspect * view.s;
      const region = {
        x: Math.max(0, -view.tx / sw), y: Math.max(0, -view.ty / sh),
        w: Math.min(1, bw / sw), h: Math.min(1, bh / sh),
      };
      region.w = Math.min(region.w, 1 - region.x); region.h = Math.min(region.h, 1 - region.y);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      try {
        const page = await getSheetPage(sheet);
        task.current?.cancel();
        const c = canvas.current; if (!c) return;
        const rt = renderRegion(page, c, region, sw * dpr);
        task.current = rt;
        await rt.promise;
        setPlace(region);
      } catch (e) { if ((e as Error)?.name !== 'RenderingCancelledException') console.warn('vector layer', e); }
    }, 160);
    return () => window.clearTimeout(t);
  }, [sheet.id, view.s, view.tx, view.ty, stageW, aspect, box]);
  useEffect(() => () => task.current?.cancel(), []);
  return <canvas ref={canvas} className="vector" style={place ? { left: `${place.x * 100}%`, top: `${place.y * 100}%`, width: `${place.w * 100}%`, height: `${place.h * 100}%` } : { display: 'none' }} />;
}
