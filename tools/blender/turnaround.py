"""Turnaround sheet for one animal.

    python tools/blender/turnaround.py tools/blender/animals/dimetrodon.json out/

Rows (shown at 4x): side, front and top at review size; both 3/4 facings at review size (K = 0.75);
both facings at game size (the size curve) on the park ground at a few turn angles, then 1x.
"""
import math
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import camera as C      # noqa: E402
import creature as A    # noqa: E402

K = 0.75
TURN = 20                # the 3/4 turn toward the camera at review size
TURNS = (20, 30)         # compared at game size
REVIEW_PX = 96           # review size: the animal's length in px
ZOOM = 4
PARK_GROUND = "#7d8c58"
BG = (30, 30, 34, 255)
GAP_M = 0.1              # a depth step this big (real metres) gets an inner outline


def display_px(m):       # src/view/display.js
    return max(7, round(28 * (m / 1.75) ** 0.6))


def render_view(sp, scale, yaw, cam, out, name):
    sc = C.reset_scene()
    A.setup_label_render(sc)
    root = A.build(sp)
    root.scale = (scale,) * 3
    root.rotation_euler = (0, 0, math.radians(yaw))
    cam(sc)
    path = os.path.join(out, f"_labels_{name}.png")
    C.render(sc, path)
    img = A.finish(sp, path, outline_gap=GAP_M * scale)
    os.remove(path)
    return img


def ground(w, h):
    base = C.hexrgb(PARK_GROUND)
    img = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(img)
    for ty in range(0, h, 16):
        for tx in range(0, w, 16):
            f = 1.0 if ((tx + ty) // 16) % 2 == 0 else 0.95
            d.rectangle([tx, ty, tx + 15, ty + 15], fill=tuple(int(c * 255 * f) for c in base) + (255,))
    return img


def checker(w, h):
    img = Image.new("RGBA", (w, h), (236, 236, 236, 255))
    d = ImageDraw.Draw(img)
    for y in range(0, h, 8):
        for x in range(0, w, 8):
            if (x + y) // 8 % 2:
                d.rectangle([x, y, x + 7, y + 7], fill=(222, 222, 222, 255))
    return img


def on(bg, fg):
    bg = bg.copy()
    bg.alpha_composite(fg)
    return bg


def row(images, captions, zoom=ZOOM):
    pad, cap = 10, 16
    tiles = [im.resize((im.width * zoom, im.height * zoom), Image.NEAREST) for im in images]
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
    low = sp["name"].lower()
    sr = A.scale_for_px(sp, REVIEW_PX)
    W = REVIEW_PX + 16

    side = render_view(sp, sr, 0, lambda sc: C.view_camera(sc, (90, 0, 0), W, 64, (0, 0, 0.75 * sr)), out, "side")
    front = render_view(sp, sr, -90, lambda sc: C.view_camera(sc, (90, 0, 0), 48, 64, (0, 0, 0.75 * sr)), out, "front")
    top = render_view(sp, sr, 0, lambda sc: C.view_camera(sc, (0, 0, 0), W, 48, (0, 0, 0)), out, "top")
    r1 = row([on(checker(W, 64), side), on(checker(48, 64), front), on(checker(W, 48), top)], ["side", "front", "top"])

    q = [render_view(sp, sr, yaw, lambda sc: C.park_camera(sc, K, W, 88, center=(0, 0.9 * sr)), out, f"q{i}")
         for i, yaw in enumerate((-TURN, -180 + TURN))]
    r2 = row([on(checker(W, 88), im) for im in q],
             [f"3/4 front-right (K 0.75, turned {TURN} deg)", "3/4 front-left"])

    gpx = display_px(sp["len_m"])
    sg = A.scale_for_px(sp, gpx)
    pairs = []
    for t in TURNS:
        pair = Image.new("RGBA", (112, 48))
        for i, yaw in enumerate((-t, -180 + t)):
            g = render_view(sp, sg, yaw, lambda sc: C.park_camera(sc, K, 56, 48, center=(0, 0.4)), out, f"g{t}{i}")
            pair.paste(on(ground(56, 48), g), (56 * i, 0))
            g.save(os.path.join(out, f"{low}-game-turn{t}-{'right' if i == 0 else 'left'}.png"))
        pairs.append(pair)
    r3 = row(pairs, [f"game size ({gpx} px long), turned {t} deg" for t in TURNS])
    r4 = row(pairs, ["the same at 1x"] + [""] * (len(pairs) - 1), zoom=1)

    rows = [r1, r2, r3, r4]
    sheet = Image.new("RGBA", (max(r.width for r in rows), sum(r.height for r in rows)), BG)
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height
    path = os.path.join(out, f"{low}-turnaround.png")
    sheet.save(path)
    print("wrote", path)


main()
