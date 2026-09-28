import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { uid } from '../db';
import type { Sheet } from '../types';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const TARGET_WIDTH = 2400;

// Renders every page of a plan set PDF to a JPEG on the device.
// Nothing leaves the tablet. Progress callback gets (done, total).
export async function pdfToSheets(file: File, jobId: string, startOrder: number, onProgress?: (done: number, total: number) => void): Promise<Sheet[]> {
  const data = await file.arrayBuffer();
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const out: Sheet[] = [];
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
    const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.88));
    out.push({ id: uid('sh'), jobId, name: `Page ${i}`, title: file.name.replace(/\.pdf$/i, ''), blob, width: canvas.width, height: canvas.height, order: startOrder + i });
    onProgress?.(i, doc.numPages);
    page.cleanup();
  }
  await task.destroy();
  return out;
}

// A plain image works too, for a screenshot of a sheet or a scan.
export async function imageToSheet(file: File, jobId: string, order: number): Promise<Sheet> {
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  URL.revokeObjectURL(url);
  return { id: uid('sh'), jobId, name: file.name.replace(/\.[^.]+$/, ''), title: '', blob: file, width: img.naturalWidth, height: img.naturalHeight, order };
}
