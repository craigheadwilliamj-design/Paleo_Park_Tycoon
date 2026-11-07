"""One keyframe posed from a v1 rig, drawn RotSprite-style so turned parts keep their outlines.

animate-pixminimax redraws the whole animal every frame, and on a small head it can lose it (the
Cotylorhynchus's melted into its shoulders while eating). So the poses that matter (the bottom of a bite,
the chew) are posed here from the drawing's own parts, and animate.py only draws the frames between them
(--first / --last). A plain nearest-neighbour turn shreds pixel art's outline, so each part is Scale2x'd
three times (8x), the pose is drawn at 8x, and each 8x8 block becomes its commonest color (RotSprite).
With nothing turned the output is the drawing, pixel for pixel.

The rig is a v1 rigger project (art/v1/<name>-rig.json): parts with a picture, a joint (px, py in the
picture), a parent and an offset from it (lx, ly). A pose is {part name: {r, dx, dy}}: r turns it about
its joint in degrees (positive is clockwise on screen, so a head turned + looks down when facing east), dx
and dy shift it in its parent's frame. Children follow their parent.

--plant keeps the feet where they stand: every limb (a chain of three parts hanging off the root: thigh or
upper arm, leg or forearm, foot) is turned stiff as one piece about its hip or shoulder until its ankle is
back over its standing spot, the hip shifts so the ankle is back on its standing row, and the foot turns
flat. Without it, pitching the body lifts the hind feet off the ground.

  python3 tools/sprites/rigpose.py cotylorhynchus eatkey-bite '{"Body": {"r": 10, "dy": 3}, "Head": {"r": 25}, "Tail": {"r": -10}}' \\
      --plant --size 96 56 --offset -9 -25

writes art/source/cotylorhynchus/eatkey-bite.png. --size and --offset place the rig's cell in the sprite's
frame the way stand.png was placed (stand.png is the rig drawn with an empty pose '{}').
"""
import argparse, base64, io, json, math, os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
K = 8   # RotSprite scale: three Scale2x passes


def mul(m, n):
    """2D affine matrices as [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f."""
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
            m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]


def turn(deg):
    r = math.radians(deg)
    return [math.cos(r), math.sin(r), -math.sin(r), math.cos(r), 0, 0]


class Rig:
    def __init__(self, project):
        self.P = project
        self.nodes = project["nodes"]
        self.by = {n["id"]: n for n in self.nodes}
        self.named = {n["name"]: n["id"] for n in self.nodes}
        self.pics = {n["id"]: Image.open(io.BytesIO(base64.b64decode(project["assets"][n["asset"]].split(",", 1)[1]))).convert("RGBA")
                     for n in self.nodes}

    def worlds(self, pose, scale=1):
        """each part's matrix in the cell (at `scale`): its parent's, then its offset (plus the pose's shift), then its turn"""
        out = {}

        def get(n):
            if n["id"] not in out:
                p = pose.get(n["id"], {})
                parent = get(self.by[n["parent"]]) if n.get("parent") else [1, 0, 0, 1, 0, 0]
                move = [1, 0, 0, 1, (n["lx"] + p.get("dx", 0)) * scale, (n["ly"] + p.get("dy", 0)) * scale]
                out[n["id"]] = mul(parent, mul(move, turn(p.get("r", 0))))
            return out[n["id"]]
        for n in self.nodes:
            get(n)
        return out

    def limbs(self):
        """(top, middle, foot) chains hanging off the root part"""
        kids = {}
        for n in self.nodes:
            kids.setdefault(n.get("parent"), []).append(n["id"])
        root = kids[None][0]
        return [(a, b, c) for a in kids.get(root, []) for b in kids.get(a, []) for c in kids.get(b, [])]

    def plant(self, pose):
        """turn each limb stiff about its hip so its ankle (the foot's joint) is back where it stands, foot flat"""
        rest = self.worlds({})
        for top, mid, foot in self.limbs():
            tx, ty = rest[foot][4], rest[foot][5]
            p0 = pose.get(top, {})
            pose[mid] = {"r": 0, "dx": 0, "dy": 0}
            lo, hi = -80.0, 80.0   # the ankle moves back as the turn grows
            for _ in range(50):
                r = (lo + hi) / 2
                pose[top] = {"r": r, "dx": p0.get("dx", 0), "dy": p0.get("dy", 0)}
                if self.worlds(pose)[foot][4] > tx:
                    lo = r
                else:
                    hi = r
            pose[top]["r"] = round(r, 2)
            W = self.worlds(pose)
            pm = W[self.by[top]["parent"]]
            wy = ty - W[foot][5]   # shift the hip straight down the screen, in its parent's frame
            det = pm[0] * pm[3] - pm[1] * pm[2]
            pose[top]["dx"] = round(pose[top]["dx"] - pm[2] * wy / det, 2)
            pose[top]["dy"] = round(pose[top]["dy"] + pm[0] * wy / det, 2)
            W = self.worlds(pose)
            lean = math.degrees(math.atan2(W[mid][1], W[mid][0]))
            pose[foot] = {"r": round((-lean + 180) % 360 - 180, 2), "dx": 0, "dy": 0}
        return pose

    def draw(self, pose, scale=1, pics=None):
        """the rig drawn like the rigger: each part placed at a whole pixel and sampled nearest-neighbour, at `scale`"""
        pics = pics or self.pics
        W, H = self.P["cell"]["w"] * scale, self.P["cell"]["h"] * scale
        wd = self.worlds(pose, scale)
        out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        for n in self.nodes:
            if pose.get(n["id"], {}).get("v") == 0:
                continue
            a, b, c, d, e, f = wd[n["id"]]
            if n.get("flip"):
                a, b = -a, -b
            ox, oy = round(e), round(f)
            det = a * d - b * c
            ia, ib, ic, id_ = d / det, -c / det, -b / det, a / det
            px, py = n["px"] * scale, n["py"] * scale
            out.alpha_composite(pics[n["id"]].transform((W, H), Image.AFFINE, (ia, ib, px - ia * ox - ib * oy, ic, id_, py - ic * ox - id_ * oy), Image.NEAREST))
        return out


