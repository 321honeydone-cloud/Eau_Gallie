import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { db, uid } from '../db';
import type { Sheet, StoredFile } from '../types';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const TARGET_WIDTH = 2400;

// Renders every page of a plan set PDF to a JPEG preview on the device and keeps the file
// itself, so each sheet can redraw from the vector when zoomed. Nothing leaves the tablet.
export async function pdfToSheets(file: File, jobId: string, startOrder: number, onProgress?: (done: number, total: number) => void): Promise<{ sheets: Sheet[]; stored: StoredFile }> {
  const stored: StoredFile = { id: uid('file'), jobId, name: file.name, blob: file };
  const data = await file.arrayBuffer();
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const sheets: Sheet[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = TARGET_WIDTH / base.width;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.85));
    sheets.push({ id: uid('sh'), jobId, name: `Page ${i}`, title: file.name.replace(/\.pdf$/i, ''), blob, width: canvas.width, height: canvas.height, order: startOrder + i, pdfFileId: stored.id, pdfPage: i });
    onProgress?.(i, doc.numPages);
    page.cleanup();
  }
  await task.destroy();
  return { sheets, stored };
}

// A plain image works too, for a screenshot of a sheet or a scan. No vector layer for those.
export async function imageToSheet(file: File, jobId: string, order: number): Promise<Sheet> {
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  URL.revokeObjectURL(url);
  return { id: uid('sh'), jobId, name: file.name.replace(/\.[^.]+$/, ''), title: '', blob: file, width: img.naturalWidth, height: img.naturalHeight, order };
}

// ---------- vector layer ----------
// One loaded document per source, kept in memory for the session.
const docs = new Map<string, Promise<PDFDocumentProxy>>();
const pages = new Map<string, Promise<PDFPageProxy>>();

export function sheetHasVector(sheet?: Sheet): boolean {
  return !!sheet && (!!sheet.pdfSrc || !!sheet.pdfFileId);
}

async function loadDoc(sheet: Sheet): Promise<PDFDocumentProxy> {
  const key = sheet.pdfSrc ? `url:${sheet.pdfSrc}` : `file:${sheet.pdfFileId}`;
  let p = docs.get(key);
  if (!p) {
    p = (async () => {
      if (sheet.pdfSrc) {
        const url = sheet.pdfSrc.startsWith('/') ? import.meta.env.BASE_URL + sheet.pdfSrc.slice(1) : sheet.pdfSrc;
        return pdfjs.getDocument({ url }).promise;
      }
      const f = await db.files.get(sheet.pdfFileId!);
      if (!f) throw new Error('plan set file missing');
      return pdfjs.getDocument({ data: await f.blob.arrayBuffer() }).promise;
    })();
    docs.set(key, p);
    p.catch(() => docs.delete(key));
  }
  return p;
}

export async function getSheetPage(sheet: Sheet): Promise<PDFPageProxy> {
  const key = `${sheet.id}`;
  let p = pages.get(key);
  if (!p) { p = loadDoc(sheet).then(d => d.getPage(sheet.pdfPage ?? 1)); pages.set(key, p); p.catch(() => pages.delete(key)); }
  return p;
}

// Draws the part of the sheet inside `region` (fractions of the sheet) onto the canvas
// at `pxPerSheetWidth` device pixels across the whole sheet. Returns the task so it can be cancelled.
export function renderRegion(page: PDFPageProxy, canvas: HTMLCanvasElement, region: { x: number; y: number; w: number; h: number }, pxPerSheetWidth: number): RenderTask {
  const base = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: pxPerSheetWidth / base.width });
  canvas.width = Math.max(1, Math.ceil(region.w * vp.width));
  canvas.height = Math.max(1, Math.ceil(region.h * vp.height));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  return page.render({ canvasContext: ctx, viewport: vp, transform: [1, 0, 0, 1, -region.x * vp.width, -region.y * vp.height] });
}
