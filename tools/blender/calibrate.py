"""Camera calibration sheet: the same small park scene rendered at several foreshortenings K.

    python tools/blender/calibrate.py [out_dir]    (with bpy and pillow installed; see README.md)

Writes calib_k<K>.png (1x, objects only), and calibration.png: a contact sheet at 3x, one row per K,
the Blender render on the park ground beside today's placeholder fence and person for scale.
Prints measurements so the numbers can be checked, not just eyeballed.
"""
import math
import os
import sys

import bpy
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import camera as C   # noqa: E402

KS = [0.35, 0.5, 0.75, 1.0]
W, H = 192, 160                  # px; 12 x 10 tiles of ground
GRID_W, GRID_H = 12, 10
FENCE_H = 1.2                    # m: a log palisade about chest high
PERSON_M, PERSON_PX = 1.75, 28   # from src/view/display.js
PARK_GROUND = "#7d8c58"          # src/sim/data.js
PALISADE = "#7a5532"
RESTROOM = "#6f8fa8"
DIME = "#a0613d"
DIME_LEN = 3.2


def display_px(m):               # src/view/display.js, the size curve
    return max(7, round(PERSON_PX * (m / PERSON_M) ** 0.6))


def g2b(gx, gy, z=0.0):
    """Grid coordinates (tiles, y south) to Blender (x east, y north)."""
    return (gx, -gy, z)


def box(name, gx0, gy0, gx1, gy1, z0, z1, mat):
    """An axis-aligned block covering grid tiles gx0..gx1, gy0..gy1 (exclusive ends), z0..z1 m up."""
    cx, cy = (gx0 + gx1) / 2, (gy0 + gy1) / 2
    bpy.ops.mesh.primitive_cube_add(size=1, location=g2b(cx, cy, (z0 + z1) / 2))
    ob = bpy.context.object
    ob.name = name
    ob.scale = (gx1 - gx0, gy1 - gy0, z1 - z0)
    ob.data.materials.append(mat)
    return ob


def gable(name, gx0, gy0, gx1, gy1, z0, rise, mat):
    """A gable roof whose ridge runs east-west, so the slopes face north and south (the camera)."""
    x0, x1 = gx0, gx1
    s, n = -gy1, -gy0                     # Blender y of the south and north eaves
    mid = (s + n) / 2
    verts = [(x0, s, z0), (x1, s, z0), (x1, n, z0), (x0, n, z0), (x0, mid, z0 + rise), (x1, mid, z0 + rise)]
    faces = [(0, 1, 5, 4), (2, 3, 4, 5), (0, 4, 3), (1, 2, 5), (0, 3, 2, 1)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat)
    return ob


def person(gx, gy, mat_body, mat_head):
    """A 1.75 m capsule-ish figure: body cylinder and a head sphere."""
    bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=1.25, location=g2b(gx, gy, 0.625), vertices=12)
    bpy.context.object.data.materials.append(mat_body)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.25, location=g2b(gx, gy, 1.5), segments=12, ring_count=8)
    bpy.context.object.data.materials.append(mat_head)


def dimetrodon(gx, gy, yaw_deg, mat, mat_sail):
    """A blocky Dimetrodon stand-in at the size curve's scale, built facing +x then turned by yaw."""
    s = display_px(DIME_LEN) / C.TILE_PX / DIME_LEN       # size-curve scale: drawn length / real length
    parts = []

    def add(ob):
        ob.data.materials.append(mat)
        parts.append(ob)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, location=(0.1, 0, 0.55))
    b = bpy.context.object; b.scale = (0.85, 0.32, 0.28); add(b)                          # body
    bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=0.2, radius2=0.02, depth=1.5,
                                    location=(-1.35, 0, 0.42), rotation=(0, -math.radians(95), 0))
    add(bpy.context.object)                                                               # tail
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, location=(1.05, 0, 0.62))
    hd = bpy.context.object; hd.scale = (0.32, 0.17, 0.17); add(hd)                       # head
    for lx in (0.55, -0.4):
        for ly in (0.28, -0.28):
            bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.08, depth=0.45, location=(lx, ly, 0.22))
            add(bpy.context.object)                                                       # legs
    # The sail: a thin half disc along the back.
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.62, depth=0.05,
                                        location=(0.05, 0, 0.78), rotation=(math.radians(90), 0, 0))
    sail = bpy.context.object; sail.scale = (1.0, 0.85, 1.0)
    sail.data.materials.append(mat_sail)
    bm_cut = sail.data
    for v in bm_cut.vertices:                     # flatten the lower half onto the back line
        if v.co.y < 0:
            v.co.y = 0
    parts.append(sail)

    root = bpy.data.objects.new("dime", None)
    bpy.context.scene.collection.objects.link(root)
    for p in parts:
        p.parent = root
    root.scale = (s, s, s)
    root.rotation_euler = (0, 0, math.radians(yaw_deg))
    root.location = g2b(gx, gy)
    return root


