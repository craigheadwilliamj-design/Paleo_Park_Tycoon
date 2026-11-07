"""A walk cycle made from the drawing by moving its legs, for sprawling four-legged animals.

The body stays the drawing; only the legs below the hip line move. Diagonal pairs step together
(near front with far back, near back with far front), half a cycle apart, so the gait is an even
A-B-A-B. Each leg is sheared from its hip row: the foot slides back while planted, then lifts and
swings forward. Far legs draw behind the body, near legs in front; where a near leg leaves the
belly, the belly gets its outline back.

The legs are described in art/source/<name>/legs.json:
  hip       row the legs hang from (it never moves)
  ground    the bottom row (the foot's sole outline)
  ink       outline color
  stride    the foot travels from +stride to -stride px while planted
  lift      px the foot rises at the top of its swing
  duty      share of the cycle a foot is planted (lizards: a little over half)
  frames    frames in the cycle
  bob       px the body (and hips) drop while both pairs pass under it (0 for none)
  legs      [{name, pair: 0|1, layer: "near"|"far", rows: {row: [x0, x1]}}]

Writes art/source/<name>/walk-0.png .. walk-<frames-1>.png from art/source/<name>/stand.png, then run
strips.py as usual. --sheet out.png also writes a zoomed contact sheet for checking the gait.

  python3 tools/sprites/legwalk.py dimetrodon --sheet /tmp/walk.png
"""
import argparse, json, math, os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)


def foot(p, cfg):
    """Foot offset (dx, lift) at phase p in [0, 1): planted and sliding back, then swinging forward."""
    s, duty = cfg["stride"], cfg["duty"]
    if p < duty:
        return s - 2 * s * (p / duty), 0.0
    q = (p - duty) / (1 - duty)
    e = 0.5 - 0.5 * math.cos(math.pi * q)          # ease in and out of the swing
    return -s + 2 * s * e, cfg["lift"] * math.sin(math.pi * q)


def frame(base, cfg, t):
    W, H = base.size
    hip, ground, ink = cfg["hip"], cfg["ground"], hexrgb(cfg["ink"])
    src = base.load()
    body = base.copy()
    bp = body.load()
    legs = []
    for leg in cfg["legs"]:
        px = []
        for row, (x0, x1) in leg["rows"].items():
            y = int(row)
            for x in range(x0, x1 + 1):
                if src[x, y][3] >= 128:
                    px.append((x, y, src[x, y]))
                bp[x, y] = (0, 0, 0, 0)
        legs.append((leg, px))
    # belly outline where a near leg came away
    for leg, px in legs:
        if leg["layer"] != "near":
            continue
        for x in {x for x, _, _ in px}:
            c = bp[x, hip]
            if c[3] >= 128 and c != ink and bp[x, hip + 1][3] < 128:
                bp[x, hip + 1] = ink
    # body bob: a little drop as each pair passes under (twice a cycle)
    drop = round(cfg.get("bob", 0) * (0.5 - 0.5 * math.cos(4 * math.pi * t)))
    out = Image.new("RGBA", (W, H))

    def draw_legs(layer):
        op = out.load()
        for leg, px in legs:
            if leg["layer"] != layer:
                continue
            dx, lift = foot((t + 0.5 * leg["pair"]) % 1, cfg)
            rows = {}
            for x, y, c in px:
                rows.setdefault(y, []).append((x, c))
            # each drawn row samples a source row, so a lifted (shorter) leg keeps its sole and has no gaps
            top, bot = hip + drop, ground - round(lift)
            for yd in range(top + 1, bot + 1):
                k = (yd - top) / (bot - top)
                ys = hip + max(1, round(k * (ground - hip)))
                for x, c in rows.get(ys, ()):
                    nx = x + round(dx * k)
                    if 0 <= nx < W and 0 <= yd < H:
                        op[nx, yd] = c

    draw_legs("far")
    shifted = Image.new("RGBA", (W, H))
    shifted.paste(body, (0, drop))
    out.alpha_composite(shifted)
    draw_legs("near")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name")
    ap.add_argument("--sheet", help="also write a zoomed contact sheet here")
    a = ap.parse_args()
    src = os.path.join(ROOT, "art", "source", a.name)
    cfg = json.load(open(os.path.join(src, "legs.json")))
    base = Image.open(os.path.join(src, "stand.png")).convert("RGBA")
    n = cfg["frames"]
    frames = [frame(base, cfg, i / n) for i in range(n)]
    for i, f in enumerate(frames):
        f.save(os.path.join(src, f"walk-{i}.png"))
    for p in range(n, 64):                      # clear frames left from a longer cycle
        old = os.path.join(src, f"walk-{p}.png")
        if os.path.exists(old):
            os.remove(old)
    if a.sheet:
        W, H = base.size
        z = 6
        sheet = Image.new("RGBA", (W * n, H), (200, 200, 200, 255))
        for i, f in enumerate(frames):
            sheet.alpha_composite(f, (i * W, 0))
        sheet.resize((W * n * z, H * z), Image.NEAREST).save(a.sheet)
        gif = [Image.alpha_composite(Image.new("RGBA", (W, H), (200, 200, 200, 255)), f).resize((W * z, H * z), Image.NEAREST) for f in frames]
        gif[0].save(os.path.splitext(a.sheet)[0] + ".gif", save_all=True, append_images=gif[1:], duration=110, loop=0)
    print(f"{n} walk frames in {src}")


if __name__ == "__main__":
    main()
