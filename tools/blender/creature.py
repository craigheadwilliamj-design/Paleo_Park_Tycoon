"""Build an animal from its species file (anatomy as numbers) and turn label renders into palette pixels.

Shape: skin-modifier chains. The body is one chain (tail tip to snout) with a half width and half
height at each point; each limb is its own chain, mirrored to both sides. A sail is a thin slab on
the back. Subdivision smooths it all.

Color: Blender never makes a color. Each material writes a label (ramp + step, or ink), the light
band and the depth; `finish()` looks the color up in the species' ramps and draws the outlines.
Regions are rules, not paint: belly where the surface faces down, sail stripes by position along
the back, a mouth line and an eye in ink.

Units are metres, x forward (snout), y left, z up. The root empty's scale applies the size curve.
"""
import json
import math

import bpy
import numpy as np

import camera as C

INK = 240                   # label code for ink
BANDS = (-0.35, -0.72)      # N.L above the first: base step; above the second: one darker; below: two


def load(path):
    sp = json.load(open(path))
    sp["_ramp_ids"] = {name: i for i, name in enumerate(sp["ramps"])}
    return sp


def code(sp, ramp, step):
    return sp["_ramp_ids"][ramp] * 16 + step + 1


# ---------- label materials ----------

class Nodes:
    """Small helper for building node trees by hand."""

    def __init__(self, name):
        self.m = bpy.data.materials.new(name)
        self.m.use_nodes = True
        self.nt = self.m.node_tree
        self.nt.nodes.clear()

    def new(self, kind, **props):
        n = self.nt.nodes.new(kind)
        for k, v in props.items():
            setattr(n, k, v)
        return n

    def link(self, a, b):
        self.nt.links.new(a, b)

    def math(self, op, a, b=None):
        n = self.new("ShaderNodeMath", operation=op)
        for i, x in enumerate((a, b)):
            if x is None:
                continue
            if isinstance(x, (int, float)):
                n.inputs[i].default_value = x
            else:
                self.link(x, n.inputs[i])
        return n.outputs[0]

    def mix(self, fac, a, b):
        """b where fac is 1, else a (all scalars)."""
        return self.math("ADD", self.math("MULTIPLY", self.math("SUBTRACT", 1.0, fac), a), self.math("MULTIPLY", fac, b))


def label_material(name, label_fn):
    """Emission = (label/255, band/255, depth/100). label_fn(nodes, coords) returns the label socket
    (or a constant); coords has 'obj' (object coordinates, a separate-XYZ node) and 'nrm' (object normal)."""
    N = Nodes(name)
    tc = N.new("ShaderNodeTexCoord")
    obj = N.new("ShaderNodeSeparateXYZ"); N.link(tc.outputs["Object"], obj.inputs[0])
    nrm = N.new("ShaderNodeSeparateXYZ"); N.link(tc.outputs["Normal"], nrm.inputs[0])
    label = label_fn(N, {"obj": obj, "nrm": nrm})
    label = N.math("DIVIDE", label, 255.0) if not isinstance(label, (int, float)) else label / 255.0

    geo = N.new("ShaderNodeNewGeometry")
    lv = N.new("ShaderNodeCombineXYZ")
    n = math.sqrt(sum(c * c for c in C.LIGHT))
    for i, c in enumerate(C.LIGHT):
        lv.inputs[i].default_value = c / n
    dot = N.new("ShaderNodeVectorMath", operation="DOT_PRODUCT")
    N.link(geo.outputs["Normal"], dot.inputs[0]); N.link(lv.outputs[0], dot.inputs[1])
    d = dot.outputs["Value"]
    band = N.math("ADD", N.math("GREATER_THAN", d, BANDS[0]), N.math("GREATER_THAN", d, BANDS[1]))
    camd = N.new("ShaderNodeCameraData")
    rgb = N.new("ShaderNodeCombineColor")
    if isinstance(label, float):
        rgb.inputs[0].default_value = label
    else:
        N.link(label, rgb.inputs[0])
    N.link(N.math("DIVIDE", band, 255.0), rgb.inputs[1])
    N.link(N.math("DIVIDE", camd.outputs["View Z Depth"], 100.0), rgb.inputs[2])
    em = N.new("ShaderNodeEmission"); N.link(rgb.outputs[0], em.inputs["Color"])
    out = N.new("ShaderNodeOutputMaterial"); N.link(em.outputs[0], out.inputs["Surface"])
    return N.m


def body_label(sp):
    skin, belly = code(sp, "skin", 2), code(sp, "belly", 2)
    mo = sp.get("mouth")

    def fn(N, c):
        down = N.math("LESS_THAN", c["nrm"].outputs["Z"], sp["body"]["belly_below"])
        lab = N.mix(down, skin, belly)
        if mo:
            x, z = c["obj"].outputs["X"], c["obj"].outputs["Z"]
            t = N.math("DIVIDE", N.math("SUBTRACT", x, mo["from"]), mo["to"] - mo["from"])
            zl = N.math("ADD", mo["z0"], N.math("MULTIPLY", t, mo["z1"] - mo["z0"]))
            near = N.math("LESS_THAN", N.math("ABSOLUTE", N.math("SUBTRACT", z, zl)), mo["half"])
            inx = N.math("MULTIPLY", N.math("GREATER_THAN", x, mo["from"]), N.math("LESS_THAN", x, mo["to"] + 0.1))
            lab = N.mix(N.math("MULTIPLY", near, inx), lab, INK)
        return lab
    return fn


