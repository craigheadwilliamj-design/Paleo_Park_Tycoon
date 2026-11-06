"""Build an animal model from its drawn side view (a v1 rig), and turn label renders into palette pixels.

The drawing is the source of truth:
- Shape: the trunk (body, head, jaws, tail) is lofted column by column from the drawing, so seen
  from the side the silhouette is the drawing's. Width comes from per-region ratios in the species
  file (the one thing a side view can't say). The sail is a thin slab traced from the drawing.
  Legs run between the rig's own joint pivots, sprawled out sideways by `legs.sprawl`.
- Color: the drawing's pixels are turned into labels (ramp + step, or ink) and projected onto the
  model from the side. Blender renders labels, never colors: each pixel says which ramp step it is,
  which light band it's in and how far away it is. `finish()` looks the color up in the species'
  ramps, so every pixel is a palette color.

Model units are drawing pixels: x = column - CX (east, toward the snout), z = 75 - row (up), y across.
The root empty's scale turns them into metres.
"""
import json
import math
import os

import bpy
import numpy as np
from PIL import Image

import camera as C

CX = 49                     # model x origin, in drawing columns (about mid-body)
INK = 240                   # label code for ink (eyes, mouth line, outlines)
BANDS = (-0.5, -0.85)       # N.L above the first: as drawn (the drawing already has its side lighting);
                            # above the second: one step darker; below: two (undersides)
ROOT = os.path.join(os.path.dirname(__file__), "..", "..")


# ---------- reading the rig ----------

def load(species_path):
    sp = json.load(open(species_path))
    rig = json.load(open(os.path.join(ROOT, sp["rig"])))
    sp["_rig"] = rig
    sp["_ramp_ids"] = {name: i for i, name in enumerate(sp["ramps"])}
    return sp


def _asset(rig, key):
    import base64, io
    return Image.open(io.BytesIO(base64.b64decode(rig["assets"][key].split(",", 1)[1]))).convert("RGBA")


def rest_image(sp, keep):
    """The rig's rest pose with only the nodes `keep(node)` says yes to. Assets are stored at cell
    coordinates, so at rest they just stack; a flipped node is mirrored about its joint."""
    rig = sp["_rig"]
    W, H = rig["cell"]["w"], rig["cell"]["h"]
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for n in rig["nodes"]:
        if not keep(n):
            continue
        im = _asset(rig, n["asset"])
        if n.get("flip"):
            im = im.transform((W, H), Image.AFFINE, (-1, 0, 2 * n["px"], 0, 1, 0), Image.NEAREST)
        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        canvas.paste(im, (0, 0))
        img = Image.alpha_composite(img, canvas)
    return img


def is_trunk(n):
    return n["name"] in ("Body", "Head", "Jaws", "Tail")


def is_near_leg(n):
    return not is_trunk(n) and "far" not in n["name"]


# ---------- labels ----------

def _hex(c):
    return "#%02x%02x%02x" % c[:3]


def labels(sp, img):
    """Drawing -> label codes (0 = empty). code = ramp*16 + step + 1, or INK."""
    a = np.array(img)
    out = np.zeros(a.shape[:2], np.uint8)
    lookup = {}
    for name, steps in sp["ramps"].items():
        for i, h in enumerate(steps):
            lookup[h] = sp["_ramp_ids"][name] * 16 + i + 1
    lookup[sp["ink"]] = INK
    for h, (name, i) in sp["colors"].items():
        lookup[h] = INK if name == "ink" else sp["_ramp_ids"][name] * 16 + i + 1
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y, x, 3] >= 128:
                h = _hex(tuple(a[y, x]))
                if h not in lookup:
                    raise ValueError(f"{h} at {x},{y} is in no ramp; add it to 'colors'")
                out[y, x] = lookup[h]
    return out


def strip_silhouette_ink(lab):
    """Outline pixels on the silhouette are redrawn after rendering; for projection they take the
    label of the nearest colored pixel. Ink inside the shape (eye, mouth) stays."""
    h, w = lab.shape
    opaque = lab > 0
    edge = np.zeros_like(opaque)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            sh = np.zeros_like(opaque)
            sh[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] = \
                ~opaque[max(0, -dy):h + min(0, -dy), max(0, -dx):w + min(0, -dx)]
            edge |= sh
    # pixels outside the cell count as empty
    edge[0, :] = edge[-1, :] = True
    edge[:, 0] = edge[:, -1] = True
    lab = lab.copy()
    lab[(lab == INK) & edge] = 0
    return lab


