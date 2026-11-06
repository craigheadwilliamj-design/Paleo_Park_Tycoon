"""The walk cycle: a pose for each frame, and the review sheet and previews.

    python tools/blender/walk.py tools/blender/animals/dimetrodon.json out/

A sprawling walk (Dimetrodon and other early synapsids): the spine swings side to side in a wave,
hips and shoulders opposite, growing toward the tail tip; diagonal limb pairs move together
(front left with hind right); each foot plants, slides back while the body passes over it, then
lifts and swings forward. Elbows and knees are solved each frame (two-bone IK) and pushed out to
the side, so the limbs stay sprawled. Numbers are in the species file under "walk", in drawing px.

Writes <species>-walk.png (frames at 4x: side and both 3/4 facings at review size, both facings at
game size, then 1x) and animated previews <species>-walk-*.gif.
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import camera as C       # noqa: E402
import animal as A       # noqa: E402
from turnaround import K, TURN, ZOOM, BG, display_px, ground, checker, on, row   # noqa: E402


class Walk:
    def __init__(self, sp, cols, t):
        self.w = sp["walk"]
        self.t = t
        nodes = {n["name"]: n for n in sp["_rig"]["nodes"]}
        xs = sorted(cols)
        self.x_tail = xs[0] + 0.5 - A.CX
        self.x_snout = xs[-1] + 0.5 - A.CX
        self.x_hip = nodes[sp["legs"]["back"]["upper"]]["px"] - A.CX
        self.x_sh = nodes[sp["legs"]["front"]["upper"]]["px"] - A.CX

    def amp(self, x):
        w = self.w
        if x < self.x_hip:                              # tail: grows toward the tip
            f = (self.x_hip - x) / (self.x_hip - self.x_tail)
            return w["sway_trunk"] + (w["sway_tail"] - w["sway_trunk"]) * f ** 1.5
        if x > self.x_sh:                               # neck and head: steadier
            f = min(1.0, (x - self.x_sh) / max(1.0, self.x_snout - self.x_sh))
            return w["sway_trunk"] + (w["sway_head"] - w["sway_trunk"]) * f
        return w["sway_trunk"]

    def lat(self, x):
        # hips and shoulders swing opposite: half a wave between them
        phase = math.pi * (x - self.x_hip) / (self.x_sh - self.x_hip)
        return self.amp(x) * math.sin(2 * math.pi * self.t + phase)

    def bob(self):
        return self.w["bob"] * math.cos(4 * math.pi * self.t)

    def body(self, v):
        x, y, z = v
        return (x, y + self.lat(x), z + self.bob())

    def foot_offset(self, key, side):
        """Where the foot is in its step: (dx forward, lift)."""
        w = self.w
        # diagonal pairs: front left (+1) with hind right (-1)
        off = 0.0 if (key == "front") == (side > 0) else 0.5
        p = (self.t + off) % 1.0
        s, st = w["stride"], w["stance"]
        if p < st:
            return s / 2 - s * p / st, 0.0
        q = (p - st) / (1 - st)
        return -s / 2 + s * q, w["lift"] * math.sin(math.pi * q)

    def leg(self, key, side, S, E, Wr, F0, F1):
        dx, lift = self.foot_offset(key, side)
        mv = lambda p: (p[0] + dx, p[1], p[2] + lift)
        S2 = self.body(S)
        W2, F02, F12 = mv(Wr), mv(F0), mv(F1)
        E2 = ik(np.array(S2), np.array(W2), np.linalg.norm(np.subtract(E, S)), np.linalg.norm(np.subtract(Wr, E)), side)
        return S2, tuple(E2), W2, F02, F12


def ik(S, W, L1, L2, side):
    """Elbow or knee for a limb from S to W with segment lengths L1, L2, bent outward."""
    d = np.linalg.norm(W - S)
    d = min(d, L1 + L2 - 1e-3)
    u = (W - S) / np.linalg.norm(W - S)
    a = (L1 * L1 - L2 * L2 + d * d) / (2 * d)
    h = math.sqrt(max(0.0, L1 * L1 - a * a))
    pole = np.array([0.0, float(side), 0.35])
    v = pole - pole.dot(u) * u
    v /= np.linalg.norm(v)
    return S + a * u + h * v


def frame(sp, scale, yaw, cam, out, name, t, gap):
    sc = C.reset_scene()
    A.setup_label_render(sc)
    root = A.build(sp, lambda sp_, cols: Walk(sp_, cols, t))
    root.scale = (scale,) * 3
    root.rotation_euler = (0, 0, math.radians(yaw))
    cam(sc)
    path = os.path.join(out, f"_labels_{name}.png")
    C.render(sc, path)
    img = A.finish(sp, path, outline_gap=gap * scale)
    os.remove(path)
    return img


def gif(frames, path, ms, zoom=ZOOM, bg=None):
    imgs = []
    for f in frames:
        f = on(bg, f) if bg is not None else f
        imgs.append(f.resize((f.width * zoom, f.height * zoom), Image.NEAREST).convert("RGB"))
    imgs[0].save(path, save_all=True, append_images=imgs[1:], duration=ms, loop=0)


def main():
    species, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    sp = A.load(species)
    low = sp["name"].lower()
    n = sp["walk"]["frames"]
    ms = round(1000 * sp["walk"]["cycle_s"] / n)
    rig = sp["_rig"]
    W, H = rig["cell"]["w"], rig["cell"]["h"]
    s1 = 1 / C.TILE_PX
    ts = [i / n for i in range(n)]

    side = [frame(sp, s1, 0, lambda sc: C.view_camera(sc, (90, 0, 0), W, H, ((W / 2 - A.CX) * s1, 0, H / 2 * s1)),
                  out, f"side{i}", t, 3.0) for i, t in enumerate(ts)]
    q = {}
    for name, yaw in (("right", -TURN), ("left", -180 + TURN)):
        q[name] = [frame(sp, s1, yaw, lambda sc: C.park_camera(sc, K, 84, 72, center=(0, 1.0)),
                         out, f"{name}{i}", t, 3.0) for i, t in enumerate(ts)]
    gpx = display_px(sp["len_m"])
    sg = A.scale_for(sp, gpx)
    g = {}
    for name, yaw in (("right", -TURN), ("left", -180 + TURN)):
        g[name] = [frame(sp, sg, yaw, lambda sc: C.park_camera(sc, K, 48, 48, center=(0, 0.5)),
                         out, f"g{name}{i}", t, 6.0) for i, t in enumerate(ts)]

    # the game's sprite strips: one row of frames per facing
    for name, fr in g.items():
        strip = Image.new("RGBA", (48 * n, 48))
        for i, f in enumerate(fr):
            strip.paste(f, (48 * i, 0))
        strip.save(os.path.join(out, f"{low}-walk-{name}.png"))

    def strip_row(frs, w, h, bgf, cap):
        r = Image.new("RGBA", (w * n, h))
        for i, f in enumerate(frs):
            r.paste(on(bgf(w, h), f), (w * i, 0))
        return row([r], [cap])

    rows = [strip_row(side, W, H, checker, f"side, {n} frames, {sp['walk']['cycle_s']} s a cycle"),
            strip_row(q["right"], 84, 72, checker, f"3/4 front-right (turned {TURN} deg)"),
            strip_row(q["left"], 84, 72, checker, "3/4 front-left"),
            strip_row(g["right"], 48, 48, ground, f"game size ({gpx} px), front-right"),
            strip_row(g["left"], 48, 48, ground, "front-left")]
    sheet = Image.new("RGBA", (max(r.width for r in rows), sum(r.height for r in rows)), BG)
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height
    sheet.save(os.path.join(out, f"{low}-walk.png"))

    gif(side, os.path.join(out, f"{low}-walk-side.gif"), ms, bg=checker(W, H))
    both = []
    for a, b in zip(q["right"], q["left"]):
        im = Image.new("RGBA", (168, 72))
        im.paste(on(checker(84, 72), a), (0, 0))
        im.paste(on(checker(84, 72), b), (84, 0))
        both.append(im)
    gif(both, os.path.join(out, f"{low}-walk-3q.gif"), ms)
    game = []
    for a, b in zip(g["right"], g["left"]):
        im = Image.new("RGBA", (96, 48))
        im.paste(on(ground(48, 48), a), (0, 0))
        im.paste(on(ground(48, 48), b), (48, 0))
        game.append(im)
    gif(game, os.path.join(out, f"{low}-walk-game.gif"), ms)
    print("wrote", os.path.join(out, f"{low}-walk.png"), "and the gifs")


if __name__ == "__main__":
    main()
