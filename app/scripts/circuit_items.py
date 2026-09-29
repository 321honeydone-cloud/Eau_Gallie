"""Plazas, cans and arrestors on the circuiting sheets, from the sheet text plus the LA diamonds.
usage: python3 circuit_items.py <by-sheet.json> <la.json> <out.json>"""
import json, sys, re, math, collections
BY, LA, OUT = sys.argv[1:4]
by = json.load(open(BY)); la = json.load(open(LA))
CIRCUIT = re.compile(r'^(R826[ES]|TW[A-D]|RGL|WC ?MF|TAS\d|17S\d|1735RCL|SPARE|[A-Z]{2,4}\d?(\s*\(\d\))?)$')
SIZE = re.compile(r'^(\d+)D$'); ID = re.compile(r'^JCP-\d+[A-Z]?$')
out = []; counts = collections.Counter(); flags = []
for n in range(301, 312):
    sheet = f'E{n}'; d = by[sheet]; W, H = d['w'], d['h']
    items = [dict(s=it['s'], x=(it['x'] + it['w'] / 2) * 100, y=(it['y'] - it['h'] / 2) * 100, rot=it.get('rot', 0)) for it in d['items'] if it['x'] < 0.9]
    dist = lambda a, b: math.hypot((a['x'] - b['x']) * W / 100, (a['y'] - b['y']) * H / 100)
    sizes = [it for it in items if SIZE.match(it['s'])]; ids = [it for it in items if ID.match(it['s'])]
    usedS, usedI = set(), set()
    for it in [it for it in items if it['s'] == 'JP']:
        sz = min(((dist(it, s), k) for k, s in enumerate(sizes) if k not in usedS), default=(1e9, None))
        iid = min(((dist(it, s), k) for k, s in enumerate(ids) if k not in usedI), default=(1e9, None))
        size = int(SIZE.match(sizes[sz[1]]['s']).group(1)) if sz[1] is not None and sz[0] < 90 else None
        pid = ids[iid[1]]['s'] if iid[1] is not None and iid[0] < 110 else None
        if size: usedS.add(sz[1])
        if pid: usedI.add(iid[1])
        if not size and not pid:
            flags.append(dict(sheet=sheet, what='JP box with no size or ID (existing plaza?)', x=round(it['x'], 3), y=round(it['y'], 3)))
            continue
        out.append(dict(sheet=sheet, kind='plaza', size=size, id=pid, x=round(it['x'], 3), y=round(it['y'], 3)))
        counts[('plaza', size)] += 1
    for k, s in enumerate(sizes):
        if k not in usedS: flags.append(dict(sheet=sheet, what=f'size label {s["s"]} with no JP box', x=round(s['x'], 3), y=round(s['y'], 3)))
    # single cans: the D hexagons. The D inside a size label is its own token so it does not count.
    for it in [it for it in items if it['s'] == 'D']:
        out.append(dict(sheet=sheet, kind='can', x=round(it['x'], 3), y=round(it['y'], 3))); counts[('can', None)] += 1
    # arrestors: one per circuit named beside the diamond
    for h in la.get(sheet, []):
        near = [it for it in items if 0 < (it['x'] - h['xp']) * W / 100 < 260 and abs((it['y'] - h['yp']) * H / 100) < 90 and CIRCUIT.match(it['s']) and it['s'] not in ('LA',)]
        names = [it['s'] for it in sorted(near, key=lambda it: (it['y'], it['x']))]
        qty = max(1, sum(int(m.group(1)) if (m := re.search(r'\((\d)\)', s)) else 1 for s in names)) if names else 1
        out.append(dict(sheet=sheet, kind='arrestor', circuits=names, qty=qty, x=h['xp'], y=h['yp'], score=h['score']))
        counts[('arrestor', None)] += qty
json.dump(dict(items=out, flags=flags), open(OUT, 'w'), indent=0)
for k, v in sorted(counts.items(), key=str): print(k, v)
print('flags', len(flags)); [print(' ', f) for f in flags]
for it in out:
    if it['kind'] == 'arrestor': print(' LA', it['sheet'], it['circuits'], it['qty'])
