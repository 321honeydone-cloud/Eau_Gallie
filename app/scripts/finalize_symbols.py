"""Turns a detect_symbols.py result into src/data/pensacola-parts.json: one entry per fixture with
sheet, kind, modifier and position (percent of the sheet). Also runs the last inspector rules:
threshold lights come in rows (lone hits are scale bars), runway edge lights get their C/Y or C/C
face read off the letters drawn either side of the symbol.

usage: python3 finalize_symbols.py <hi-res dir> <pass.json> <out.json>
"""
import cv2, json, sys, math, collections, numpy as np
HI, SRC, OUT = sys.argv[1:4]
r = json.load(open(SRC))

def side_letters(img, x, y):
    """ink either side of a runway edge light, ignoring lines that run right across the window"""
    def frac(x0, x1):
        win = (img[int(y - 12):int(y + 52), int(x0):int(x1)] < 100)   # the C and Y sit just below the symbol
        if win.size == 0: return 0
        rows = win.sum(axis=1); keep = rows < 0.9 * win.shape[1]
        cols = win.sum(axis=0); keepc = cols < 0.9 * win.shape[0]
        return float(win[keep][:, keepc].sum()) / max(1, win.size)
    return frac(x - 52, x - 18), frac(x + 18, x + 52)

parts = []; counts = collections.Counter(); dropped = []
for sheet, d in r.items():
    syms = d['symbols']; W, H = d['size']
    img = cv2.imread(f'{HI}/{sheet.lower()}.jpg', cv2.IMREAD_GRAYSCALE)
    for f in syms:
        if f['kind'] == 'threshold':
            near = sum(1 for g in syms if g is not f and g['kind'] == 'threshold' and math.hypot(g['x'] - f['x'], g['y'] - f['y']) < 150)
            if near < 2: dropped.append((sheet, 'lone threshold hit (scale bar)', f['xp'], f['yp'])); continue
            f['mod'] = f['mod'] or 'A'
        if f['kind'] == 'sq_bar':
            l, rr = side_letters(img, f['x'], f['y'])
            f['face'] = 'CY' if l > 0.02 and rr > 0.02 else 'CC'
            f['sides'] = [round(l, 3), round(rr, 3)]
        parts.append(dict(sheet=sheet, kind=f['kind'], mod=f.get('mod'), face=f.get('face'), x=f['xp'], y=f['yp'], score=f['score'], repaired=bool(f.get('repaired'))))
        counts[(f['kind'], f.get('face') or f.get('mod'))] += 1
    for o in d['orphans']: dropped.append((sheet, f"letter {o['s']} with no symbol", o['xp'], o['yp']))
parts.sort(key=lambda p: (p['sheet'], p['kind'], p['y'], p['x']))
json.dump(dict(parts=parts, flags=[dict(sheet=s, what=w, x=x, y=y) for s, w, x, y in dropped]), open(OUT, 'w'), indent=0)
for k, v in sorted(counts.items(), key=lambda kv: str(kv[0])): print(k, v)
print('flags:', len(dropped)); [print(' ', d) for d in dropped]
