"""Turn an animal's source frames into the game's sprite strips.

Source: art/source/<name>/walk-0.png .. walk-N.png, a side-view walk facing east (PixelLab
animate-pixminimax from the v1 drawing, with that drawing as both first and last frame, so the
last frame repeats the first and is dropped). Output, in art/animals/:
  <name>-walk-east.png / -walk-west.png   one row of frames
  <name>-stand-east.png / -stand-west.png  frame 0
West is east mirrored about the anchor, so one anchor works for both. Prints the data.js sprite fields.

  python3 tools/sprites/strips.py dimetrodon --shift -4 --anchor-y 48
"""
import argparse, glob, os, re
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name")
    ap.add_argument("--shift", type=int, default=0, help="move the art right (+) or left (-) so the body sits on the frame's center")
    ap.add_argument("--anchor-y", type=int, required=True, help="the ground line in a frame (the feet)")
    ap.add_argument("--keep-last", action="store_true", help="the last frame is not a repeat of the first")
    a = ap.parse_args()
    src = os.path.join(ROOT, "art", "source", a.name)
    paths = sorted(glob.glob(os.path.join(src, "walk-*.png")), key=lambda p: int(re.findall(r"(\d+)\.png$", p)[0]))
    frames = [Image.open(p).convert("RGBA") for p in paths]
    if not a.keep_last:
        frames = frames[:-1]
    W, H = frames[0].size
    east = []
    for f in frames:
        c = Image.new("RGBA", (W, H))
        c.paste(f, (a.shift, 0))
        east.append(c)
    west = [f.transpose(Image.FLIP_LEFT_RIGHT) for f in east]
    out = os.path.join(ROOT, "art", "animals")
    os.makedirs(out, exist_ok=True)
    box = {}
    for facing, fr in (("east", east), ("west", west)):
        strip = Image.new("RGBA", (W * len(fr), H))
        for i, f in enumerate(fr):
            strip.paste(f, (i * W, 0))
        strip.save(os.path.join(out, f"{a.name}-walk-{facing}.png"))
        fr[0].save(os.path.join(out, f"{a.name}-stand-{facing}.png"))
        bb = [min(f.getbbox()[0] for f in fr), min(f.getbbox()[1] for f in fr), max(f.getbbox()[2] for f in fr), max(f.getbbox()[3] for f in fr)]
        box[facing] = bb
    print(f"frame: [{W}, {H}], frames: {len(east)}, anchor: [{W // 2}, {a.anchor_y}], box: {box}")


if __name__ == "__main__":
    main()