def scale2x(a):
    """Scale2x (EPX): doubles a picture, rounding diagonals instead of making blocks"""
    h, w, _ = a.shape
    p = np.pad(a, ((1, 1), (1, 1), (0, 0)), mode="edge")
    B, D, E, F, H = p[0:h, 1:w + 1], p[1:h + 1, 0:w], p[1:h + 1, 1:w + 1], p[1:h + 1, 2:w + 2], p[2:h + 2, 1:w + 1]
    eq = lambda x, y: (x == y).all(-1)
    c = ~eq(B, H) & ~eq(D, F)
    o = np.zeros((h * 2, w * 2, 4), a.dtype)
    o[0::2, 0::2] = np.where((c & eq(D, B))[..., None], D, E)
    o[0::2, 1::2] = np.where((c & eq(B, F))[..., None], F, E)
    o[1::2, 0::2] = np.where((c & eq(D, H))[..., None], D, E)
    o[1::2, 1::2] = np.where((c & eq(H, F))[..., None], F, E)
    return o


def up(im):
    a = np.array(im)
    a[a[..., 3] < 128] = 0
    for _ in range(3):
        a = scale2x(a)
    return Image.fromarray(a)


def down(im):
    """each KxK block to its commonest opaque color, or clear when under half of it is opaque"""
    a = np.array(im)
    H, W = a.shape[0] // K, a.shape[1] // K
    out = np.zeros((H, W, 4), np.uint8)
    for y in range(H):
        for x in range(W):
            b = a[y * K:(y + 1) * K, x * K:(x + 1) * K].reshape(-1, 4)
            op = b[b[:, 3] >= 128]
            if len(op) * 2 < len(b):
                continue
            cols, cnt = np.unique(op, axis=0, return_counts=True)
            out[y, x] = cols[cnt.argmax()]
    return Image.fromarray(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name", help="the animal: reads art/v1/<name>-rig.json, writes into art/source/<name>/")
    ap.add_argument("out", help="output file name, without .png")
    ap.add_argument("pose", help='JSON: {part name: {"r": deg, "dx": px, "dy": px}}')
    ap.add_argument("--plant", action="store_true", help="keep every foot where it stands")
    ap.add_argument("--size", type=int, nargs=2, help="the sprite frame (default: the rig's cell)")
    ap.add_argument("--offset", type=int, nargs=2, default=[0, 0], help="where the rig's cell goes in the frame")
    a = ap.parse_args()
    rig = Rig(json.load(open(os.path.join(ROOT, "art", "v1", f"{a.name}-rig.json"))))
    pose = {}
    for part, p in json.loads(a.pose).items():
        if part not in rig.named:
            raise SystemExit(f"no part {part!r}; the rig has: {', '.join(rig.named)}")
        pose[rig.named[part]] = p
    if a.plant:
        rig.plant(pose)
    im = down(rig.draw(pose, K, {k: up(v) for k, v in rig.pics.items()}))
    frame = Image.new("RGBA", tuple(a.size) if a.size else im.size)
    frame.paste(im, tuple(a.offset))
    path = os.path.join(ROOT, "art", "source", a.name, f"{a.out}.png")
    frame.save(path)
    print(path, frame.getbbox())


if __name__ == "__main__":
    main()
