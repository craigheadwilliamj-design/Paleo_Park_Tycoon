"""Standing idle and resting: a pose for each frame, the review sheet and previews.

    python tools/blender/idle.py tools/blender/animals/dimetrodon.json out/ [--export art/animals]

Three strips a facing, numbers under "idle" and "rest" in the species file (drawing px):
- idle: standing still. The ribs rise and fall, the tail tip sways slowly and the head looks a
  little to one side and back. Every motion is a whole number of waves a cycle, so it loops.
- lie: lying down, frame 0 standing to the last frame down. Played backwards it is getting up.
- rest: lying down. The belly rests on the ground (each column of the trunk drops until its
  underside is at the floor, so the tail lies flat and the chin rests a little higher), the elbows
  and knees splay up and out with the feet out to the sides, the tail curls to one side, and the
  back rises and falls with a slow breath.

With --export <dir>, writes <species>-idle|lie|rest-<facing>.png strips (64 px frames, feet at the
same anchor as the walk) and prints what data.js's sprite entry needs.
"""
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import camera as C       # noqa: E402
import animal as A       # noqa: E402
from turnaround import K, BG, display_px, ground, checker, on, row   # noqa: E402
from walk import ik, gif, facings, G, G_CENTER, R, R_CENTER   # noqa: E402


def smooth(v, n):
    out = list(v)
    for _ in range(n):
        out = [(out[max(0, i - 1)] + 2 * out[i] + out[min(len(out) - 1, i + 1)]) / 4 for i in range(len(out))]
    return out


class Still:
    """A pose standing (u = 0) or lying (u = 1), at loop time t (0..1)."""

    def __init__(self, sp, cols, mode, t, u):
        self.sp, self.mode, self.t, self.u = sp, mode, t, u
        self.idle, self.rest = sp["idle"], sp["rest"]
        nodes = {n["name"]: n for n in sp["_rig"]["nodes"]}
        self.xs = sorted(cols)
        self.x_tail = self.xs[0] + 0.5 - A.CX
        self.x_snout = self.xs[-1] + 0.5 - A.CX
        self.x_hip = nodes[sp["legs"]["back"]["upper"]]["px"] - A.CX
        self.x_sh = nodes[sp["legs"]["front"]["upper"]]["px"] - A.CX
        # per column: underside, centre and top of the trunk (model z), and how far it drops lying down
        self.zb, self.zc, self.zt = {}, {}, {}
        for x in self.xs:
            b, top, _ = cols[x]
            zb, zt = 75 - (b + 1), 75 - top
            self.zb[x], self.zt[x], self.zc[x] = zb, zt, (zb + zt) / 2
        r = self.rest
        floor = [r["chin"] if x + 0.5 - A.CX > self.x_sh + r["neck"] else r["floor"] for x in self.xs]
        drop = smooth([max(0.0, self.zb[x] - f) for x, f in zip(self.xs, floor)], 3)
        self.drop = dict(zip(self.xs, drop))

    def col(self, x):
        c = int(round(x + A.CX - 0.5))
        return min(self.xs[-1], max(self.xs[0], c))

    def tail_f(self, x):     # 0 at the hips, 1 at the tail tip
        return max(0.0, (self.x_hip - x) / (self.x_hip - self.x_tail))

    def head_f(self, x):     # 0 at the shoulders, 1 at the snout
        return max(0.0, min(1.0, (x - self.x_sh) / (self.x_snout - self.x_sh)))

    def ribs(self, x):       # 1 over the ribcage, easing to 0 at the hips and the neck
        if x <= self.x_hip or x >= self.x_sh:
            return 0.0
        return math.sin(math.pi * (x - self.x_hip) / (self.x_sh - self.x_hip))

    def breath(self):
        """How far the back is raised now (drawing px)."""
        if self.mode == "idle":
            n, amp = self.idle["breaths"], self.idle["breath"]
        else:
            n, amp = self.rest["breaths"], self.rest["breath"]
        return amp * 0.5 * (1 - math.cos(2 * math.pi * n * self.t))

    def body(self, v):
        x, y, z = v
        c = self.col(x)
        u, t = self.u, self.t
        # breathing: the back rises (the sail rides on it), the belly stays put
        up = min(1.0, max(0.0, (z - self.zb[c]) / max(1.0, self.zt[c] - self.zb[c])))
        z += self.breath() * self.ribs(x) * up
        y *= 1 + 0.06 * self.breath() * self.ribs(x)
        tf, hf = self.tail_f(x), self.head_f(x)
        if self.mode == "idle":
            i = self.idle
            y += i["tail_sway"] * tf ** 2 * math.sin(2 * math.pi * t)
            y += i["look"] * hf ** 1.5 * math.sin(2 * math.pi * t)
            z -= i["nod"] * hf ** 1.5 * 0.5 * (1 - math.cos(4 * math.pi * t))
        r = self.rest
        z -= u * self.drop[c]
        y += u * (r["curl"] * tf ** 1.6 + r["turn"] * hf ** 1.5)
        if self.mode == "rest":
            y += r["tail_twitch"] * tf ** 3 * math.sin(2 * math.pi * t)
        return (x, y, z)

    def leg(self, key, side, S, E, Wr, F0, F1):
        r = self.rest
        S2 = self.body(S)
        u = self.u
        fwd = r["front_fwd"] if key == "front" else -r["back_back"]
        out = side * r["splay"]
        # the foot goes out and forward (back), the wrist down onto the ground beside it
        mv = lambda p, lower: (p[0] + u * fwd, p[1] + u * out, p[2] - u * lower)
        W2 = mv(Wr, Wr[2] - r["wrist"])
        F02, F12 = mv(F0, 0.0), mv(F1, 0.0)
        L1 = np.linalg.norm(np.subtract(E, S))
        L2 = np.linalg.norm(np.subtract(Wr, E))
        E2 = ik(np.array(S2), np.array(W2), L1, L2, side)
        return S2, tuple(E2), W2, F02, F12


