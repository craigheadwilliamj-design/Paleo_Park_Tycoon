"""A strip's source frames drawn straight from one of a v1 rig's own clips, RotSprite-style (rigpose.py's drawing).

For animals whose v1 motion is rigid parts turning (the Anomalocaris's flaps, tail fan and grasping arms), the rig's
clips are already the animation: PixelLab would only redraw the same plates. Every frame of the clip is posed
and drawn like rigpose.py does it, then placed in the sprite frame as art/source/<name>/<strip>-<i>.png, ready
for strips.py.

--pose lays a pose over every frame (added to the clip's values); --ease adds one that grows from nothing on
the first frame to all of it on the last (lie: sinking to the bottom). --half draws the frame at half size
for a drawing too big for the size curve (v1's Anomalocaris is as long as its Dimetrodon): the silhouette is
halved (a half pixel is opaque when two of its four are), each takes the commonest fill color of its four
(outline colors only when there is nothing else), the eye's white is kept, and the edge is outlined again.

  python3 tools/sprites/rigclips.py anomalocaris walk --clip swim --half --size 48 24 --offset -1 -18
  python3 tools/sprites/rigclips.py anomalocaris lie --clip hover --ease '{"Body": {"dy": 6}}' --half --size 48 24 --offset -1 -18

--size and --offset place the (halved) rig cell in the frame, the same for every strip of one animal.
"""
import argparse, glob, json, os
import numpy as np
from PIL import Image
from rigpose import ROOT, K, Rig, up, down


def half(im, outline, keep=()):
    """Half size, keeping an outline: see the module notes. outline: the outline color; keep: colors never lost (the eye)."""
    a = np.array(im.convert("RGBA"))
    H, W = a.shape[0] // 2, a.shape[1] // 2
    o = np.zeros((H, W, 4), np.uint8)
    dark = {tuple(c) for c in [outline]}
    for y in range(H):
        for x in range(W):
            b = [tuple(int(v) for v in p[:3]) for p in a[2 * y:2 * y + 2, 2 * x:2 * x + 2].reshape(-1, 4) if p[3] >= 128]
            if len(b) < 2:
                continue
            k = [c for c in b if c in keep]
            f = k or [c for c in b if c not in dark and sum(c) > sum(outline) + 12] or b
            o[y, x] = (*max(set(f), key=f.count), 255)
    op = o[..., 3] > 0
    p = np.pad(op, 1)
    edge = op & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
    kept = np.zeros_like(op)
    for c in keep:
        kept |= (o[..., :3] == c).all(-1)
    o[edge & ~kept] = (*outline, 255)
    return Image.fromarray(o)


def add(pose, over, u=1.0):
    for part, p in over.items():
        q = pose.setdefault(part, {"r": 0, "dx": 0, "dy": 0})
        for k, v in p.items():
            q[k] = q.get(k, 0) + v * u
    return pose


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name", help="the animal: reads art/v1/<name>-rig.json, writes into art/source/<name>/")
    ap.add_argument("strip", help="the strip to write (walk, idle, lie, rest, eat...)")
    ap.add_argument("--clip", required=True, help="the rig's clip to draw")
    ap.add_argument("--pose", default="{}", help="JSON pose {part name: {r, dx, dy}} added to every frame")
    ap.add_argument("--ease", default="{}", help="JSON pose added from none on the first frame to all of it on the last")
    ap.add_argument("--frames", type=int, nargs=2, metavar=("FROM", "TO"), help="only these frames of the clip (TO included)")
    ap.add_argument("--half", action="store_true", help="draw at half size")
    ap.add_argument("--outline", default="18 01 06", help="the drawing's outline color, hex 'rr gg bb'")
    ap.add_argument("--keep", nargs="*", default=["df df df"], help="colors --half never loses, hex 'rr gg bb' (the eye)")
    ap.add_argument("--size", type=int, nargs=2, required=True, help="the sprite frame")
    ap.add_argument("--offset", type=int, nargs=2, default=[0, 0], help="where the (halved) rig cell goes in the frame")
    a = ap.parse_args()
    rig = Rig(json.load(open(os.path.join(ROOT, "art", "v1", f"{a.name}-rig.json"))))
    rig.P["cell"] = {"w": rig.P["cell"]["w"] + 20, "h": rig.P["cell"]["h"] + 21}   # room below and right: v1's cell clips parts that sink or reach
    clips = {c["name"]: c for c in rig.P.get("clips", [])}
    if a.clip not in clips:
        raise SystemExit(f"no clip {a.clip!r}; the rig has: {', '.join(clips)}")
    frames = clips[a.clip]["frames"]
    if a.frames:
        frames = frames[a.frames[0]:a.frames[1] + 1]
    named = lambda over: {rig.named[k] if k in rig.named else k: v for k, v in json.loads(over).items()}
    pose, ease = named(a.pose), named(a.ease)
    hexc = lambda s: tuple(int(v, 16) for v in s.split())
    pics = {k: up(v) for k, v in rig.pics.items()}
    src = os.path.join(ROOT, "art", "source", a.name)
    os.makedirs(src, exist_ok=True)
    for old in glob.glob(os.path.join(src, f"{a.strip}-*.png")):
        os.remove(old)
    for i, f in enumerate(frames):
        p = add(add(json.loads(json.dumps(f)), pose), ease, i / max(1, len(frames) - 1))
        im = down(rig.draw(p, K, pics))
        if a.half:
            im = half(im, hexc(a.outline), {hexc(c) for c in a.keep})
        out = Image.new("RGBA", tuple(a.size))
        out.paste(im, tuple(a.offset))
        out.save(os.path.join(src, f"{a.strip}-{i}.png"))
    print(f"{a.strip}: {len(frames)} frames from {a.clip}, bounds {out.getbbox()}")


if __name__ == "__main__":
    main()