def sail_label(sp):
    base, light = code(sp, "sail", 1), code(sp, "sail", 2)
    s = sp["sail"]

    def fn(N, c):
        f = N.math("FRACT", N.math("DIVIDE", c["obj"].outputs["X"], s["stripe_period"]))
        return N.mix(N.math("LESS_THAN", f, s["stripe_light"]), base, light)
    return fn


# ---------- geometry ----------

def skin_chain(name, pts, mat, root, subsurf=1):
    """pts: (x, y, z, half_width, half_height). The skin modifier's radius is (across, up) for a
    chain running along x."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([p[:3] for p in pts], [(i, i + 1) for i in range(len(pts) - 1)], [])
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = root
    ob.modifiers.new("skin", "SKIN")
    sv = me.skin_vertices[0].data
    for v, p in zip(sv, pts):
        v.radius = (p[3], p[4])
    sv[0].use_root = True
    if subsurf:
        ss = ob.modifiers.new("smooth", "SUBSURF")
        ss.levels = ss.render_levels = subsurf
    me.materials.append(mat)
    return ob


def body_top(sp, x):
    """Height of the back at x (top of the body chain, linear between points)."""
    ch = sp["body"]["chain"]
    for a, b in zip(ch, ch[1:]):
        if a[0] <= x <= b[0]:
            t = (x - a[0]) / (b[0] - a[0])
            return (a[1] + a[3]) * (1 - t) + (b[1] + b[3]) * t
    return ch[-1][1]


def sail(sp, mat, root, steps=48):
    s = sp["sail"]
    th = s["thickness"] / 2
    pts = []
    for i in range(steps + 1):
        x = s["from"] + (s["to"] - s["from"]) * i / steps
        half = (s["peak"] - s["from"]) if x <= s["peak"] else (s["to"] - s["peak"])
        u = min(1.0, abs(x - s["peak"]) / half)
        h = s["height"] * max(0.0, 1 - u * u) ** s.get("shape", 0.5)
        zb = body_top(sp, x) - 0.06            # sunk into the back so there's no gap
        pts.append((x, zb, zb + 0.06 + h))
    verts, faces = [], []
    for x, zb, zt in pts:
        verts += [(x, -th, zb), (x, -th, zt), (x, th, zt), (x, th, zb)]
    for i in range(len(pts) - 1):
        a, b = 4 * i, 4 * (i + 1)
        faces += [(a, b, b + 1, a + 1), (a + 1, b + 1, b + 2, a + 2), (a + 2, b + 2, b + 3, a + 3)]
    n = 4 * len(pts)
    faces += [(0, 1, 2, 3), (n - 1, n - 2, n - 3, n - 4)]
    me = bpy.data.meshes.new("sail")
    me.from_pydata(verts, [], faces)
    me.update()
    me.materials.append(mat)
    ob = bpy.data.objects.new("sail", me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = root
    return ob


def build(sp):
    root = bpy.data.objects.new(sp["name"], None)
    bpy.context.scene.collection.objects.link(root)
    body = label_material("body", body_label(sp))
    limb = label_material("limb", lambda N, c: code(sp, "skin", 2))
    ink = label_material("ink", lambda N, c: INK)
    skin_chain("body", [(x, 0, z, w, h) for x, z, w, h in sp["body"]["chain"]], body, root)
    for key, pts in sp["limbs"].items():
        if key == "note":
            continue
        for side in (1, -1):
            skin_chain(f"{key}{side}", [(x, side * y, z, w, h) for x, y, z, w, h in pts], limb, root)
    if "sail" in sp:
        sail(sp, label_material("sail", sail_label(sp)), root)
    if "eye" in sp:
        x, y, z, r = sp["eye"]
        for side in (1, -1):
            bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(x, side * y, z), segments=10, ring_count=6)
            e = bpy.context.object
            e.data.materials.append(ink)
            e.parent = root
    return root


def scale_for_px(sp, length_px):
    """Root scale so the animal draws length_px long at 16 px a metre."""
    ch = sp["body"]["chain"]
    return length_px / (ch[-1][0] - ch[0][0]) / C.TILE_PX


# ---------- rendering labels and finishing ----------

def setup_label_render(sc):
    sc.view_settings.view_transform = "Raw"
    sc.render.image_settings.color_depth = "16"


def finish(sp, path, outline_gap):
    """Label render -> palette image. outline_gap: a depth step (metres) that draws an inner outline."""
    from PIL import Image
    im = bpy.data.images.load(path)              # Pillow would drop 16-bit RGBA to 8 bits
    im.colorspace_settings.name = "Non-Color"
    w, h = im.size
    a = np.array(im.pixels[:], np.float64).reshape(h, w, 4)[::-1]
    bpy.data.images.remove(im)
    lab = np.rint(a[..., 0] * 255).astype(int)
    band = np.rint(a[..., 1] * 255).astype(int)
    depth = a[..., 2] * 100
    alpha = a[..., 3] > 0.5
    ramps = [[C.hexrgb(c) for c in steps] for steps in sp["ramps"].values()]
    inkc = [int(round(v * 255)) for v in C.hexrgb(sp["ink"])] + [255]
    out = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        for x in range(w):
            if not alpha[y, x]:
                continue
            c = lab[y, x]
            if c == INK or c == 0:
                out[y, x] = inkc
                continue
            r = ramps[(c - 1) // 16]
            rgb = r[max(0, min(len(r) - 1, (c - 1) % 16 + band[y, x] - 2))]
            out[y, x] = [int(round(v * 255)) for v in rgb] + [255]
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
