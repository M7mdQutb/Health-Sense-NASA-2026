#!/usr/bin/env python3
"""Reads the 3 OBJ models, registers them into one body space, splits them into the
19 contract Region IDs, decimates, and writes data/body_data.js (works from file:// too).
Usage:  python tools/build_models.py [--debug]"""
import numpy as np, json, base64, sys, os
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGIONS = ["head", "neck", "chest", "upper_back", "lower_back", "abdomen", "spine", "l_shoulder", "r_shoulder",
           "l_arm", "r_arm", "l_hip", "r_hip", "l_femur", "r_femur", "l_knee", "r_knee", "l_lower_leg", "r_lower_leg"]
SK_TOP, SK_BOT = 3.497, -3.412


# ---------- OBJ loading ----------
def load_obj(fn):
    """Returns (V, {group: faces}). Groups are the OBJ objects/groups; if the file holds a single
    object but several `usemtl` materials (Blender 5 export of organs.obj) groups are the materials."""
    V, faces, obj, mtl = [], {}, "default", ""
    with open(fn, errors="ignore") as fh:
        for line in fh:
            if line.startswith("v "):
                V.append(line.split()[1:4])
            elif line[:2] in ("o ", "g "):
                obj = line[2:].strip()
            elif line.startswith("usemtl "):
                mtl = line[7:].strip()
            elif line.startswith("f "):
                # OBJ allows negative (relative) indices: -1 = last vertex read so far
                ix = [int(t.split("/")[0]) for t in line.split()[1:]]
                ix = [i if i > 0 else len(V) + i + 1 for i in ix]
                faces.setdefault((obj, mtl), []).extend([ix[0], ix[i], ix[i + 1]] for i in range(1, len(ix) - 1))
    V = np.array(V, dtype=np.float64)
    objs = {k[0] for k in faces}; mtls = {k[1] for k in faces if k[1]}
    by_mtl = len(objs) == 1 and len(mtls) > 1
    groups = {}
    for (o, m), f in faces.items():
        groups.setdefault(m if by_mtl else o, []).extend(f)
    return V, {g: np.array(f, dtype=np.int64) - 1 for g, f in groups.items() if f}


