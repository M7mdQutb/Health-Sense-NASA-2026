#!/usr/bin/env python3
"""
Tags every vertex of the muscles.js mesh with one of the 19 body-region ids and writes
data/muscle_regions.js  ->  window.MUSCLE_REGIONS = { ids:[...], n:<vertex count>, v:<base64 uint8 per vertex> }

Why: muscles.js is ONE mesh with no notion of regions. twin.js needs per-region meshes so that
hover / click / status colours / focus keep working exactly like they did with body_shell.
The region partition itself still comes from body_data.js (the old body_shell "skin" shells):
each muscle vertex takes the region of its nearest skin vertex.

Usage (from the project root):
    python tools/build_muscle_regions.py [muscles.js] [data/body_data.js] [data/muscle_regions.js]
Needs only numpy. Re-run whenever muscles.js or the skin shells in body_data.js change.
"""
import base64, json, re, sys
import numpy as np

MUSCLES = sys.argv[1] if len(sys.argv) > 1 else 'muscles.js'
BODY    = sys.argv[2] if len(sys.argv) > 2 else 'data/body_data.js'
OUT     = sys.argv[3] if len(sys.argv) > 3 else 'data/muscle_regions.js'

# Must match MUSCLE_HEIGHT / MUSCLE_Y in twin.js
HEIGHT, Y_OFFSET = 2.0, -0.9996
# body_data puts the hands inside the l_hip / r_hip skin shells. Anything labelled hip that is
# further out than the pelvis (|x| > HAND_X) is really hand/forearm -> re-label as the arm.
HAND_X, HAND_FIX = 0.40, True

# ---- decode muscles.js (same format createMuscles() reads) ----
src = open(MUSCLES, encoding='utf-8').read()
raw = base64.b64decode(re.search(r'DATA="([A-Za-z0-9+/=]+)"', src).group(1))
nv, nt = np.frombuffer(raw, '<u4', 2)
q = np.frombuffer(raw, '<i2', nv * 3, 8).reshape(-1, 3).astype(np.float64)
k = HEIGHT / 163.94
pos = np.stack([(q[:, 0] * .01 - .11) * k, (q[:, 1] * .01 - .35) * k + Y_OFFSET, q[:, 2] * .01 * k], 1)

# ---- decode skin shells from body_data.js ----
txt = open(BODY, encoding='utf-8').read()
regions = json.loads(txt[txt.index('=') + 1:].rstrip().rstrip(';'))['regions']
ids = list(regions.keys())
pts, lab = [], []
for ri, rid in enumerate(ids):
    s = regions[rid]['skin']
    p = np.frombuffer(base64.b64decode(s['p']), '<u2').reshape(-1, 3).astype(np.float64)
    pts.append(np.array(s['lo']) + p / 65535 * np.array(s['sc'])); lab.append(np.full(len(p), ri))
pts, lab = np.vstack(pts), np.concatenate(lab)

# ---- nearest skin vertex (chunked brute force, numpy only) ----
out = np.empty(nv, np.uint8); dist = np.empty(nv)
p2 = (pts ** 2).sum(1)
for a in range(0, nv, 2048):
    c = pos[a:a + 2048]
    d2 = (c ** 2).sum(1)[:, None] - 2 * c @ pts.T + p2[None, :]
    j = d2.argmin(1); out[a:a + 2048] = lab[j]; dist[a:a + 2048] = np.sqrt(np.maximum(d2[np.arange(len(c)), j], 0))

if HAND_FIX:
    for side, arm in (('l_', 'l_arm'), ('r_', 'r_arm')):
        hip = ids.index(side + 'hip')
        m = (out == hip) & (np.abs(pos[:, 0]) > HAND_X)
        out[m] = ids.index(arm)
        print('hand fix: %d %ship vertices -> %s' % (m.sum(), side, arm))

print('muscle verts %d, tris %d | gap to skin: mean %.3f, p95 %.3f, max %.3f' % (nv, nt, dist.mean(), np.percentile(dist, 95), dist.max()))
for ri, rid in enumerate(ids): print('  %-12s %6d' % (rid, (out == ri).sum()))

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('window.MUSCLE_REGIONS=' + json.dumps({'ids': ids, 'n': int(nv), 'v': base64.b64encode(out.tobytes()).decode()}, separators=(',', ':')) + ';\n')
print('wrote', OUT)
