"""Legend driven symbol finder for the Pensacola E2 sheets.

Templates are cut from real instances on the sheets (see the offsets below), matched at several
rotations with normalized cross correlation, then paired with the modifier letters that pdf.js
pulled out of the sheet text (scripts/pdf-text.mjs). Existing (gray) fixtures are dropped by ink
darkness. Output: one json with every symbol, its kind, modifier, sheet fraction position.

usage: python3 detect_symbols.py <hi-res dir> <text.json> <out.json> [--probe E201,E206] [--only E201]
"""
import cv2, json, sys, math, numpy as np, collections, os

HI, TEXT, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
def opt(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default
PROBE = (opt('--probe') or '').split(',')
ONLY = opt('--only')
SHEETS = [ONLY] if ONLY else [f'E{n}' for n in range(201, 212)]
PAGE_OF = {f'E{201 + i}': str(9 + i) for i in range(11)}
TEXT_DATA = json.load(open(TEXT))
MODS = {'N', 'A', 'T', 'RE'}
SIGN_MODS = {'1M', '2M', '3M'}

# ---- templates -------------------------------------------------------------------------------
def anchor(page, key, i):
    return [it for it in TEXT_DATA[page]['items'] if it['s'] == key][i]
def load(sheet): return cv2.imread(f'{HI}/{sheet.lower()}.jpg', cv2.IMREAD_GRAYSCALE)
def cut(img, a, dx0, dx1, dy0, dy1):
    H, W = img.shape; x, y = int(a['x'] * W), int(a['y'] * H)
    return img[y + dy0:y + dy1, x + dx0:x + dx1]

im201 = load('E201'); H0, W0 = im201.shape
h36 = 3600 * H0 / W0
cy = int(2 * (0.15 * h36 + 660)); cx = int(2 * (0.08 * 3600 + 680))
TPL = {
    'sq_circle':   (im201[cy-260+72:cy-260+109, cx-200+201:cx-200+239], [0, 15, 30, 45, 60, 75], 0.72),
    'sq_bar':      (cut(load('E206'), anchor('14', 'A', 1), 30, 66, 47, 83), [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165], 0.68),
    'dbl_circle':  (cut(load('E206'), anchor('14', 'A', 0), 7, 50, 45, 85), [0, 30, 60, 90, 120, 150], 0.62),
    'plus_circle': (cut(load('E203'), anchor('11', 'RE', 0), -40, -8, -28, 5), [0, 15, 30, 45, 60, 75], 0.62),
    'sign':        (cut(im201, anchor('9', '2M', 1), -65, -5, -25, 8), [0, 90, 180, 270], 0.50),
}
# the L-861T RE lights in the mill and overlay area are drawn as a larger diamond
def center_near(page, key, xp, yp):
    its = [it for it in TEXT_DATA[page]['items'] if it['s'] == key]
    it = min(its, key=lambda it: abs(it['x'] * 100 - xp) + abs(it['y'] * 100 - yp))
    return dict(x=it['x'] + it['w'] / 2, y=it['y'] - it['h'] / 2)   # letter centre, same as the pairing code
_im206 = load('E206')
TPL['diamond_circle'] = (cut(_im206, center_near('14', 'RE', 29.308, 12.872), 36, 104, -34, 34), [0, 15, 30], 0.50)
# threshold lights: half filled square with the letters G and R either side
TPL['threshold'] = (cut(im201, center_near('9', 'A', 25.458, 55.878), 107, 142, -8, 27), [0, 90, 180, 270], 0.62)
TPL['threshold_r'] = (cv2.flip(TPL['threshold'][0], 1), [0, 90, 180, 270], 0.62)   # runway 26 end: fill on the other side
KIND_OF = {'sq_circle': 'sq_circle', 'diamond_circle': 'sq_circle', 'sq_bar': 'sq_bar', 'dbl_circle': 'dbl_circle', 'plus_circle': 'plus_circle', 'sign': 'sign', 'threshold': 'threshold', 'threshold_r': 'threshold'}
def rotate(tpl, deg):
    if deg == 0: return tpl
    h, w = tpl.shape
    d = int(math.ceil(math.hypot(h, w)))
    pad = np.full((d, d), 255, np.uint8); pad[(d-h)//2:(d-h)//2+h, (d-w)//2:(d-w)//2+w] = tpl
    M = cv2.getRotationMatrix2D((d/2, d/2), deg, 1)
    return cv2.warpAffine(pad, M, (d, d), borderValue=255)

# ---- detection -------------------------------------------------------------------------------
def ink_ok(img, h):
    patch = img[int(h['y'] - h['h'] / 2):int(h['y'] + h['h'] / 2), int(h['x'] - h['w'] / 2):int(h['x'] + h['w'] / 2)]
    if patch.size == 0: return False
    inkpx = patch[patch < 200]            # the drawn pixels: black for new work, gray for existing
    if inkpx.size < 40: return False
    h['ink'] = int(np.median(inkpx))
    return h['ink'] <= 90
def ring_ok(img, h, limit=0.40):
    H, W = img.shape; hw, hh = h['w'] / 2, h['h'] / 2
    x0, y0, x1, y1 = int(h['x'] - hw - 14), int(h['y'] - hh - 14), int(h['x'] + hw + 14), int(h['y'] + hh + 14)
    if x0 < 0 or y0 < 0 or x1 >= W or y1 >= H: return False
    ring = (img[y0:y1, x0:x1] < 100).astype(np.float32)
    band = (ring.sum() - ring[10:-10, 10:-10].sum()) / (ring.size - ring[10:-10, 10:-10].size)
    h['ring'] = round(float(band), 2)
    return band <= limit
KIND_FOR_MOD = {'N': ('sq_circle', 'sq_bar'), 'A': ('sq_circle', 'sq_bar', 'threshold', 'threshold_r', 'dbl_circle', 'plus_circle'), 'T': ('sq_circle', 'sq_bar'),
                'RE': ('plus_circle', 'diamond_circle', 'dbl_circle'), '1M': ('sign',), '2M': ('sign',), '3M': ('sign',)}
def pair(out, mods, maxd):
    pairs = []
    for i, h in enumerate(out):
        if h.get('mod'): continue
        for j, m in enumerate(mods):
            if m['used']: continue
            if (h['kind'] == 'sign') != (m['s'] in SIGN_MODS): continue
            d = math.hypot(m['x'] - h['x'], m['y'] - h['y'])
            if d < maxd: pairs.append((d, i, j))
    pairs.sort()
    for d, i, j in pairs:
        if out[i].get('mod') is None and not mods[j]['used']:
            out[i]['mod'] = mods[j]['s']; out[i]['modDist'] = round(d); mods[j]['used'] = True
def local_search(img, m, kinds, thr):
    """inspector: look again around an orphan letter with every template its modifier allows, looser threshold"""
    H, W = img.shape; R = 220
    x0, y0 = max(0, int(m['x'] - R)), max(0, int(m['y'] - R))
    win = img[y0:int(m['y'] + R), x0:int(m['x'] + R)]
    best = None
    for tname in kinds:
        tpl, rots, _ = TPL[tname]
        for deg in rots:
            r = rotate(tpl, deg); th, tw = r.shape
            if win.shape[0] < th or win.shape[1] < tw: continue
            res = cv2.matchTemplate(win, r, cv2.TM_CCOEFF_NORMED)
            yy, xx = np.unravel_index(res.argmax(), res.shape); sc = float(res[yy, xx])
            if sc >= thr and (best is None or sc > best['score']):
                best = dict(kind=KIND_OF[tname], tpl=tname, score=round(sc, 3), x=x0 + xx + tw / 2, y=y0 + yy + th / 2, w=tw, h=th, repaired=True)
    return best
def detect_sheet(sheet):
    img = load(sheet); H, W = img.shape
    hits = []
    for kind, (tpl, rots, thr) in TPL.items():
        for deg in rots:
            r = rotate(tpl, deg); th, tw = r.shape
            res = cv2.matchTemplate(img, r, cv2.TM_CCOEFF_NORMED)
            ys, xs = np.where(res >= thr)
            for y, x in zip(ys, xs):
                hits.append(dict(kind=kind, score=float(res[y, x]), x=x + tw / 2, y=y + th / 2, w=tw, h=th, rot=deg))
    # non max suppression across kinds
    hits.sort(key=lambda h: -h['score'])
    keep = []
    for h in hits:
        if all(math.hypot(h['x'] - k['x'], h['y'] - k['y']) > 22 for k in keep): keep.append(h)
    # drop title block / keymap strip and pale (existing) symbols
    out = []
    for h in keep:
        if h['x'] > W * 0.905: continue
        if not ink_ok(img, h): continue
        if not ring_ok(img, h): continue
        h['tpl'] = h['kind']; h['kind'] = KIND_OF[h['kind']]
        del h['rot']
        out.append(h)
    # pair with modifier letters (dark letters only: gray ones belong to existing fixtures or sign faces)
    items = TEXT_DATA[PAGE_OF[sheet]]['items']
    mods = []
    for it in items:
        if it['s'] not in MODS and it['s'] not in SIGN_MODS: continue
        mx, my = it['x'] * W + it['w'] * W / 2, it['y'] * H - it['h'] * H / 2
        p = img[max(0, int(my - 20)):int(my + 20), max(0, int(mx - 20)):int(mx + 20)]
        if p.size == 0 or np.percentile(p, 5) > 80: continue
        if ((p > 90) & (p < 200)).mean() > 0.6: continue
        mods.append(dict(s=it['s'], x=mx, y=my, used=False))
    pair(out, mods, 200)
    # ---- inspector: recheck every letter that has no symbol, repair, then pair again
    log = []
    for m in mods:
        if m['used']: continue
        found = local_search(img, m, KIND_FOR_MOD[m['s']], 0.60)
        if not found: log.append(dict(what='letter without symbol', s=m['s'], x=m['x'], y=m['y'])); continue
        if any(math.hypot(found['x'] - k['x'], found['y'] - k['y']) < 22 for k in out):
            log.append(dict(what='letter next to a symbol already taken', s=m['s'], x=m['x'], y=m['y'])); continue
        if not ink_ok(img, found) or not ring_ok(img, found, 0.5):
            log.append(dict(what='letter without symbol', s=m['s'], x=m['x'], y=m['y'])); continue
        out.append(found); log.append(dict(what='repaired', s=m['s'], kind=found['kind'], x=found['x'], y=found['y'], score=found['score']))
    pair(out, mods, 320)
    out = [h for h in out if not (h['kind'] == 'sign' and not h.get('mod'))]   # every sign carries a size label
    for h in out:
        h.setdefault('mod', None)
        h['xp'] = round(h['x'] / W * 100, 3); h['yp'] = round(h['y'] / H * 100, 3)
        h['score'] = round(h['score'], 3)
    orphans = [dict(s=m['s'], x=m['x'], y=m['y'], xp=round(m['x'] / W * 100, 3), yp=round(m['y'] / H * 100, 3)) for m in mods if not m['used']]
    for l in log:
        l['xp'] = round(l['x'] / W * 100, 3); l['yp'] = round(l['y'] / H * 100, 3)
    return out, orphans, (W, H), log

COL = {'sq_circle': (255, 0, 0), 'sq_bar': (0, 160, 0), 'dbl_circle': (200, 0, 200), 'plus_circle': (0, 0, 255), 'sign': (0, 140, 255), 'threshold': (0, 0, 0)}
def probe(sheet, keep, orphans, size):
    img = cv2.imread(f'{HI}/{sheet.lower()}.jpg')
    for f in keep:
        c = COL[f['kind']]
        cv2.rectangle(img, (int(f['x'] - 26), int(f['y'] - 26)), (int(f['x'] + 26), int(f['y'] + 26)), c, 3)
        cv2.putText(img, f"{f['mod'] or '?'} {f['score']:.2f}", (int(f['x'] + 28), int(f['y'] - 28)), cv2.FONT_HERSHEY_SIMPLEX, 0.9, c, 2)
    for m in orphans: cv2.circle(img, (int(m['x']), int(m['y'])), 30, (0, 0, 0), 4)
    W, H = size
    cv2.imwrite(f'{OUT}.{sheet}.probe.jpg', cv2.resize(img, (3600, int(3600 * H / W))), [cv2.IMWRITE_JPEG_QUALITY, 80])

result = {}
total = collections.Counter(); total_orph = collections.Counter()
from multiprocessing import Pool
with Pool(min(len(SHEETS), os.cpu_count() or 1)) as pool:
    done = dict(zip(SHEETS, pool.map(detect_sheet, SHEETS)))
# sheet furniture: the same spot on three or more sheets is a legend or scale bar, not a fixture
CELL = 0.8
spots = collections.defaultdict(set)
for sheet in SHEETS:
    for f in done[sheet][0]: spots[(f['kind'], round(f['xp'] / CELL), round(f['yp'] / CELL))].add(sheet)
def furniture(f):
    cx, cy = round(f['xp'] / CELL), round(f['yp'] / CELL)
    near = set()
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1): near |= spots.get((f['kind'], cx + dx, cy + dy), set())
    return len(near) >= 3
for sheet in SHEETS:
    keep, orphans, size, log = done[sheet]
    keep = [f for f in keep if not furniture(f)]
    rep = sum(1 for l in log if l['what'] == 'repaired')
    counts = collections.Counter((f['kind'], f['mod']) for f in keep)
    oc = collections.Counter(m['s'] for m in orphans)
    total.update(counts); total_orph.update(oc)
    print(f"{sheet}: {len(keep)} symbols, {rep} repaired :: {dict(counts)} | letters with no symbol: {dict(oc)}", flush=True)
    result[sheet] = dict(symbols=keep, orphans=orphans, size=size, log=log)
    if sheet in PROBE: probe(sheet, keep, orphans, size)
print('TOTAL', dict(total)); print('ORPHANS', dict(total_orph))
json.dump(result, open(OUT, 'w'))
