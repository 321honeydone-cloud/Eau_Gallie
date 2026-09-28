// Types for the EGE UI kit that hangs off window.EGE (public/ege-ui.js).
export interface EGEKit {
  toast(msg: string, ms?: number): void;
  copy(text: string, label?: string): Promise<boolean>;
  sheet: { open(html: string): HTMLElement; close(): void };
  twoTap(btn: HTMLElement | string, armText: string, fn: () => void): void;
  esc(s: unknown): string;
  store: { get(k: string, d?: string): string | undefined; set(k: string, v: string): void; json<T>(k: string, d: T): T };
  photo(file: Blob, opt?: { max?: number; stamp?: string; quality?: number }): Promise<Blob>;
  stamp(parts: (string | false | undefined)[]): string;
  today(): string;
  niceDate(iso: string): string;
  stampNow(): string;
  share(data: { title?: string; text?: string; files?: File[] }): Promise<boolean | 'cancel'>;
  isIOS: boolean;
}
declare global {
  interface Window { EGE?: EGEKit }
}
export function toast(msg: string): void {
  if (window.EGE) window.EGE.toast(msg);
}