def smooth(a, lo, hi):
    t = np.clip((a - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


# ---------- decimation by vertex clustering ----------
def compact(V, F):
    u, inv = np.unique(F.ravel(), return_inverse=True)
    return V[u], inv.reshape(-1, 3)


def cluster(V, F, cell):
    q = np.floor(V / cell).astype(np.int64)
    _, inv = np.unique(q, axis=0, return_inverse=True)
    inv = inv.ravel(); n = inv.max() + 1
    cnt = np.bincount(inv, minlength=n)[:, None]
    P = np.stack([np.bincount(inv, V[:, k], minlength=n) for k in range(3)], 1) / cnt
    G = inv[F]
    ok = (G[:, 0] != G[:, 1]) & (G[:, 1] != G[:, 2]) & (G[:, 0] != G[:, 2])
    G = G[ok]
    if len(G):  # drop duplicate triangles but keep the ORIGINAL vertex order (winding / normals)
        _, keep = np.unique(np.sort(G, axis=1), axis=0, return_index=True)
        G = G[np.sort(keep)]
    return P, G


def decimate(V, F, target):
    if len(F) <= target:
        return compact(V, F)
    lo, hi = 1e-4, 2.0
    best = cluster(V, F, hi)
    for _ in range(14):
        mid = (lo * hi) ** .5
        P, G = cluster(V, F, mid)
        if len(G) > target: lo = mid
        else: hi, best = mid, (P, G)
    return compact(*best)


# ---------- registration into skeleton space (y up, +z anterior, +x = anatomical left) ----------
def reg_shell(V):
    s = (SK_TOP - SK_BOT) / (V[:, 1].max() - V[:, 1].min())
    P = np.empty_like(V)
    P[:, 0] = (V[:, 0] - 0.07) * s
    P[:, 1] = SK_BOT + (V[:, 1] - V[:, 1].min()) * s
    P[:, 2] = V[:, 2] * s
    torso = (P[:, 1] > 0.6) & (P[:, 1] < 1.8) & (np.abs(P[:, 0]) < 0.45)
    P[:, 2] -= np.median(P[torso, 2])  # centre torso depth on the ribcage
    return P


def arm_weight(P):
    """0..1 membership of the A-posed shell arms (feet/legs excluded by height)."""
    return smooth(np.abs(P[:, 0]), 0.62, 0.86) * (P[:, 1] < 2.45) * (P[:, 1] > 0.15)


def lower_arms(P, deg=34.0, stretch=1.22):
    """Shell is A-posed; skeleton arms hang down. Rotate arm vertices about each shoulder pivot."""
    out = P.copy()
    for sgn in (1, -1):
        piv = np.array([sgn * 0.60, 2.25]); d = P[:, [0, 1]] - piv
        w = arm_weight(P) * (np.sign(P[:, 0]) == sgn)
        a = np.radians(deg) * w * (-sgn)
        c, s_ = np.cos(a), np.sin(a)
        k = 1 + (stretch - 1) * w                      # skeleton arms are longer than the shell's
        out[:, 0] = np.where(w > 0, piv[0] + k * (d[:, 0] * c - d[:, 1] * s_), out[:, 0])
        out[:, 1] = np.where(w > 0, piv[1] + k * (d[:, 0] * s_ + d[:, 1] * c), out[:, 1])
    return out


def straighten_z(P, ref):
    """Shell legs lean backwards relative to the skeleton: shift depth per height band to match the bones."""
    ys = np.arange(-3.0, 0.5, 0.4); keep = arm_weight(P) < 0.1; dz = []
    for y in ys:
        a = keep & (np.abs(P[:, 1] - y) < 0.3); b = np.abs(ref[:, 1] - y) < 0.3
        dz.append(np.median(ref[b, 2]) - np.median(P[a, 2]) if a.any() and b.any() else 0.0)
    ys = np.append(ys, 1.0); dz = np.append(dz, 0.0)
    out = P.copy(); out[:, 2] += np.interp(P[:, 1], ys, dz) * (P[:, 1] < 1.0)
    return out


def reg_organs(V):
    top, bot = 2.45, -0.15
    s = (top - bot) / (0.352 + 0.386)
    P = np.empty_like(V)
    P[:, 0] = (V[:, 0] + 0.022) * s
    P[:, 1] = top + (V[:, 1] - 0.352) * s
    P[:, 2] = (V[:, 2] + 0.84) * s - 0.04
    return P


# ---------- region classification ----------
def side_of(x):
    return np.where(x > 0, "l_", "r_")


def leg_label(C):
    sd = side_of(C[:, 0]); y = C[:, 1]
    return np.where(y >= -0.40, np.char.add(sd, "hip"),
           np.where(y >= -1.45, np.char.add(sd, "femur"),
           np.where(y >= -1.90, np.char.add(sd, "knee"), np.char.add(sd, "lower_leg")))).astype(object)


def torso_label(C):
    ant = C[:, 2] > 0; hi = C[:, 1] >= 1.35
    return np.where(ant, np.where(hi, "chest", "abdomen"), np.where(hi, "upper_back", "lower_back")).astype(object)


def classify(C, arm_hint=None):
    x, y = C[:, 0], C[:, 1]; ax = np.abs(x); sd = side_of(x)
    R = torso_label(C)
    R[(C[:, 2] <= 0) & (ax < 0.16) & (y >= 0.55) & (y < 2.3)] = "spine"
    low = y < 0.55
    R[low] = leg_label(C)[low]
    R[(y >= 2.28) & (y < 2.62)] = "neck"
    R[y >= 2.62] = "head"
    if arm_hint is not None:
        dist = np.minimum(np.hypot(x - 0.60, y - 2.25), np.hypot(x + 0.60, y - 2.25))
        sh = arm_hint & ((dist < 0.5) | (y > 2.25)); arm = arm_hint & ~sh
    else:
        sh = (ax > 0.42) & (y > 1.95) & (y < 2.62) & (np.hypot(ax - 0.62, y - 2.2) < 0.5)
        arm = (ax > 0.62) & (y < 1.95) & (y > -1.0)
    R[sh] = np.char.add(sd, "shoulder")[sh]
    R[arm] = np.char.add(sd, "arm")[arm]
    return R


SK = {"Group32905": "head", "Group53539": "head", "Group13826": "head", "Group52252": "neck",
      "Group14332": "vert", "Group59056": "shoulder", "Group14401": "shoulder", "Group5436": "ribs",
      "Group14309": "ribs", "Group30793": "humerus", "Group31541": "arm", "Group58437": "arm",
      "Group55587": "arm", "Group36791": "hip"}
SK_BUDGET = {"Group32905": 3500, "Group14332": 5500, "Group14309": 4500, "Group52252": 600, "Group36791": 3000,
             "Group46824": 1800, "Group16961": 1200, "Group9098": 500, "Group19657": 1500, "Group30793": 900,
             "Group14401": 900, "Group31541": 500, "Group58437": 400, "Group55587": 1400, "Group5436": 400,
             "Group59056": 300, "Group53539": 150, "Group13826": 150, "Group60274": 150}
ORG_BUDGET = {"heart": 1800, "trachea": 900, "colon": 900, "small_intestine": 1100, "l_lung": 700, "r_lung": 700,
              "liver": 600, "stomach": 400, "kidneys": 300, "spleen": 200, "pancreas": 200, "gallbladder": 150,
              "bladder": 150, "diaphragm": 400, "glands": 200, "l_ureter": 120}
ORG_KEYS = ["small_intestine", "gallbladder", "kidneys", "bladder", "l_ureter", "spleen", "pancreas", "stomach",
            "liver", "diaphragm", "trachea", "l_lung", "r_lung", "glands", "heart", "colon"]


def skeleton_labels(g, C):
    kind = SK.get(g, "leg"); sd = side_of(C[:, 0])
    if kind == "head": return np.full(len(C), "head", dtype=object)
    if kind == "neck": return np.full(len(C), "neck", dtype=object)
    if kind == "vert": return np.where(C[:, 1] > 2.28, "neck", "spine").astype(object)
    if kind == "shoulder": return np.char.add(sd, "shoulder").astype(object)
    if kind == "humerus":
        d = np.minimum(np.hypot(C[:, 0] - .6, C[:, 1] - 2.25), np.hypot(C[:, 0] + .6, C[:, 1] - 2.25))
        return np.char.add(sd, np.where(d < .5, "shoulder", "arm")).astype(object)
    if kind == "arm": return np.char.add(sd, "arm").astype(object)
    if kind == "hip": return np.char.add(sd, "hip").astype(object)
    if kind == "ribs": return torso_label(C)
    return leg_label(C)



# ---------- skeleton without group names (single-object export) ----------
def split_parts(V, F):
    """Split a mesh into its loose (connected) parts: skull, each rib, each vertebra, pelvis, ..."""
    n = len(V); e = np.vstack([F[:, [0, 1]], F[:, [1, 2]]])
    _, lab = connected_components(coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n)), directed=False)
    fl = lab[F[:, 0]]
    return [F[fl == c] for c in np.unique(fl)]


