"""Turn an animal's source frames into the game's sprite strips.

Source: art/source/<name>/<strip>-0.png .. <strip>-N.png for the strips walk (required), idle, lie,
rest, eat and drink, side views facing east. They come from PixelLab's animate-pixminimax run on the v1 drawing:
loops (walk, idle, rest, eat) use the same frame as first and last frame, so a last frame that repeats the
first is dropped; frames that repeat the one before at the end (lie, which settles and holds) are
dropped too. Every frame is snapped to the colors of walk frame 0 (the drawing), which clears stray
off-palette pixels (stand.png's colors when there is one: a skeleton-posed walk never shows the drawing's own pose). Output, in art/animals/:
  <name>-<strip>-east.png / -west.png   one row of frames
  <name>-stand-east.png / -west.png     stand.png (the drawing) if there is one, else walk frame 0
West is east mirrored about the anchor, so one anchor works for both. Prints the frame counts and the
box for data.js.

  python3 tools/sprites/strips.py dimetrodon --shift -4 --anchor-y 48
"""
import argparse, glob, os, re
from PIL import Image, ImageChops

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
STRIPS = ("walk", "idle", "lie", "rest", "eat", "drink")


def same(a, b, tol=40):
    """Nearly the same frame: under `tol` pixels differ."""
    d = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > 10 else 0)
    return sum(d.histogram()[255:]) < tol


def snap(f, pal):
    """Every opaque pixel to its nearest drawing color; alpha to fully on or off."""
    px = f.load()
    for y in range(f.height):
        for x in range(f.width):
            r, g, b, a = px[x, y]
            if a < 128:
                px[x, y] = (0, 0, 0, 0)
            elif (r, g, b) not in pal:
                px[x, y] = min(pal, key=lambda c: (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2) + (255,)
    return f


def load(src, strip):
    paths = sorted(glob.glob(os.path.join(src, f"{strip}-*.png")), key=lambda p: int(re.findall(r"(\d+)\.png$", p)[0]))
    frames = [Image.open(p).convert("RGBA") for p in paths]
    while len(frames) > 2 and same(frames[-1], frames[-2]):
        frames.pop()
    if len(frames) > 2 and same(frames[-1], frames[0]):
        frames.pop()
    return frames


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name")
    ap.add_argument("--shift", type=int, default=0, help="move the art right (+) or left (-) so the body sits on the frame's center")
    ap.add_argument("--anchor-y", type=int, required=True, help="the ground line in a frame (the feet)")
    a = ap.parse_args()
    src = os.path.join(ROOT, "art", "source", a.name)
    out = os.path.join(ROOT, "art", "animals")
    os.makedirs(out, exist_ok=True)
    counts, boxes = {}, {"east": [], "west": []}
    stand = os.path.join(src, "stand.png")
    stand = stand if os.path.exists(stand) else os.path.join(src, "walk-0.png")
    pal = {c[:3] for _, c in Image.open(stand).convert("RGBA").getcolors(1 << 16) if c[3] >= 128}
    for strip in STRIPS:
        frames = [snap(f, pal) for f in load(src, strip)]
        if not frames:
            continue
        W, H = frames[0].size
        east = []
        for f in frames:
            c = Image.new("RGBA", (W, H))
            c.paste(f, (a.shift, 0))
            east.append(c)
        counts[strip] = len(east)
        for facing, fr in (("east", east), ("west", [f.transpose(Image.FLIP_LEFT_RIGHT) for f in east])):
            row = Image.new("RGBA", (W * len(fr), H))
            for i, f in enumerate(fr):
                row.paste(f, (i * W, 0))
            row.save(os.path.join(out, f"{a.name}-{strip}-{facing}.png"))
            if strip == "walk":
                st = Image.new("RGBA", (W, H))
                st.paste(snap(Image.open(stand).convert("RGBA"), pal), (a.shift, 0))
                (st if facing == "east" else st.transpose(Image.FLIP_LEFT_RIGHT)).save(os.path.join(out, f"{a.name}-stand-{facing}.png"))
            boxes[facing] += [f.getbbox() for f in fr]
    box = {k: [min(b[0] for b in v), min(b[1] for b in v), max(b[2] for b in v), max(b[3] for b in v)] for k, v in boxes.items()}
    print(f"frame: [{W}, {H}], anchor: [{W // 2}, {a.anchor_y}], frames: {counts}, box: {box}")


if __name__ == "__main__":
    main()
