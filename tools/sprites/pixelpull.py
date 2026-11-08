"""Cut a strip from the pixel editor back into art/source frames.

The editor sends (or downloads) one strip per animation: frames side by side. This writes them over
art/source/<name>/<strip>-0.png .. -N.png (the frame count and size must match the files already there), so the next
`strips.py <name>` run builds from the edited frames.

  python3 tools/sprites/pixelpull.py dimetrodon walk path/to/walk.png      # a downloaded strip
  python3 tools/sprites/pixelpull.py --b64 dimetrodon walk data.txt        # a `png` field from the db doc (data URI)
Prints how many pixels changed per frame.
"""
import base64, io, os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")


def main():
    args = sys.argv[1:]
    b64 = args and args[0] == "--b64"
    if b64: args = args[1:]
    if len(args) != 3: raise SystemExit(__doc__)
    name, strip, src = args
    if b64:
        s = open(src).read().strip()
        im = Image.open(io.BytesIO(base64.b64decode(s.split(",", 1)[1]))).convert("RGBA")
    else:
        im = Image.open(src).convert("RGBA")
    d = os.path.join(ROOT, "art", "source", name)
    if strip == "stand": files = [os.path.join(d, "stand.png")]
    else:
        n = 0
        while os.path.exists(os.path.join(d, f"{strip}-{n}.png")): n += 1
        files = [os.path.join(d, f"{strip}-{i}.png") for i in range(n)]
    if not files or not os.path.exists(files[0]): raise SystemExit(f"no source frames for {name}/{strip}")
    old0 = Image.open(files[0]).convert("RGBA"); w, h = old0.size
    if im.size != (w * len(files), h): raise SystemExit(f"strip is {im.size}, expected {(w * len(files), h)} ({len(files)} frames of {w}x{h})")
    total = 0
    for i, f in enumerate(files):
        new = im.crop((i * w, 0, (i + 1) * w, h)); old = Image.open(f).convert("RGBA")
        c = sum(1 for p, q in zip(new.getdata(), old.getdata()) if p[3] != q[3] or (p[3] and p != q))   # color under a fully see-through pixel doesn't count
        if c: new.save(f); total += c; print(f"  {os.path.basename(f)}: {c} px changed")
    print(f"{name}/{strip}: {total} px changed across {len(files)} frames")


main()