def build_scene():
    pal = C.toon_material("palisade", C.hexrgb(PALISADE))
    wall = C.toon_material("restroom", C.hexrgb(RESTROOM))
    roof = C.toon_material("roof", C.hexrgb("#8a4b3b"))
    door = C.toon_material("door", C.hexrgb("#3e3a36"))
    body = C.toon_material("shirt", C.hexrgb("#c9a227"))
    head = C.toon_material("skin", C.hexrgb("#e8c39e"))
    dime = C.toon_material("dime", C.hexrgb(DIME))
    sail = C.toon_material("sail", C.hexrgb("#d08a4c"))
    ball = C.toon_material("ball", C.hexrgb("#b8b0a0"))
    # A fence run with a corner: a row going east (front faces show) and a column going south.
    box("fence_row", 1, 3, 6, 4, 0, FENCE_H, pal)
    box("fence_col", 1, 4, 2, 8, 0, FENCE_H, pal)
    # A 2 x 2 restroom: walls 2.4 m, a gable roof 0.9 m higher, a door in the front.
    box("rr", 8, 2, 10, 4, 0, 2.4, wall)
    gable("rr_roof", 7.9, 1.9, 10.1, 4.1, 2.4, 0.9, roof)
    box("rr_door", 8.7, 3.98, 9.3, 4.02, 0, 1.7, door)
    person(7.5, 6.0, body, head)
    dimetrodon(4.5, 6.2, -45, dime, sail)     # facing front-right (south-east)
    dimetrodon(9.0, 8.4, -135, dime, sail)    # facing front-left (south-west)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, location=g2b(11.0, 6.0, 0.5), segments=24, ring_count=12)
    bpy.context.object.data.materials.append(ball)


def ground():
    """Park ground drawn flat, the way the game does (the ground doesn't depend on K). Tile checker
    so the 16 px grid shows."""
    base = C.hexrgb(PARK_GROUND)
    img = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(img)
    for ty in range(GRID_H):
        for tx in range(GRID_W):
            f = 1.0 if (tx + ty) % 2 == 0 else 0.95
            d.rectangle([tx * 16, ty * 16, tx * 16 + 15, ty * 16 + 15],
                        fill=tuple(int(c * 255 * f) for c in base) + (255,))
    return img


def outline(img):
    """Tinted outline: an opaque pixel touching transparency becomes a dark step of its own color."""
    px = img.load()
    w, h = img.size
    out = img.copy()
    o = out.load()
    for y in range(h):
        for x in range(w):
            if px[x, y][3] < 128:
                continue
            if any(not (0 <= x + dx < w and 0 <= y + dy < h) or px[x + dx, y + dy][3] < 128
                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                r, g, b, _ = px[x, y]
                o[x, y] = (int(r * 0.5), int(g * 0.45), int(b * 0.45), 255)
    return out


def placeholder_strip():
    """Today's renderer: a fence tile (top shifted up by 0.35 T, front 0.35 T) and a 28 px person."""
    img = Image.new("RGBA", (64, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    gy = 4 * 16                                        # fence on grid row 4, like a tile row
    front = round(16 * 0.35)
    for tx in range(1, 3):
        x = tx * 16
        d.rectangle([x, gy - front, x + 15, gy - front + 15], fill=_shade(PALISADE, 0.12))
        d.rectangle([x, gy + 16 - front, x + 15, gy + 15], fill=_shade(PALISADE, -0.28))
    fy, fx = 7 * 16, 32
    d.rectangle([fx - 4, fy - round(PERSON_PX * 0.7), fx + 3, fy - 1], fill=(201, 162, 39, 255))
    d.rectangle([fx - 4, fy - PERSON_PX, fx + 3, fy - round(PERSON_PX * 0.7) - 1], fill=(232, 195, 158, 255))
    return img


def _shade(hexc, k):
    r, g, b = (int(c * 255) for c in C.hexrgb(hexc))
    f = (lambda c: c + (255 - c) * k) if k > 0 else (lambda c: c * (1 + k))
    return (int(f(r)), int(f(g)), int(f(b)), 255)


def measure(img, k):
    """Check the render against the projection: the fence top must start 16*FENCE_H*K px above its
    footprint, and report how tall the 1.75 m person comes out (the game draws people 28 px)."""
    a = img.load()
    h = img.size[1]
    def top(x):
        return next(y for y in range(h) if a[x, y][3] >= 128)
    north = 3 * 16                                    # fence row footprint starts at grid row 3
    got, want = north - top(3 * 16 + 8), round(16 * FENCE_H * k)
    print(f"K={k}: fence front {got} px (expected {want}){'' if got == want else '  MISMATCH'}")
    x = 7 * 16 + 8
    ys = [y for y in range(h) if a[x, y][3] >= 128 and y < 6 * 16 + 8]
    print(f"K={k}: person {max(ys) - min(ys) + 1} px tall (game: {PERSON_PX})")


def main():
    out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else (sys.argv[1] if len(sys.argv) > 1 else ".")
    os.makedirs(out, exist_ok=True)
    rows = []
    for k in KS:
        sc = C.reset_scene()
        build_scene()
        # Centre on the middle of the grid; GRID sizes are even, so tile corners land on pixel corners.
        C.park_camera(sc, k, W, H, center=(GRID_W / 2, -GRID_H / 2))
        path = os.path.join(out, f"calib_k{k}.png")
        C.render(sc, path)
        obj = Image.open(path).convert("RGBA")
        measure(obj, k)
        frame = ground()
        frame.alpha_composite(outline(obj))
        ph = ground().crop((0, 0, 64, H))
        ph.alpha_composite(placeholder_strip())
        row = Image.new("RGBA", (64 + 8 + W, H + 14), (30, 30, 34, 255))
        row.paste(ph, (0, 14))
        row.paste(frame, (72, 14))
        d = ImageDraw.Draw(row)
        d.text((2, 1), "today", fill=(220, 220, 220, 255))
        d.text((74, 1), f"K = {k}   (tilt {math.degrees(math.atan(k)):.0f} deg from straight down)",
               fill=(220, 220, 220, 255))
        rows.append(row)
    sheet = Image.new("RGBA", (rows[0].width, sum(r.height for r in rows)), (30, 30, 34, 255))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height
    sheet = sheet.resize((sheet.width * 3, sheet.height * 3), Image.NEAREST)
    sheet.save(os.path.join(out, "calibration.png"))
    print("wrote", os.path.join(out, "calibration.png"))


main()
