"""Turns the bold dashed duct bank lines on a circuiting sheet into runs: dashes are chained end to
end, the chain is cut wherever three or more dashes meet or a junction can plaza sits, and each run
gets its footage from the sheet scale and its size label (4W2" = four way 2 inch) from the nearest text.

usage: python3 duct_runs.py <paths.json> <text.json> <page> <out.json> [--draw <render.jpg> <out.jpg>]
"""
import json, sys, math, re, collections
PATHS, TEXT, PAGE, OUT = sys.argv[1:5]
PT_PER_FT = 72 / 50.0          # graphic scale on these sheets: 1 inch = 50 ft
CLASS = sys.argv[sys.argv.index('--class') + 1] if '--class' in sys.argv else 'bank'
# bank: the multiway duct bank, bold filled dashes. conduit: the one way concrete encased conduit, thin filled
# dashes. stroke: long dashed lines drawn as stroked segments (the other duct bank style on these sheets).
THICK = {'bank': (1.3, 4.5), 'conduit': (0.4, 1.3)}.get(CLASS)

def load(page):
    d = json.load(open(PATHS))[page]; t = json.load(open(TEXT))[page]
    W, H = d['w'], d['h']
    pt = lambda xy: (xy[0] / 100 * W, xy[1] / 100 * H)
    # the duct bank is drawn as filled dashes: little dark rectangles about 3 pt thick and 10 pt long,
    # each exported as two triangles. Each triangle gives the dash centreline; the pair dedupes.
    seen = set(); segs = []
    for p in d['paths']:
        if CLASS == 'stroke':
            P = [pt(q) for q in p['pts']]
            if 'f' in p or p['g'] >= 100 or len(P) != 2 or not (0.6 <= p['lw'] <= 1.4): continue
            L = math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1])
            if 8 <= L <= 120: segs.append(P)
            continue
        if p.get('f', 255) > 100: continue
        P = [pt(q) for q in p['pts']]
        if len(P) == 4 and P[0] == P[-1]: P = P[:3]
        if len(P) != 3: continue
        e = [(math.hypot(P[(i+1) % 3][0]-P[i][0], P[(i+1) % 3][1]-P[i][1]), i) for i in range(3)]
        e.sort()
        (short, si), (long_, li), (hyp, hi) = e
        if not (THICK[0] <= short <= THICK[1] and 5 <= long_ <= 60 and abs(hyp - math.hypot(short, long_)) < 0.6): continue
        a, b = P[hi], P[(hi + 1) % 3]; c = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        la, lb = P[li], P[(li + 1) % 3]; dx, dy = (lb[0] - la[0]) / long_, (lb[1] - la[1]) / long_
        m1 = (c[0] - dx * long_ / 2, c[1] - dy * long_ / 2); m2 = (c[0] + dx * long_ / 2, c[1] + dy * long_ / 2)
        key = tuple(sorted([(round(m1[0]), round(m1[1])), (round(m2[0]), round(m2[1]))]))
        if key in seen: continue
        seen.add(key); segs.append([m1, m2])
    labels = [dict(s=it['s'], x=it['x'] * W + it['w'] * W / 2, y=it['y'] * H - it['h'] * H / 2) for it in t['items']]
    return W, H, segs, labels

