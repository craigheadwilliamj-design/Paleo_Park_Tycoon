"""The walk cycle: a pose for each frame, and the review sheet and previews.

    python tools/blender/walk.py tools/blender/animals/dimetrodon.json out/

A sprawling walk (Dimetrodon and other early synapsids): the spine swings side to side in a wave,
hips and shoulders opposite, growing toward the tail tip; diagonal limb pairs move together
(front left with hind right); each foot plants, slides back while the body passes over it, then
lifts and swings forward. Elbows and knees are solved each frame (two-bone IK) and pushed out to
the side, so the limbs stay sprawled. Numbers are in the species file under "walk", in drawing px.

With --export <dir>, also writes the game sprites there (walk strips and a standing frame per
facing) and prints what data.js needs.

Writes <species>-walk.png (the frames per facing at review size, then at game size on the park
ground) and animated previews <species>-walk-review.gif and -game.gif.
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import camera as C       # noqa: E402
import animal as A       # noqa: E402
from turnaround import K, ZOOM, BG, display_px, ground, checker, on, row   # noqa: E402


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
    root = A.build(sp, (lambda sp_, cols: Walk(sp_, cols, t)) if t is not None else None)
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


# Facings the game uses, as yaws (the model faces +x; the camera looks north). North and south
# are turned 40 degrees off the axis toward the side the animal last faced: straight on, the
# sail is edge-on and the animal reads as a stick.
FACINGS = {"east": 0, "west": 180, "northeast": 50, "northwest": 130, "southeast": -50, "southwest": -130}
G = 64                   # game frame size (px)
G_CENTER = (0, 0.25)     # ground point at the frame's centre (m): puts the feet at G_ANCHOR
G_ANCHOR = (32, 36)
R = 112                  # review frame size, at the drawing's own scale
R_CENTER = (0, 0.5)


def main():
    species, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    sp = A.load(species)
    low = sp["name"].lower()
    n = sp["walk"]["frames"]
    ms = round(1000 * sp["walk"]["cycle_s"] / n)
    s1 = 1 / C.TILE_PX
    ts = [i / n for i in range(n)]
    gpx = display_px(sp["len_m"])
    sg = A.scale_for(sp, gpx)

    def cam(size, center):
        return lambda sc: C.park_camera(sc, K, size, size, center=center)

    rv, g, stand = {}, {}, {}
    for name, yaw in FACINGS.items():
        rv[name] = [frame(sp, s1, yaw, cam(R, R_CENTER), out, f"r{name}{i}", t, 3.0) for i, t in enumerate(ts)]
        g[name] = [frame(sp, sg, yaw, cam(G, G_CENTER), out, f"g{name}{i}", t, 6.0) for i, t in enumerate(ts)]
        stand[name] = frame(sp, sg, yaw, cam(G, G_CENTER), out, f"s{name}", None, 6.0)

    def strip_row(frs, w, bgf, cap):
        r = Image.new("RGBA", (w * n, w))
        for i, f in enumerate(frs):
            r.paste(on(bgf(w, w), f), (w * i, 0))
        return row([r], [cap])

    rows = [strip_row(rv[k], R, checker, f"{k}, {n} frames, {sp['walk']['cycle_s']} s a cycle") for k in FACINGS]
    rows += [strip_row(g[k], G, ground, f"game size ({gpx} px long), {k}") for k in FACINGS]
    sheet = Image.new("RGBA", (max(r.width for r in rows), sum(r.height for r in rows)), BG)
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height
    sheet.save(os.path.join(out, f"{low}-walk.png"))

    def four(frames_by, size, bgf):
        out_frames = []
        for i in range(n):
            im = Image.new("RGBA", (size * len(FACINGS), size))
            for j, k in enumerate(FACINGS):
                im.paste(on(bgf(size, size), frames_by[k][i]), (size * j, 0))
            out_frames.append(im)
        return out_frames
    gif(four(rv, R, checker), os.path.join(out, f"{low}-walk-review.gif"), ms, zoom=2)
    gif(four(g, G, ground), os.path.join(out, f"{low}-walk-game.gif"), ms)
    print("wrote", os.path.join(out, f"{low}-walk.png"), "and the gifs")

    if "--export" in sys.argv:
        # Game sprites: G px frames, the animal's feet (the sim's x, y) at G_ANCHOR in each frame.
        dest = sys.argv[sys.argv.index("--export") + 1]
        os.makedirs(dest, exist_ok=True)
        boxes = {}
        for k in FACINGS:
            strip = Image.new("RGBA", (G * n, G))
            for i, f in enumerate(g[k]):
                strip.paste(f, (G * i, 0))
            strip.save(os.path.join(dest, f"{low}-walk-{k}.png"))
            stand[k].save(os.path.join(dest, f"{low}-stand-{k}.png"))
            bb = [f.getbbox() for f in g[k] + [stand[k]]]
            boxes[k] = [min(b[0] for b in bb), min(b[1] for b in bb), max(b[2] for b in bb), max(b[3] for b in bb)]
            if boxes[k][0] == 0 or boxes[k][1] == 0 or boxes[k][2] == G or boxes[k][3] == G:
                print(f"WARNING: {k} touches the frame edge: {boxes[k]}")
        # The body passes over a planted foot in the stance part of the cycle, so it covers
        # stride / stance per cycle (drawing px), scaled to game px.
        step = sp["walk"]["stride"] / sp["walk"]["stance"] * sg * C.TILE_PX
        box = ", ".join(f"{k}: {v}" for k, v in boxes.items())
        print(f"export: sprite: {{ name: \"{low}\", frame: {G}, frames: {n}, anchor: [{G_ANCHOR[0]}, {G_ANCHOR[1]}], "
              f"box: {{ {box} }}, cycle: {step / C.TILE_PX:.3f} }}")


if __name__ == "__main__":
    main()
