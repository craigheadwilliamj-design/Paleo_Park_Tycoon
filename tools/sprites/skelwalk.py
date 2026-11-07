"""A four-legged walk drawn by PixelLab from posed skeletons (animate-with-skeleton-v3).

animate-pixminimax doesn't keep a gait: told to walk, it moved front and back legs forward together and
the Dimetrodon limped. Here the gait is ours and PixelLab only draws it. Diagonal pairs step half a cycle
apart (near front with far hind, near hind with far front); each paw is planted and slides back, then
lifts and swings forward, its elbow or knee following halfway. The skeleton of the drawing
(art/source/<name>/skeleton.json, from PixelLab's estimate-skeleton: front legs are the arms, hind legs
the legs, RIGHT is the near side) is the rest pose.

Writes art/source/<name>/walk-0.png .. walk-7.png (frame 0: near front forward, near hind back; frame 4
the mirror). Keep the drawing as stand.png, then run strips.py. Set the sprite's cycle to
4 * stride / 16 tiles so the feet don't skate.

  python3 tools/sprites/skelwalk.py dimetrodon --stride 5 --lift 3 --template lion --seed 17
"""
import argparse, base64, copy, json, math, os, time, urllib.error, urllib.request
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
API = "https://api.pixellab.ai/v2"
# paw: (its elbow or knee, phase)
LIMBS = {"RIGHT ARM": ("RIGHT ELBOW", 0), "LEFT LEG": ("LEFT KNEE", 0), "RIGHT LEG": ("RIGHT KNEE", 0.5), "LEFT ARM": ("LEFT ELBOW", 0.5)}


def req(method, path, body=None):
    r = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                               headers={"Content-Type": "application/json", "Authorization": "Bearer x"})
    try:
        return json.load(urllib.request.urlopen(r, timeout=120))
    except urllib.error.HTTPError as e:
        raise SystemExit(e.read().decode()[:1500])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name")
    ap.add_argument("--stride", type=float, default=5, help="px a paw travels either side of rest")
    ap.add_argument("--lift", type=float, default=3, help="px a paw rises mid-swing")
    ap.add_argument("--duty", type=float, default=0.5, help="share of the cycle a paw is planted")
    ap.add_argument("--frames", type=int, default=8)
    ap.add_argument("--template", default="lion", help="PixelLab depth template: cat, dog, lion, bear, horse")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--subject", default="a green Dimetrodon with an orange sail on its back, a sprawling four-legged reptile")
    a = ap.parse_args()
    src = os.path.join(ROOT, "art", "source", a.name)
    stand = os.path.join(src, "stand.png")
    W, H = Image.open(stand).size
    base = json.load(open(os.path.join(src, "skeleton.json")))["keypoints"]
    rest = {k["label"]: k for k in base}

    def foot(p):
        if p < a.duty:
            return a.stride - 2 * a.stride * p / a.duty, 0.0
        q = (p - a.duty) / (1 - a.duty)
        return -a.stride + 2 * a.stride * (0.5 - 0.5 * math.cos(math.pi * q)), a.lift * math.sin(math.pi * q)

    clean = lambda ks: [{"x": k["x"], "y": k["y"], "label": k["label"], "z_index": int(math.floor(k["z_index"]))} for k in ks]
    poses = []
    for i in range(a.frames):
        f = copy.deepcopy(base)
        m = {k["label"]: k for k in f}
        for paw, (mid, ph) in LIMBS.items():
            dx, lift = foot((i / a.frames + ph) % 1)
            m[paw]["x"] = rest[paw]["x"] + dx / W
            m[paw]["y"] = rest[paw]["y"] - lift / H
            m[mid]["x"] = rest[mid]["x"] + 0.5 * dx / W
            m[mid]["y"] = rest[mid]["y"] - 0.6 * lift / H
        poses.append(clean(f))
    img = {"type": "base64", "base64": base64.b64encode(open(stand, "rb").read()).decode(), "format": "png"}
    job = req("POST", "/animate-with-skeleton-v3", {
        "description": a.subject, "action": "walk", "direction": "east", "view": "side", "first_frame": img,
        "first_frame_keypoints": clean(base), "keypoints": poses, "template_id": a.template, "seed": a.seed, "no_background": True,
    })["background_job_id"]
    while True:
        time.sleep(15)
        r = req("GET", f"/background-jobs/{job}")
        if r["status"] != "processing":
            break
    if r["status"] != "completed":
        raise SystemExit(json.dumps(r)[:800])
    for p in os.listdir(src):
        if p.startswith("walk-"):
            os.remove(os.path.join(src, p))
    for i, im in enumerate(r["last_response"]["images"]):
        b = im.get("base64") if isinstance(im, dict) else im
        open(os.path.join(src, f"walk-{i}.png"), "wb").write(base64.b64decode(b.split(",")[-1]))
    print(f"{a.frames} walk frames in {src}")


if __name__ == "__main__":
    main()