def runs_for(page, gap=None):
    gap = gap or {'bank': 9, 'conduit': 22, 'stroke': 24}[CLASS]
    W, H, segs, labels = load(page)
    # nodes: cluster segment endpoints
    ends = []
    for i, s in enumerate(segs): ends.append((s[0], i, 0)); ends.append((s[-1], i, 1))
    node_of = {}; nodes = []
    for p, i, e in ends:
        for k, n in enumerate(nodes):
            if math.hypot(n[0] - p[0], n[1] - p[1]) <= gap: node_of[(i, e)] = k; break
        else: nodes.append(p); node_of[(i, e)] = len(nodes) - 1
    deg = collections.Counter(node_of.values())
    # plazas: JP text boxes are hubs, any node within 30 pt of one is a cut point
    plazas = [l for l in labels if l['s'] == 'JP']
    def seg_dist(seg, p):
        best = 1e9
        for a, b in zip(seg, seg[1:]):
            dx, dy = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dy * dy
            t = 0 if L2 == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
            best = min(best, math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)))
        return best
    incident = collections.defaultdict(set)
    for (i, e), k in node_of.items(): incident[k].add(i)
    hub_cache = {}
    def is_hub(k):
        if k in hub_cache: return hub_cache[k]
        r = deg[k] != 2 or any(math.hypot(pl['x'] - nodes[k][0], pl['y'] - nodes[k][1]) < 60 for pl in plazas)
        if not r:   # a tee: another dash passes right by this node without ending here
            r = any(seg_dist(segs[i], nodes[k]) <= gap for i in range(len(segs)) if i not in incident[k])
        hub_cache[k] = r; return r
    # walk from every hub along degree-2 chains
    adj = collections.defaultdict(list)
    for (i, e), k in node_of.items(): adj[k].append(i)
    used = set(); runs = []
    def other_end(i, k):
        a, b = node_of[(i, 0)], node_of[(i, 1)]; return b if a == k else a
    def walk(start_k, i):
        pts = []; k = start_k; seg = i
        while True:
            used.add(seg)
            s = segs[seg]; s = s if node_of[(seg, 0)] == k else s[::-1]
            pts.extend(s if not pts else s[1:]); k = other_end(seg, k)
            if is_hub(k): return pts, k
            nxt = [j for j in adj[k] if j != seg and j not in used]
            if not nxt: return pts, k
            seg = nxt[0]
    for k in range(len(nodes)):
        if not is_hub(k): continue
        for i in adj[k]:
            if i in used: continue
            pts, end_k = walk(k, i)
            runs.append(dict(pts=pts, a=k, b=end_k))
    for k in range(len(nodes)):   # closed loops with no hub
        for i in adj[k]:
            if i not in used: runs.append(dict(pts=walk(k, i)[0], a=k, b=k))
    out = []
    for r in runs:
        pts = r['pts']; L = sum(math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1]) for i in range(len(pts)-1))
        mid = pts[len(pts) // 2]
        near = [l for l in labels if re.fullmatch(r'\d+W\d+"?', l['s'])]
        best = min(near, key=lambda l: min(math.hypot(l['x'] - p[0], l['y'] - p[1]) for p in pts), default=None)
        dist = min(math.hypot(best['x'] - p[0], best['y'] - p[1]) for p in pts) if best else None
        hub_plaza = lambda k: next((pl for pl in plazas if math.hypot(pl['x'] - nodes[k][0], pl['y'] - nodes[k][1]) < 30), None)
        out.append(dict(ft=round(L / PT_PER_FT), size=best['s'] if best and dist < 120 else None, sizeDist=round(dist) if dist else None,
                        x=round(mid[0] / W * 100, 3), y=round(mid[1] / H * 100, 3),
                        path=[[round(p[0] / W * 100, 2), round(p[1] / H * 100, 2)] for p in pts[::max(1, len(pts)//40)]] + [[round(pts[-1][0] / W * 100, 2), round(pts[-1][1] / H * 100, 2)]],
                        endsAtPlaza=[bool(hub_plaza(r['a'])), bool(hub_plaza(r['b']))]))
    out = [r for r in out if r['ft'] >= (8 if CLASS == 'bank' else 30)]
    for r in out: r['cls'] = CLASS
    return out, (W, H)

runs, size = runs_for(PAGE)
json.dump(dict(runs=runs, size=size), open(OUT, 'w'))
print(f'page {PAGE}: {len(runs)} runs, {sum(r["ft"] for r in runs)} ft total;', collections.Counter(r['size'] for r in runs))
for r in sorted(runs, key=lambda r: -r['ft'])[:40]: print(' ', r['ft'], 'ft', r['size'], r['sizeDist'], r['endsAtPlaza'])
if '--draw' in sys.argv:
    import cv2
    src, dst = sys.argv[sys.argv.index('--draw') + 1], sys.argv[sys.argv.index('--draw') + 2]
    img = cv2.imread(src); h, w = img.shape[:2]
    for k, r in enumerate(runs):
        col = ((k * 97) % 180 + 40, (k * 41) % 180 + 40, (k * 173) % 180 + 40); pts = r['path']
        for i in range(len(pts) - 1): cv2.line(img, (int(pts[i][0] / 100 * w), int(pts[i][1] / 100 * h)), (int(pts[i+1][0] / 100 * w), int(pts[i+1][1] / 100 * h)), col, 4)
        cv2.putText(img, f"{k}:{r['ft']}'", (int(r['x'] / 100 * w) + 4, int(r['y'] / 100 * h) - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.55, col, 2)
    cv2.imwrite(dst, img[0:int(h * 0.66), 0:int(w * 0.76)], [cv2.IMWRITE_JPEG_QUALITY, 80])
