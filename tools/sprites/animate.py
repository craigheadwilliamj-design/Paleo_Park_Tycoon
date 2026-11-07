"""One looping strip from PixelLab's animate-pixminimax, the drawing as first and last frame.

Writes art/source/<name>/<strip>-<seed>-0.png .. (one set per seed, so seeds can be compared) from
art/source/<name>/stand.png. Copy the seed you like to <strip>-0.png .. <strip>-N.png, then run strips.py
(it drops the last frame when it repeats the first).

  python3 tools/sprites/animate.py dimetrodon attack "lunges forward and bites, then recovers" --seeds 11 22 33

--first and --last start and end on other frames instead (paths under art/source/<name>/). The walk is two
4-frame halves between skeleton keyframes from skelwalk.py (its frames 0 and 4, kept as walkkey-a.png and
walkkey-b.png), so the gait alternates and the in-betweens move like the other loops:

  python3 tools/sprites/animate.py dimetrodon walkab "one step of a slow lizard walk..." --first walkkey-a.png --last walkkey-b.png --frames 4
  python3 tools/sprites/animate.py dimetrodon walkba "one step of a slow lizard walk..." --first walkkey-b.png --last walkkey-a.png --frames 4

then walk-0..3 = key a and walkab frames 1..3, walk-4..7 = key b and walkba frames 1..3.
"""
import argparse, base64, json, os, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
API = "https://api.pixellab.ai/v2"


def req(method, path, body=None):
    r = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                               headers={"Content-Type": "application/json", "Authorization": "Bearer x"})
    try:
        return json.load(urllib.request.urlopen(r, timeout=120))
    except urllib.error.HTTPError as e:
        raise SystemExit(e.read().decode()[:1500])


def run(src, strip, a, seed, img, last):
    body = {"first_frame": img, "last_frame": last, "description": a.description, "frame_count": a.frames, "seed": seed,
            "no_background": True, "direction": "east", "view": "side", "subject_description": a.subject}
    job = req("POST", "/animate-pixminimax", body)["background_job_id"]
    while True:
        time.sleep(10)
        r = req("GET", f"/background-jobs/{job}")
        if r["status"] != "processing":
            break
    if r["status"] != "completed":
        print(seed, "failed", json.dumps(r)[:600])
        return
    for i, im in enumerate(r["last_response"]["images"]):
        b = im.get("base64") if isinstance(im, dict) else im
        open(os.path.join(src, f"{strip}-s{seed}-{i}.png"), "wb").write(base64.b64decode(b.split(",")[-1]))
    print(f"seed {seed}: {len(r['last_response']['images'])} frames")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name")
    ap.add_argument("strip")
    ap.add_argument("description", help="the motion, not the look")
    ap.add_argument("--frames", type=int, default=8, help="a multiple of 4")
    ap.add_argument("--seeds", type=int, nargs="+", default=[11, 22, 33])
    ap.add_argument("--first", default="stand.png", help="first frame, in art/source/<name>/")
    ap.add_argument("--last", help="last frame (default: the first)")
    ap.add_argument("--subject", default="a green Dimetrodon with an orange sail on its back, a sprawling four-legged reptile")
    a = ap.parse_args()
    src = os.path.join(ROOT, "art", "source", a.name)
    b64 = lambda p: {"type": "base64", "base64": base64.b64encode(open(os.path.join(src, p), "rb").read()).decode(), "format": "png"}
    img, last = b64(a.first), b64(a.last or a.first)
    with ThreadPoolExecutor(len(a.seeds)) as ex:
        list(ex.map(lambda s: run(src, a.strip, a, s, img, last), a.seeds))


if __name__ == "__main__":
    main()
