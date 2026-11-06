"""Turnaround sheet for one animal: the model beside the drawing it came from.

    python tools/blender/turnaround.py tools/blender/animals/dimetrodon.json out/

Rows (all shown at 4x):
1. the drawing, the model from the side at the same scale, and where they differ
2. front, top and both 3/4 facings at the drawing's scale (K = 0.75 for the 3/4s)
3. both 3/4 facings at game size (the size curve) on the park ground, and the same at 1x
"""
import math
import os
import sys

import bpy
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import camera as C   # noqa: E402
import animal as A   # noqa: E402

K = 0.75
TURN = 20                # degrees the animal is turned toward the camera in the 3/4 views
TURNS = (20, 30)     # compared at game size
ZOOM = 4
PARK_GROUND = "#7d8c58"
BG = (30, 30, 34, 255)


def display_px(m):               # src/view/display.js
    return max(7, round(28 * (m / 1.75) ** 0.6))


def render_view(sp, scale, yaw, cam, out, name, gap=3.0):
    """Build the model, place it, set the camera with cam(sc), render labels and finish to palette."""
    sc = C.reset_scene()
    A.setup_label_render(sc)
    root = A.build(sp)
    root.scale = (scale,) * 3
    root.rotation_euler = (0, 0, math.radians(yaw))
    cam(sc)
    path = os.path.join(out, f"_labels_{name}.png")
    C.render(sc, path)
    return A.finish(sp, path, outline_gap=gap * scale)


def ground(w, h):
    base = C.hexrgb(PARK_GROUND)
    img = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(img)
    for ty in range(0, h, 16):
        for tx in range(0, w, 16):
            f = 1.0 if ((tx + ty) // 16) % 2 == 0 else 0.95
            d.rectangle([tx, ty, tx + 15, ty + 15], fill=tuple(int(c * 255 * f) for c in base) + (255,))
    return img


def on(bg, fg):
    bg = bg.copy()
    bg.alpha_composite(fg)
    return bg


def checker(w, h):
    img = Image.new("RGBA", (w, h), (236, 236, 236, 255))
    d = ImageDraw.Draw(img)
    for y in range(0, h, 8):
        for x in range(0, w, 8):
            if (x + y) // 8 % 2:
                d.rectangle([x, y, x + 7, y + 7], fill=(222, 222, 222, 255))
    return img


def diff(a, b):
    """Silhouette difference: grey where both, red only in the drawing, blue only in the model."""
    A_, B_ = np.array(a)[..., 3] > 127, np.array(b)[..., 3] > 127
    out = np.zeros(A_.shape + (4,), np.uint8)
    out[A_ & B_] = (150, 150, 150, 255)
    out[A_ & ~B_] = (220, 50, 50, 255)
    out[~A_ & B_] = (60, 110, 230, 255)
    return Image.fromarray(out, "RGBA"), int((A_ & ~B_).sum()), int((~A_ & B_).sum()), int(A_.sum())


def row(images, captions):
    pad, cap = 10, 16
    tiles = [im.resize((im.width * ZOOM, im.height * ZOOM), Image.NEAREST) for im in images]
    w = sum(t.width for t in tiles) + pad * (len(tiles) + 1)
    h = max(t.height for t in tiles) + cap + pad
    r = Image.new("RGBA", (w, h), BG)
    d = ImageDraw.Draw(r)
    x = pad
    for t, c in zip(tiles, captions):
        r.paste(t, (x, cap))
        d.text((x, 2), c, fill=(225, 225, 225, 255))
        x += t.width + pad
    return r


def main():
    species, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    sp = A.load(species)
    rig = sp["_rig"]
    W, H = rig["cell"]["w"], rig["cell"]["h"]
    s1 = 1 / C.TILE_PX                       # 1 model unit = 1 px: the drawing's own scale

    # 1. side by side with the drawing
    drawing = A.rest_image(sp, lambda n: True)
    side = render_view(sp, s1, 0, lambda sc: C.view_camera(
        sc, (90, 0, 0), W, H, ((W / 2 - A.CX) * s1, 0, H / 2 * s1)), out, "side")
    dimg, only_d, only_m, total = diff(drawing, side)
    print(f"side silhouette: {only_d} px only in the drawing, {only_m} only in the model, of {total}")
    r1 = row([on(checker(W, H), drawing), on(checker(W, H), side), dimg],
             ["your drawing (v1 rig, rest pose)", "model, side view, same scale",
              f"difference: red = drawing only ({only_d}), blue = model only ({only_m})"])

    # 2. front, top, 3/4 at the drawing's scale
    front = render_view(sp, s1, -90, lambda sc: C.view_camera(sc, (90, 0, 0), 48, 56, (0, 0, 22 * s1)), out, "front")
    top = render_view(sp, s1, 0, lambda sc: C.view_camera(sc, (0, 0, 0), 84, 40, (0, 0, 0)), out, "top")
    q_se = render_view(sp, s1, -TURN, lambda sc: C.park_camera(sc, K, 84, 72, center=(0, 1.0)), out, "se")
    q_sw = render_view(sp, s1, -180 + TURN, lambda sc: C.park_camera(sc, K, 84, 72, center=(0, 1.0)), out, "sw")
    r2 = row([on(checker(48, 56), front), on(checker(84, 40), top), on(checker(84, 72), q_se), on(checker(84, 72), q_sw)],
             ["front", "top", f"3/4 front-right (K 0.75, turned {TURN} deg)", "3/4 front-left"])

    # 3. game size, at a few turns
    gpx = display_px(sp["len_m"])
    sg = A.scale_for(sp, gpx)
    tiles, caps, ones = [], [], []
    for t in TURNS:
        pair = Image.new("RGBA", (96, 48))
        for i, yaw in enumerate((-t, -180 + t)):
            g = render_view(sp, sg, yaw, lambda sc: C.park_camera(sc, K, 48, 48, center=(0, 0.5)),
                            out, f"game{t}_{i}", gap=6.0)
            pair.paste(on(ground(48, 48), g), (48 * i, 0))
            g.save(os.path.join(out, f"{sp['name'].lower()}-game-turn{t}-{'se' if i == 0 else 'sw'}.png"))
        tiles.append(pair)
        caps.append(f"game size {gpx} px, turned {t} deg")
        ones.append(pair)
    r3 = row(tiles, caps)
    actual = Image.new("RGBA", (r3.width, 64), BG)
    x = 10
    for o in ones:
        actual.paste(o, (x, 8))
        x += 96 + 24
    ImageDraw.Draw(actual).text((x + 10, 26), "<- the same at 1x (game zoom 1)", fill=(225, 225, 225, 255))

    rows = [r1, r2, r3, actual]
    sheet = Image.new("RGBA", (max(r.width for r in rows), sum(r.height for r in rows)), BG)
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height
    path = os.path.join(out, f"{sp['name'].lower()}-turnaround.png")
    sheet.save(path)
    for f in os.listdir(out):
        if f.startswith("_labels_"):
            os.remove(os.path.join(out, f))
    for name, im in (("side", side), ("se", q_se), ("sw", q_sw)):
        im.save(os.path.join(out, f"{sp['name'].lower()}-{name}.png"))
    print("wrote", path)


if __name__ == "__main__":
    main()
