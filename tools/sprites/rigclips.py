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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name", help="the animal: reads art/v1/<name>-rig.json, writes into art/source/<name>/")
    ap.add_argument("strip", help="the strip to write (walk, idle, lie, rest, eat...)")
    ap.add_argument("--clip", required=True, help="the rig's clip to draw")
    ap.add_argument("--pose", default="{}", help="JSON pose {part name: {r, dx, dy}} added to every frame")
    ap.add_argument("--ease", default="{}", help="JSON pose added from none on the first frame to all of it on the last")
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
    pose, ease = named(a.pose), named(a.ease)
    pics = {k: up(v) for k, v in rig.pics.items()}
    src = os.path.join(ROOT, "art", "source", a.name)
    os.makedirs(src, exist_ok=True)
    for old in glob.glob(os.path.join(src, f"{a.strip}-*.png")):
        os.remove(old)
    for i, f in enumerate(frames):
        p = add(add(json.loads(json.dumps(f)), pose), ease, i / max(1, len(frames) - 1))
        im = down(rig.draw(p, K, pics))
        out = Image.new("RGBA", tuple(a.size))
        out.paste(im, tuple(a.offset))
        out.save(os.path.join(src, f"{a.strip}-{i}.png"))
    print(f"{a.strip}: {len(frames)} frames from {a.clip}, bounds {out.getbbox()}")


if __name__ == "__main__":
    main()