def frame(sp, scale, yaw, cam, out, name, mode, t, u, gap):
    sc = C.reset_scene()
    A.setup_label_render(sc)
    root = A.build(sp, lambda sp_, cols: Still(sp_, cols, mode, t, u))
    root.scale = (scale,) * 3
    root.rotation_euler = (0, 0, math.radians(yaw))
    cam(sc)
    path = os.path.join(out, f"_labels_{name}.png")
    C.render(sc, path)
    img = A.finish(sp, path, outline_gap=gap * scale)
    os.remove(path)
    return img


def ease(x):
    return 0.5 - 0.5 * math.cos(math.pi * x)


def main():
    species, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    sp = A.load(species)
    every = facings(sp.get("ns_turn", 0))
    FAC = {k: every[k] for k in sp.get("facings", every)}
    if "--facings" in sys.argv:
        FAC = {k: FAC[k] for k in sys.argv[sys.argv.index("--facings") + 1].split(",")}
    low = sp["name"].lower()
    ni, nl, nr = sp["idle"]["frames"], sp["rest"]["lie_frames"], sp["rest"]["frames"]
    # (strip, mode, t, u) per frame
    strips = {
        "idle": [("idle", i / ni, 0.0) for i in range(ni)],
        "lie": [("idle", 0.0, ease(i / (nl - 1))) for i in range(nl)],
        "rest": [("rest", i / nr, 1.0) for i in range(nr)],
    }
    secs = {"idle": sp["idle"]["cycle_s"], "lie": sp["rest"]["lie_s"], "rest": sp["rest"]["cycle_s"]}
    s1 = 1 / C.TILE_PX
    gpx = display_px(sp["len_m"])
    sg = A.scale_for(sp, gpx)

    def cam(size, center):
        return lambda sc: C.park_camera(sc, K, size, size, center=center)

    rv, g = {}, {}
    for k, yaw in FAC.items():
        for s, frs in strips.items():
            rv[k, s] = [frame(sp, s1, yaw, cam(R, R_CENTER), out, f"r{k}{s}{i}", m, t, u, 3.0) for i, (m, t, u) in enumerate(frs)]
            g[k, s] = [frame(sp, sg, yaw, cam(G, G_CENTER), out, f"g{k}{s}{i}", m, t, u, 6.0) for i, (m, t, u) in enumerate(frs)]

    def strip_row(frs, w, bgf, cap):
        r = Image.new("RGBA", (w * len(frs), w))
        for i, f in enumerate(frs):
            r.paste(on(bgf(w, w), f), (w * i, 0))
        return row([r], [cap])

    rows = []
    for s in strips:
        rows += [strip_row(rv[k, s], R, checker, f"{s} {k}, {len(strips[s])} frames, {secs[s]} s") for k in FAC]
    for s in strips:
        rows += [strip_row(g[k, s], G, ground, f"game size ({gpx} px), {s} {k}") for k in FAC]
    sheet = Image.new("RGBA", (max(r.width for r in rows), sum(r.height for r in rows)), BG)
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height
    sheet.save(os.path.join(out, f"{low}-idle.png"))

    # previews: every facing side by side; idle twice, lie down, rest twice, get up
    def seq(src):
        order = [("idle", i) for i in range(ni)] * 2 + [("lie", i) for i in range(nl)] \
            + [("rest", i) for i in range(nr)] * 2 + [("lie", i) for i in reversed(range(nl))]
        ms = [secs[s] * 1000 / len(strips[s]) for s, _ in order]
        return order, ms

    order, ms = seq(strips)
    for name, src, size, bgf, zoom in (("review", rv, R, checker, 2), ("game", g, G, ground, 4)):
        frs = []
        for s, i in order:
            im = Image.new("RGBA", (size * len(FAC), size))
            for j, k in enumerate(FAC):
                im.paste(on(bgf(size, size), src[k, s][i]), (size * j, 0))
            frs.append(on(Image.new("RGBA", im.size, BG), im).resize((im.width * zoom, im.height * zoom), Image.NEAREST).convert("RGB"))
        frs[0].save(os.path.join(out, f"{low}-idle-{name}.gif"), save_all=True, append_images=frs[1:], duration=[round(m) for m in ms], loop=0)
    print("wrote", os.path.join(out, f"{low}-idle.png"), "and the gifs")

    if "--export" in sys.argv:
        dest = sys.argv[sys.argv.index("--export") + 1]
        os.makedirs(dest, exist_ok=True)
        boxes = {}
        for k in FAC:
            bb = []
            for s in strips:
                strip = Image.new("RGBA", (G * len(g[k, s]), G))
                for i, f in enumerate(g[k, s]):
                    strip.paste(f, (G * i, 0))
                    bb.append(f.getbbox())
                strip.save(os.path.join(dest, f"{low}-{s}-{k}.png"))
            boxes[k] = [min(b[0] for b in bb), min(b[1] for b in bb), max(b[2] for b in bb), max(b[3] for b in bb)]
            if boxes[k][0] == 0 or boxes[k][1] == 0 or boxes[k][2] == G or boxes[k][3] == G:
                print(f"WARNING: {k} touches the frame edge: {boxes[k]}")
        print(f"export: idle: {{ frames: {ni}, s: {secs['idle']} }}, lie: {{ frames: {nl}, min: {sp['rest']['lie_min']} }}, "
              f"rest: {{ frames: {nr}, s: {secs['rest']} }}")
        print("export: still boxes (merge with the walk's): " + ", ".join(f"{k}: {v}" for k, v in boxes.items()))


if __name__ == "__main__":
    main()