def dilate(lab, times):
    """Grow labels into empty pixels (4-neighbours), so surfaces just outside the traced outline
    still sample a sensible color."""
    lab = lab.copy()
    for _ in range(times):
        src = lab.copy()
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sh = np.roll(np.roll(src, dy, 0), dx, 1)
            take = (lab == 0) & (sh > 0) & (sh != INK)
            lab[take] = sh[take]
    return lab


def label_image(lab, name):
    """Labels as a Blender image (red channel = code/255), read with Closest and no color management."""
    h, w = lab.shape
    px = np.zeros((h, w, 4), np.float32)
    px[..., 0] = lab / 255.0
    px[..., 3] = 1.0
    im = bpy.data.images.new(name, w, h, alpha=True, float_buffer=True)
    im.colorspace_settings.name = "Non-Color"
    im.pixels.foreach_set(px[::-1].ravel())          # Blender rows run bottom up
    return im


# ---------- the label material ----------

def label_material(name, img, root):
    """Emission = (label, light band, depth). Labels come from the drawing through the UVs."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    N = nt.nodes.new
    L = nt.links.new

    # UVs hold the rest-pose side projection (see _mesh), so the drawing stays put as the model moves
    tc = N("ShaderNodeTexCoord")
    tex = N("ShaderNodeTexImage"); tex.image = img; tex.interpolation = "Closest"; tex.extension = "EXTEND"
    L(tc.outputs["UV"], tex.inputs["Vector"])
    sepc = N("ShaderNodeSeparateColor"); L(tex.outputs["Color"], sepc.inputs[0])

    geo = N("ShaderNodeNewGeometry")
    lv = N("ShaderNodeCombineXYZ")
    n = math.sqrt(sum(c * c for c in C.LIGHT))
    for i, c in enumerate(C.LIGHT):
        lv.inputs[i].default_value = c / n
    dot = N("ShaderNodeVectorMath"); dot.operation = "DOT_PRODUCT"
    L(geo.outputs["Normal"], dot.inputs[0]); L(lv.outputs[0], dot.inputs[1])
    g1 = N("ShaderNodeMath"); g1.operation = "GREATER_THAN"; L(dot.outputs["Value"], g1.inputs[0]); g1.inputs[1].default_value = BANDS[0]
    g2 = N("ShaderNodeMath"); g2.operation = "GREATER_THAN"; L(dot.outputs["Value"], g2.inputs[0]); g2.inputs[1].default_value = BANDS[1]
    band = N("ShaderNodeMath"); band.operation = "ADD"; L(g1.outputs[0], band.inputs[0]); L(g2.outputs[0], band.inputs[1])
    bandv = N("ShaderNodeMath"); bandv.operation = "DIVIDE"; L(band.outputs[0], bandv.inputs[0]); bandv.inputs[1].default_value = 255

    camd = N("ShaderNodeCameraData")
    depth = N("ShaderNodeMath"); depth.operation = "DIVIDE"
    L(camd.outputs["View Z Depth"], depth.inputs[0]); depth.inputs[1].default_value = 100

    rgb = N("ShaderNodeCombineColor")
    L(sepc.outputs[0], rgb.inputs[0]); L(bandv.outputs[0], rgb.inputs[1]); L(depth.outputs[0], rgb.inputs[2])
    em = N("ShaderNodeEmission"); L(rgb.outputs[0], em.inputs["Color"])
    out = N("ShaderNodeOutputMaterial"); L(em.outputs[0], out.inputs["Surface"])
    return m


# ---------- geometry ----------

CELL = (110, 75)            # the drawing's size; set from the rig in build()


def _mesh(name, verts, faces, mat, root, posed=None):
    """A mesh whose UVs project the drawing from the side at its rest shape (verts), shown in the
    posed shape (posed, same topology) if given."""
    me = bpy.data.meshes.new(name)
    me.from_pydata(posed or verts, [], faces)
    me.update()
    uv = me.uv_layers.new(name="drawing")
    W, H = CELL
    for loop in me.loops:
        x, _, z = verts[loop.vertex_index]
        uv.data[loop.index].uv = ((x + CX) / W, z / H)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = root
    for p in me.polygons:
        p.use_smooth = False
    return ob


def _width_ratio(sp, col):
    for r in sp["width"]:
        if r["from"] <= col < r["to"]:
            return r["ratio"]
    return 1.0


def trace(sp, lab):
    """Per column: the trunk's bottom and top rows, and the sail's top row (or None)."""
    sail_id = sp["_ramp_ids"][sp["sail_ramp"]]
    is_sail = lambda c: c != 0 and c != INK and (c - 1) // 16 == sail_id
    h, w = lab.shape
    cols = {}
    for x in range(w):
        col = lab[:, x]
        rows = [y for y in range(h) if col[y]]
        if not rows:
            continue
        sail_rows = set(y for y in rows if is_sail(col[y]))
        # ink is part of the sail when sail lies below it in the same column (the sail's own outline)
        for y in rows:
            if col[y] == INK and any(is_sail(col[yy]) for yy in range(y + 1, h)) and \
                    not any(not is_sail(col[yy]) and col[yy] and col[yy] != INK for yy in range(y - 1, -1, -1)):
                sail_rows.add(y)
        bottom = max(y for y in rows if y not in sail_rows) if any(y not in sail_rows for y in rows) else None
        if bottom is None:
            continue
        top = bottom
        while top - 1 >= 0 and col[top - 1] and (top - 1) not in sail_rows:
            top -= 1
        sail_top = min(sail_rows) if sail_rows else None
        cols[x] = (bottom, top, sail_top)
    return cols


def build_trunk(sp, cols, mat, root, pose=None, seg=16, n_exp=2.5):
    xs = sorted(cols)
    rings = []
    for x in xs:
        bottom, top, _ = cols[x]
        zb, zt = 75 - (bottom + 1), 75 - top
        zc, rz = (zb + zt) / 2, (zt - zb) / 2
        rings.append((x + 0.5 - CX, zc, rz))
    # widths: the ratio times half-height, lightly smoothed so the top view isn't stair-stepped
    ry = [rz * _width_ratio(sp, x) for x, (_, _, rz) in zip(xs, rings)]
    ry = [(ry[max(0, i - 1)] + 2 * ry[i] + ry[min(len(ry) - 1, i + 1)]) / 4 for i in range(len(ry))]
    verts, faces = [], []
    for (x, zc, rz), w in zip(rings, ry):
        for k in range(seg):
            t = 2 * math.pi * k / seg
            c, s = math.cos(t), math.sin(t)
            verts.append((x, w * math.copysign(abs(c) ** (2 / n_exp), c), zc + rz * math.copysign(abs(s) ** (2 / n_exp), s)))
    for i in range(len(rings) - 1):
        for k in range(seg):
            a, b = i * seg + k, i * seg + (k + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    # caps: the tail tip and the snout close on a point half a pixel out
    for end, i, sign in ((0, 0, -1), (1, len(rings) - 1, 1)):
        x, zc, _ = rings[i]
        verts.append((x + 0.5 * sign, 0, zc))
        tip = len(verts) - 1
        for k in range(seg):
            a, b = i * seg + k, i * seg + (k + 1) % seg
            faces.append((a, tip, b) if sign < 0 else (b, tip, a))
    return _mesh("trunk", verts, faces, mat, root, [pose.body(v) for v in verts] if pose else None)


def build_sail(sp, cols, mat, root, pose=None):
    th = sp["sail_thickness"] / 2
    xs = [x for x in sorted(cols) if cols[x][2] is not None]
    if not xs:
        return None
    pts = []
    for x in xs:
        _, top, sail_top = cols[x]
        pts.append((x + 0.5 - CX, 75 - top - 1.0, 75 - sail_top))
    pts = [(pts[0][0] - 0.5, pts[0][1], pts[0][1])] + pts + [(pts[-1][0] + 0.5, pts[-1][1], pts[-1][1])]
    verts, faces = [], []
    for x, zb, zt in pts:
        verts += [(x, -th, zb), (x, -th, zt), (x, th, zt), (x, th, zb)]
    for i in range(len(pts) - 1):
        a, b = 4 * i, 4 * (i + 1)
        faces += [(a, b, b + 1, a + 1), (a + 1, b + 1, b + 2, a + 2), (a + 2, b + 2, b + 3, a + 3)]
    faces += [(0, 1, 2, 3), (4 * len(pts) - 1, 4 * len(pts) - 2, 4 * len(pts) - 3, 4 * len(pts) - 4)]
    return _mesh("sail", verts, faces, mat, root, [pose.body(v) for v in verts] if pose else None)


def _tube(name, pts, radii, mat, root, posed=None, seg=8):
    """A tube through points with a radius at each, closed at both ends. posed: the same points
    moved; the UVs stay with the rest tube."""
    verts, faces = _tube_geo(pts, radii, seg)
    return _mesh(name, verts, faces, mat, root, _tube_geo(posed, radii, seg)[0] if posed else None)


def _tube_geo(pts, radii, seg):
    verts, faces = [], []
    for i, (p, r) in enumerate(zip(pts, radii)):
        d = np.array(pts[min(i + 1, len(pts) - 1)]) - np.array(pts[max(i - 1, 0)])
        d /= np.linalg.norm(d)
        a = np.cross(d, (0, 0, 1)) if abs(d[2]) < 0.9 else np.cross(d, (1, 0, 0))
        a /= np.linalg.norm(a)
        b = np.cross(d, a)
        for k in range(seg):
            t = 2 * math.pi * k / seg
            verts.append(tuple(np.array(p) + r * (math.cos(t) * a + math.sin(t) * b)))
    for i in range(len(pts) - 1):
        for k in range(seg):
            a_, b_ = i * seg + k, i * seg + (k + 1) % seg
            faces.append((a_, b_, b_ + seg, a_ + seg))
    for i, p in ((0, pts[0]), (len(pts) - 1, pts[-1])):
        verts.append(tuple(p))
        c = len(verts) - 1
        for k in range(seg):
            a_, b_ = i * seg + k, i * seg + (k + 1) % seg
            faces.append((a_, c, b_) if i == 0 else (b_, c, a_))
    return verts, faces


def build_legs(sp, cols, mat, root, pose=None):
    nodes = {n["name"]: n for n in sp["_rig"]["nodes"]}
    sprawl = sp["legs"]["sprawl"]
    obs = []
    for key in ("front", "back"):
        L = sp["legs"][key]
        up, lo, ft = nodes[L["upper"]], nodes[L["lower"]], nodes[L["foot"]]
        pos = lambda n: (n["px"] - CX, 75 - n["py"])
        (sx, sz), (ex, ez), (wx, wz) = pos(up), pos(lo), pos(ft)
        # the body's half width at the shoulder or hip
        col = up["px"]
        b, t, _ = cols[col]
        half = (t - b - 1) / 2 * -1 * _width_ratio(sp, col)
        half = abs(half)
        r0, r1 = L["r"]
        upper_len = math.hypot(ex - sx, ez - sz)
        for side in (-1, 1):
            S = (sx, side * half * 0.55, sz)
            E = (ex, side * (half * 0.55 + sprawl * max(upper_len, 3)), ez)
            Wr = (wx, E[1] + side * 0.5, wz)
            # the foot: a flat pad from the wrist forward and a little out
            fl = L["foot_len"]
            F0 = (wx - 0.5, Wr[1], 1.0)
            F1 = (wx + fl - 1.0, Wr[1] + side * 1.0, 1.0)
            limb = foot = None
            if pose:
                S2, E2, W2, F02, F12 = pose.leg(key, side, S, E, Wr, F0, F1)
                limb, foot = [S2, E2, W2], [W2, F02, F12]
            obs.append(_tube(f"{key}_limb{side}", [S, E, Wr], [r0, r1 * 1.1, r1], mat, root, limb))
            obs.append(_tube(f"{key}_foot{side}", [Wr, F0, F1], [r1, r1, 1.1], mat, root, foot))
    return obs


def build(sp, pose_at=None):
    """Make the model under a root empty (model units = drawing pixels). Returns the root.
    pose_at(sp, cols) -> a pose (body(v) and leg(...)), e.g. a frame of the walk; None for rest."""
    global CELL
    CELL = (sp["_rig"]["cell"]["w"], sp["_rig"]["cell"]["h"])
    trunk_img = rest_image(sp, is_trunk)
    legs_img = rest_image(sp, is_near_leg)
    trunk_lab = labels(sp, trunk_img)
    legs_lab = labels(sp, legs_img)
    cols = trace(sp, trunk_lab)
    pose = pose_at(sp, cols) if pose_at else None

    root = bpy.data.objects.new(sp["name"], None)
    bpy.context.scene.collection.objects.link(root)
    # Separate maps for the trunk and the sail: with one map, the top of the trunk (seen from above
    # in the 3/4 views) samples the sail's bottom row and gets stray orange pixels on the back.
    flat = strip_silhouette_ink(trunk_lab)
    body_lab, sail_lab = flat.copy(), flat.copy()
    for x, (_, top, _) in cols.items():
        body_lab[:top, x] = 0          # above the trunk: grown from the back's own colors instead
        sail_lab[top:, x] = 0          # the trunk: grown from the sail's colors (the sail is sunk into it)
    tmat = label_material("trunk", label_image(dilate(body_lab, 6), "trunk_labels"), root)
    smat = label_material("sail", label_image(dilate(sail_lab, 6), "sail_labels"), root)
    lmat = label_material("legs", label_image(dilate(strip_silhouette_ink(legs_lab), 6), "leg_labels"), root)
    build_trunk(sp, cols, tmat, root, pose)
    build_sail(sp, cols, smat, root, pose)
    build_legs(sp, cols, lmat, root, pose)
    return root


def scale_for(sp, length_px):
    """Root scale (metres per model unit) so the model draws `length_px` long at 16 px a metre."""
    lab = labels(sp, rest_image(sp, lambda n: True))
    xs = np.nonzero(lab.any(axis=0))[0]
    return length_px / (xs.max() - xs.min() + 1) / C.TILE_PX


# ---------- rendering labels and finishing ----------

def setup_label_render(sc):
    sc.view_settings.view_transform = "Raw"
    sc.render.image_settings.color_depth = "16"


def finish(sp, path, outline_gap):
    """Label render -> palette image. outline_gap: a depth step (metres) that draws an inner outline."""
    # read through Blender: Pillow drops 16-bit RGBA to 8 bits, and depth needs the precision
    im = bpy.data.images.load(path)
    im.colorspace_settings.name = "Non-Color"
    w, h = im.size
    a = np.array(im.pixels[:], np.float64).reshape(h, w, 4)[::-1]
    bpy.data.images.remove(im)
    lab = np.rint(a[..., 0] * 255).astype(int)
    band = np.rint(a[..., 1] * 255).astype(int)
    depth = a[..., 2] * 100
    alpha = a[..., 3] > 0.5
    ramps = [[C.hexrgb(c) for c in steps] for steps in sp["ramps"].values()]
    ink = C.hexrgb(sp["ink"])
    out = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        for x in range(w):
            if not alpha[y, x]:
                continue
            c = lab[y, x]
            if c == INK or c == 0:
                rgb = ink
            else:
                r = ramps[(c - 1) // 16]
                rgb = r[max(0, min(len(r) - 1, (c - 1) % 16 + band[y, x] - 2))]
            out[y, x] = [int(round(v * 255)) for v in rgb] + [255]
    # outlines: the silhouette, and the near side of any depth step (a leg over the body)
    inkc = [int(round(v * 255)) for v in ink] + [255]
    edge = np.zeros((h, w), bool)
    for y in range(h):
        for x in range(w):
            if not alpha[y, x]:
                continue
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if not (0 <= yy < h and 0 <= xx < w) or not alpha[yy, xx] or depth[yy, xx] - depth[y, x] > outline_gap:
                    edge[y, x] = True
                    break
    out[edge] = inkc
    return Image.fromarray(out, "RGBA")
