"""GIFs of an animal's finished strips, for review before they go into the game.

Reads art/animals/<name>-<strip>-east.png (and the data.js timing passed on the command line) and writes one looping
GIF a strip into --out, blown up pixel for pixel over a flat background, with the strip's name and frame count in the
file name. lie plays down and back up, the way the game plays it around a nap.

  python3 tools/sprites/gifs.py mosasaurus --frame 192 80 --out /tmp/gifs --zoom 3 --bg 58 120 150 \\
      --s walk=1.0 idle=2.0 lie=1.0 rest=3.0 eat=1.5 attack=1.5
"""
import argparse, os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
STRIPS = ("walk", "swim", "idle", "lie", "rest", "eat", "drink", "attack")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name")
    ap.add_argument("--frame", type=int, nargs=2, required=True, help="the sprite frame, as in data.js")
    ap.add_argument("--out", required=True)
    ap.add_argument("--zoom", type=int, default=3)
    ap.add_argument("--bg", type=int, nargs=3, default=[125, 140, 88], help="background color (park turf by default)")
    ap.add_argument("--s", nargs="*", default=[], help="strip=seconds a cycle (default 1 s)")
    a = ap.parse_args()
    secs = dict((k, float(v)) for k, v in (x.split("=") for x in a.s))
    W, H = a.frame
    os.makedirs(a.out, exist_ok=True)
    for strip in STRIPS:
        p = os.path.join(ROOT, "art", "animals", f"{a.name}-{strip}-east.png")
        if not os.path.exists(p):
            continue
        row = Image.open(p).convert("RGBA")
        frames = [row.crop((i * W, 0, i * W + W, H)) for i in range(row.width // W)]
        n = len(frames)
        if strip == "lie":
            frames = frames + [frames[-1]] * 4 + frames[::-1] + [frames[0]] * 4
        ms = max(20, round(secs.get(strip, 1.0) * 1000 / n))
        out = []
        for f in frames:
            bg = Image.new("RGBA", (W, H), tuple(a.bg) + (255,))
            bg.alpha_composite(f)
            out.append(bg.convert("RGB").resize((W * a.zoom, H * a.zoom), Image.NEAREST))
        path = os.path.join(a.out, f"{a.name}-{strip}-{n}f.gif")
        out[0].save(path, save_all=True, append_images=out[1:], duration=ms, loop=0, disposal=1)
        print(path)


if __name__ == "__main__":
    main()
