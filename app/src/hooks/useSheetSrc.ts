import { useEffect, useState } from 'react';
import type { Sheet } from '../types';

// A sheet is either a bundled url or a blob on the device. Either way, a url.
export function useSheetSrc(sheet?: Sheet): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!sheet) { setUrl(''); return; }
    if (sheet.blob) { const u = URL.createObjectURL(sheet.blob); setUrl(u); return () => URL.revokeObjectURL(u); }
    // bundled placeholder sheets are stored as /placeholder/x.svg, resolve against wherever the app is served
    const src = sheet.src ?? '';
    setUrl(src.startsWith('/') ? import.meta.env.BASE_URL + src.slice(1) : src);
  }, [sheet?.id, sheet?.blob, sheet?.src]); // eslint-disable-line react-hooks/exhaustive-deps
  return url;
}
