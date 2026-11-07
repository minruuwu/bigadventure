#!/usr/bin/env python3
"""實境冒險的地圖資料：把 osmium 匯出的 GeoJSON（一行一筆）切成 0.05 度一塊的小檔。

輸入：osmium export -f geojsonseq 的輸出（道路、橋、河流、水域）
輸出：assets/map/c/{i}_{j}.json（i = floor(經度/0.05)，j = floor(緯度/0.05)）＋ assets/map/index.json

每塊的格式（座標都換成公尺整數，跟 real/index.html 的 toM 一樣；第一點絕對值、之後存差值）：
  r: 道路  [寬度, 是不是橋(0/1), [x0,y0,dx1,dy1,...]]
  l: 河流、溪流（線）  [寬度, [x0,y0,dx1,dy1,...]]
  a: 水域（面）  [[外圈], [內圈（島）], ...]，每圈也是 [x0,y0,dx1,dy1,...]
"""
import json, math, os, sys, shutil, time
from shapely.geometry import shape, box, LineString, Polygon, MultiPolygon, MultiLineString, GeometryCollection
import shapely
import numpy as np

KX, KY = 102090, 110574          # 經緯度 → 公尺（跟 real/index.html 相同）
CH = 0.05                        # 每塊 0.05 度（約 5 公里）
SIMP = 2.0                       # 簡化線條的容許誤差（公尺）

ROAD = {'motorway': 6, 'trunk': 6, 'primary': 5, 'secondary': 5, 'tertiary': 4, 'motorway_link': 4, 'trunk_link': 4,
        'primary_link': 4, 'secondary_link': 4, 'tertiary_link': 3, 'unclassified': 3, 'residential': 3,
        'living_street': 3, 'pedestrian': 3}
RIVER = {'river': 5, 'canal': 3, 'stream': 2, 'drain': 1, 'ditch': 1}


def tom(g):
    return shapely.transform(g, lambda a: a * np.array([KX, KY]))


def enc(coords):
    out, px, py = [], None, None
    for x, y in coords:
        x, y = int(round(x)), int(round(y))
        if px is None:
            out += [x, y]
        else:
            if x == px and y == py:
                continue
            out += [x - px, y - py]
        px, py = x, y
    return out


def parts(g):
    """把切完的幾何拆成一條條線、一塊塊面"""
    if g.is_empty:
        return []
    if isinstance(g, (LineString, Polygon)):
        return [g]
    if isinstance(g, (MultiLineString, MultiPolygon, GeometryCollection)):
        o = []
        for x in g.geoms:
            o += parts(x)
        return o
    return []


def chunks_of(g):
    minx, miny, maxx, maxy = g.bounds
    i0, i1 = math.floor(minx / KX / CH), math.floor(maxx / KX / CH)
    j0, j1 = math.floor(miny / KY / CH), math.floor(maxy / KY / CH)
    for i in range(i0, i1 + 1):
        for j in range(j0, j1 + 1):
            yield i, j


def cbox(i, j):
    return box(i * CH * KX, j * CH * KY, (i + 1) * CH * KX, (j + 1) * CH * KY)


def main(src, out):
    t0 = time.time()
    C = {}
    n = {'r': 0, 'l': 0, 'a': 0, 'skip': 0}

    def put(kind, g, extra):
        cs = list(chunks_of(g))
        for i, j in cs:
            gg = g if len(cs) == 1 else g.intersection(cbox(i, j))
            for p in parts(gg):
                d = C.setdefault((i, j), {'r': [], 'l': [], 'a': []})
                if kind == 'a':
                    if not isinstance(p, Polygon) or p.area < 80:
                        continue
                    rings = [enc(p.exterior.coords)] + [enc(r.coords) for r in p.interiors if Polygon(r).area >= 80]
                    if len(rings[0]) >= 6:
                        d['a'].append(rings)
                else:
                    if not isinstance(p, LineString):
                        continue
                    e = enc(p.coords)
                    if len(e) < 4:
                        continue
                    d[kind].append(extra + [e])

    with open(src, encoding='utf-8') as f:
        for line in f:
            line = line.strip().lstrip('\x1e')
            if not line:
                continue
            try:
                ft = json.loads(line)
                tg = ft.get('properties') or {}
                g = shape(ft['geometry'])
            except Exception:
                n['skip'] += 1
                continue
            g = tom(g)
            hw, ww = tg.get('highway'), tg.get('waterway')
            if hw in ROAD:
                br = 1 if tg.get('bridge') not in (None, 'no') else 0
                if isinstance(g, (Polygon, MultiPolygon)):          # 廣場式的行人區：只取外框當線
                    g = MultiLineString([p.exterior for p in parts(g) if isinstance(p, Polygon)])
                g = g.simplify(SIMP)
                put('r', g, [ROAD[hw], br]); n['r'] += 1
            elif ww in RIVER and not isinstance(g, (Polygon, MultiPolygon)):
                put('l', g.simplify(SIMP), [RIVER[ww]]); n['l'] += 1
            elif isinstance(g, (Polygon, MultiPolygon)) and (tg.get('natural') == 'water' or ww == 'riverbank' or tg.get('landuse') in ('reservoir', 'basin')):
                g = g.simplify(SIMP)
                if not g.is_valid:
                    g = g.buffer(0)
                put('a', g, []); n['a'] += 1
            else:
                n['skip'] += 1

    cdir = os.path.join(out, 'c')
    if os.path.isdir(cdir):
        shutil.rmtree(cdir)
    os.makedirs(cdir)
    keys, total = [], 0
    for (i, j), d in C.items():
        d = {k: v for k, v in d.items() if v}
        if not d:
            continue
        s = json.dumps(d, separators=(',', ':'))
        with open(os.path.join(cdir, '%d_%d.json' % (i, j)), 'w') as f:
            f.write(s)
        keys.append('%d_%d' % (i, j)); total += len(s)
    ii = [int(k.split('_')[0]) for k in keys]; jj = [int(k.split('_')[1]) for k in keys]
    idx = {'v': time.strftime('%Y-%m-%d'), 'c': CH, 'bbox': [min(ii), min(jj), max(ii), max(jj)] if keys else None, 'k': sorted(keys)}
    with open(os.path.join(out, 'index.json'), 'w') as f:
        json.dump(idx, f, separators=(',', ':'))
    print('道路 %d、河流 %d、水域 %d、略過 %d；%d 塊，共 %.1f MB，%.0f 秒' % (n['r'], n['l'], n['a'], n['skip'], len(keys), total / 1e6, time.time() - t0))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
