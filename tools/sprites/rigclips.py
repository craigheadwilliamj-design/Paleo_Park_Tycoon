"""A strip's source frames drawn straight from one of a v1 rig's own clips, RotSprite-style (rigpose.py's drawing).

For animals whose v1 motion is rigid parts turning (the Anomalocaris's flaps, tail fan and grasping arms), the rig's
clips are already the animation: PixelLab would only redraw the same plates. Every frame of the clip is posed
and drawn like rigpose.py does it, then placed in the sprite frame as art/source/<name>/<strip>-<i>.png, ready
for strips.py.

--pose lays a pose over every frame (added to the clip's values); --ease adds one that grows from nothing on
the first frame to all of it on the last (lie: sinking to the bottom). Frames stay at the drawing's own
pixel size: halving v1's Anomalocaris to fit the size curve turned it to mush, so the game draws it
smaller instead (sprite.scale in data.js).

  python3 tools/sprites/rigclips.py anomalocaris walk --clip swim --size 96 40 --offset -2 -42
  python3 tools/sprites/rigclips.py anomalocaris lie --clip hover --ease '{"Body": {"dy": 6}}' --size 96 40 --offset -2 -42

--rigid lists parts that never turn, only shift by whole pixels: a turn of a degree or two doesn't read as motion,
it just reshuffles the part's pixels every frame (the Mosasaurus's head blurred in its hover). Applied after --pose and --ease;
a rigid part keeps --pose's turn, held the same every frame (the Sacabambaspis tips nose down to eat).

  python3 tools/sprites/rigclips.py mosasaurus idle --clip hover --rigid Body Head Jaws --size 96 40 --offset -2 -44

--keys adds a pose that changes frame by frame (a list of values a part's r, dx or dy). --keep pastes a box of the rest
pose back untouched where the pose carries it: any turn of a 3 px eye loses its pupil, so the Sacabambaspis's eyes ride
its nose-down turn unturned.

  python3 tools/sprites/rigclips.py sacabambaspis eat --clip hover --rigid Body+Head --keys '{"Body+Head": {"r": [0, 12, 12, 0]}}' \\
      --keep Body+Head 77 40 79 42 --keep Body+Head 82 39 84 41 --size 96 46 --offset -1 -23

--size and --offset place the rig cell in the frame, the same for every strip of one animal.
"""
import argparse, glob, json, os
from PIL import Image
from rigpose import ROOT, K, Rig, up, down


def add(pose, over, u=1.0):
    for part, p in over.items():
        q = pose.setdefault(part, {"r": 0, "dx": 0, "dy": 0})
        for k, v in p.items():
            q[k] = q.get(k, 0) + v * u
    return pose


def at_frame(vals, i, n):
    """frame i of n from a list of key values, spread evenly over the frames when the counts differ"""
    if len(vals) == 1 or n == 1:
        return vals[0]
    t = i * (len(vals) - 1) / (n - 1)
    j = min(int(t), len(vals) - 2)
    return vals[j] + (vals[j + 1] - vals[j]) * (t - j)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name", help="the animal: reads art/v1/<name>-rig.json, writes into art/source/<name>/")
    ap.add_argument("strip", help="the strip to write (walk, idle, lie, rest, eat...)")
    ap.add_argument("--clip", required=True, help="the rig's clip to draw")
    ap.add_argument("--pose", default="{}", help="JSON pose {part name: {r, dx, dy}} added to every frame")
    ap.add_argument("--ease", default="{}", help="JSON pose added from none on the first frame to all of it on the last")
    ap.add_argument("--keys", default="{}", help="JSON {part name: {r|dx|dy: [values]}}: a value a frame (spread over the clip if the counts differ), added after --pose")
    ap.add_argument("--rigid", nargs="*", default=[], help="parts that never turn, only shift by whole pixels")
    ap.add_argument("--keep", nargs=5, action="append", default=[], metavar=("PART", "X0", "Y0", "X1", "Y1"),
                    help="a box of a part's picture (cell pixels in the rest pose, X1 Y1 included) pasted back untouched where the pose carries it")
    ap.add_argument("--frames", type=int, nargs=2, metavar=("FROM", "TO"), help="only these frames of the clip (TO included)")
    ap.add_argument("--size", type=int, nargs=2, required=True, help="the sprite frame")
    ap.add_argument("--offset", type=int, nargs=2, default=[0, 0], help="where the rig cell goes in the frame")
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
    pose, ease, keys = named(a.pose), named(a.ease), named(a.keys)
    rest = down(rig.draw({}, K, {k: up(v) for k, v in rig.pics.items()}))
    rest_at = rig.worlds({}, 1)
    keeps = [(rig.named[k[0]], *map(int, k[1:])) for k in a.keep]
    for part in a.rigid:
        if part not in rig.named:
            raise SystemExit(f"no part {part!r}; the rig has: {', '.join(rig.named)}")
    rigid = [rig.named[k] for k in a.rigid]
    pics = {k: up(v) for k, v in rig.pics.items()}
    src = os.path.join(ROOT, "art", "source", a.name)
    os.makedirs(src, exist_ok=True)
    for old in glob.glob(os.path.join(src, f"{a.strip}-*.png")):
        os.remove(old)
    for i, f in enumerate(frames):
        at = {k: {c: at_frame(v, i, len(frames)) for c, v in kv.items()} for k, kv in keys.items()}
        p = add(add(add(json.loads(json.dumps(f)), pose), ease, i / max(1, len(frames) - 1)), at)
        for k in rigid:
            q = p.setdefault(k, {"r": 0, "dx": 0, "dy": 0})
            q["r"], q["dx"], q["dy"] = pose.get(k, {}).get("r", 0) + at.get(k, {}).get("r", 0), round(q.get("dx", 0)), round(q.get("dy", 0))
        im = down(rig.draw(p, K, pics))
        w = rig.worlds(p, 1)
        for part, x0, y0, x1, y1 in keeps:
            # the box's middle carried by the part's matrix (the same mapping draw() uses), the rest-pose pixels pasted there
            ra, rb, rc, rd, re, rf = w[part]
            u, v = (x0 + x1) / 2 - rest_at[part][4], (y0 + y1) / 2 - rest_at[part][5]   # the rest pose turns nothing, so only its shift
            cx, cy = ra * u + rc * v + re, rb * u + rd * v + rf
            box = rest.crop((x0, y0, x1 + 1, y1 + 1))
            im.paste(box, (round(cx - (x1 - x0) / 2), round(cy - (y1 - y0) / 2)), box)
        out = Image.new("RGBA", tuple(a.size))
        out.paste(im, tuple(a.offset))
        out.save(os.path.join(src, f"{a.strip}-{i}.png"))
    print(f"{a.strip}: {len(frames)} frames from {a.clip}, bounds {out.getbbox()}")


if __name__ == "__main__":
    main()
