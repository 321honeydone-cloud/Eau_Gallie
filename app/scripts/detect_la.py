"""Finds the field lightning arrestor diamonds (LA) on the circuiting sheet renders.
usage: python3 detect_la.py <hi3 dir> <out.json> [--tpl x,y,sheetpage]"""
import cv2, json, sys, math, numpy as np, collections, glob, os
HI, OUT = sys.argv[1], sys.argv[2]
files = sorted(glob.glob(f'{HI}/*.jpg'))
def load(i): return cv2.imread(files[i], cv2.IMREAD_GRAYSCALE)
e303 = load(2); H, W = e303.shape
tpl = e303[2755 - 30:2755 + 30, 4820 - 30:4820 + 30]
cv2.imwrite(f'{OUT}.tpl.png', cv2.resize(tpl, None, fx=5, fy=5, interpolation=cv2.INTER_NEAREST))
res_all = {}; total = 0
for i, f in enumerate(files):
    img = load(i); res = cv2.matchTemplate(img, tpl, cv2.TM_CCOEFF_NORMED)
    ys, xs = np.where(res >= 0.62); hits = sorted(zip(res[ys, xs], xs, ys), reverse=True); keep = []
    for sc, x, y in hits:
        cx, cy = x + 30, y + 30
        if cx > W * 0.905: continue
        if any(math.hypot(cx - k[1], cy - k[2]) < 25 for k in keep): continue
        patch = img[cy - 30:cy + 30, cx - 30:cx + 30]; inkpx = patch[patch < 200]
        if inkpx.size < 40 or np.median(inkpx) > 90: continue
        keep.append((round(float(sc), 3), int(cx), int(cy)))
    name = f'E3{i + 1:02d}'
    res_all[name] = [dict(score=s, x=x, y=y, xp=round(x / W * 100, 3), yp=round(y / H * 100, 3)) for s, x, y in keep]
    total += len(keep); print(name, len(keep), [k[0] for k in keep][:12])
print('TOTAL', total)
json.dump(res_all, open(OUT, 'w'))