def skeleton_pos_labels(C):
    x, y = C[:, 0], C[:, 1]; ax = np.abs(x); sd = side_of(x)
    R = torso_label(C)
    R[(C[:, 2] <= 0) & (ax < 0.16) & (y >= 0.55) & (y < 2.3)] = "spine"
    low = y < 0.55; R[low] = leg_label(C)[low]
    R[(y >= 2.28) & (y < 2.62)] = "neck"; R[y >= 2.62] = "head"
    d = np.minimum(np.hypot(x - .6, y - 2.25), np.hypot(x + .6, y - 2.25))
    sh = (d < .5) & (y > 0.9)
    R[sh] = np.char.add(sd, "shoulder")[sh]
    arm = (ax > 0.65) & (y > -0.5) & ~sh
    R[arm] = np.char.add(sd, "arm")[arm]
    return R


def main():
    meshes = {k: {r: [] for r in REGIONS} for k in ("skin", "bone", "organ")}

    def put(kind, V, F, lab):
        for r in set(lab):
            meshes[kind][r].append((V, F[lab == r]))

    # skeleton -> bone meshes
    V, G = load_obj(f"{ROOT}/models/skeleton.obj"); print("skeleton verts", len(V)); SKV = V
    named = any(g in SK for g in G)               # old export with named groups (Group32905 ...)
    for g, F in G.items():
        parts = [F] if named else split_parts(V, F)   # new export: one object -> split loose parts
        for Fp in parts:
            Vp, Fq = compact(V, Fp)
            budget = SK_BUDGET.get(g, 400) if named else max(150, int(len(Fq) * 0.3))
            Vd, Fd = decimate(Vp, Fq, budget)
            if len(Fd) == 0: continue
            C = Vp[Fq].mean(1); _, nn = cKDTree(C).query(Vd[Fd].mean(1))
            lab = (skeleton_labels(g, C) if named else skeleton_pos_labels(C))[nn]
            put("bone", Vd, Fd, lab)
    # organs
    V, G = load_obj(f"{ROOT}/models/organs.obj"); V = reg_organs(V); print("organ verts", len(V))
    by = {}
    for g, F in G.items():
        k = next((n for n in ORG_KEYS if n in g.lower()), None)
        if k is None:
            print(f"  WARNING: organ group '{g}' matches no ORG_KEYS entry; skipped"); continue
        by.setdefault(k, []).append(F)
    for n, Fs in by.items():
        Vd, Fd = decimate(V, np.vstack(Fs), ORG_BUDGET.get(n, 300)); C = Vd[Fd].mean(1)
        if n in ("heart", "l_lung", "r_lung", "diaphragm", "glands"): lab = np.full(len(C), "chest", dtype=object)
        elif n == "trachea": lab = np.where(C[:, 1] > 2.28, "neck", "chest").astype(object)
        elif n in ("kidneys", "l_ureter"): lab = np.full(len(C), "lower_back", dtype=object)
        else: lab = np.full(len(C), "abdomen", dtype=object)
        put("organ", Vd, Fd, lab)
    # skin shell (arms classified in the original A-pose, then lowered)
    V, G = load_obj(f"{ROOT}/models/body_shell.obj"); F = np.vstack(list(G.values())); print("shell verts", len(V), "faces", len(F))
    P = straighten_z(reg_shell(V), SKV); P2 = lower_arms(P)
    w_all = arm_weight(P); ref = SKV[(np.abs(SKV[:, 0]) > 0.7) & (SKV[:, 1] > 0) & (SKV[:, 1] < 1.7)]
    sel = (w_all > 0.5) & (P2[:, 1] < 1.7)
    for sgn in (1, -1):   # this shell has its arms staggered in depth, so level each arm separately
        side = np.sign(P[:, 0]) == sgn
        P2[:, 2] += w_all * side * (np.median(ref[np.sign(ref[:, 0]) == sgn, 2]) - np.median(P2[sel & side, 2]))
    Cb = P[F].mean(1)
    armflag = arm_weight(Cb) > 0.5
    C2 = P2[F].mean(1); lab = classify(C2, arm_hint=armflag)
    Vd, Fd = decimate(P2, F, 9000)
    _, nn = cKDTree(C2).query(Vd[Fd].mean(1)); put("skin", Vd, Fd, lab[nn])

    # normalise to world: height 2, centred on y=0
    k = 2.0 / (SK_TOP - SK_BOT); yc = (SK_TOP + SK_BOT) / 2; total = 0; out = {"regions": {}}
    for r in REGIONS:
        entry = {}; ref_pts = None
        for kind in ("skin", "bone", "organ"):
            parts = meshes[kind][r]
            if not parts: continue
            Ps, Fs, off = [], [], 0
            for Vp, Fp in parts:
                Vc, Fc = compact(Vp, Fp); Ps.append(Vc); Fs.append(Fc + off); off += len(Vc)
            Pm = (np.vstack(Ps) - [0, yc, 0]) * k; Fm = np.vstack(Fs)
            assert len(Pm) <= 65535, f"{r}/{kind}: {len(Pm)} vertices do not fit uint16 indices; lower the budget"
            if kind == "skin" or ref_pts is None: ref_pts = Pm      # prefer skin for centre/radius
            lo, hi = Pm.min(0), Pm.max(0); sc = np.maximum(hi - lo, 1e-6)
            q = np.round((Pm - lo) / sc * 65535).astype(np.uint16)
            entry[kind] = {"lo": lo.round(5).tolist(), "sc": sc.round(5).tolist(),
                           "p": base64.b64encode(q.tobytes()).decode(),
                           "i": base64.b64encode(Fm.astype(np.uint16).tobytes()).decode(), "tris": int(len(Fm))}
            total += len(Fm)
        if not entry:
            print(f"{r:12s}(no geometry)"); continue
        entry["center"] = np.median(ref_pts, 0).round(4).tolist()
        entry["radius"] = round(float(np.linalg.norm(ref_pts.max(0) - ref_pts.min(0)) / 2), 4)
        out["regions"][r] = entry
        print(f"{r:12s}" + " ".join(f"{kd}:{entry[kd]['tris']}" for kd in ("skin", "bone", "organ") if kd in entry))
    missing = [r for r in REGIONS if "skin" not in out["regions"].get(r, {})]
    print("total triangles:", total, "| regions without skin mesh:", missing)
    os.makedirs(f"{ROOT}/data", exist_ok=True)
    with open(f"{ROOT}/data/body_data.js", "w") as f:
        f.write("window.TWIN_DATA=" + json.dumps(out, separators=(",", ":")) + ";\n")
    print("wrote data/body_data.js,", os.path.getsize(f"{ROOT}/data/body_data.js") // 1024, "KB")
    if "--debug" in sys.argv: debug_plot(meshes, yc, k)


def debug_plot(meshes, yc, k):
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 2, figsize=(14, 12)); cm = plt.get_cmap("tab20")
    for i, r in enumerate(REGIONS):
        for kind, sz in (("skin", 3), ("bone", 1), ("organ", 1)):
            for Vp, Fp in meshes[kind][r]:
                C = (Vp[Fp].mean(1) - [0, yc, 0]) * k
                ax[0].scatter(C[:, 0], C[:, 1], s=sz, color=cm(i % 20)); ax[1].scatter(C[:, 2], C[:, 1], s=sz, color=cm(i % 20))
    for a in ax: a.set_aspect("equal")
    plt.savefig(f"{ROOT}/data/debug.png", dpi=60)


if __name__ == "__main__":
    main()
