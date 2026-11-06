"""The park camera for Blender renders, and the toon material every render uses.

The game's view is top-down with a tilt: a ground tile is always a 16 x 16 px square, and an upright
face shows foreshortened by K (screen px of height per screen px of ground depth, so a 1 m wall
draws 16*K px tall). A real orthographic camera tilted by atan(K) from straight down gives exactly
that once its pixels are stretched back to square ground (pixel_aspect_x = 1/cos), and keeps the
lighting physically right, unlike shearing the scene.

World units: 1 Blender unit = 1 tile = 1 m. Grid x runs east (+x), grid y runs south, which is -y
in Blender. The camera looks north, so south faces are the "front" faces.

Run with Blender's Python (the `bpy` wheel): see tools/blender/README.md.
"""
import math
import bpy
from mathutils import Vector

TILE_PX = 16
LIGHT = (-0.55, 0.35, 1.0)   # from the top left of the screen: west, a little north, mostly above


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 1                 # materials are pure emission: one sample is exact
    sc.cycles.filter_width = 0.01         # no anti-aliasing: every pixel is one solid sample
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 0
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"   # no filmic curve, colors come out as authored
    sc.render.image_settings.color_mode = "RGBA"
    return sc


def park_camera(sc, k, w_px, h_px, center=(0.0, 0.0)):
    """Orthographic camera for foreshortening k, framing w_px x h_px centred on the ground point
    `center` (Blender x, y). Both sizes should be even so tile edges land on pixel edges."""
    phi = math.atan(k)
    sc.render.resolution_x, sc.render.resolution_y = w_px, h_px
    sc.render.pixel_aspect_x, sc.render.pixel_aspect_y = 1 / math.cos(phi), 1.0
    cam = bpy.data.cameras.new("park")
    cam.type = "ORTHO"
    cam.clip_start, cam.clip_end = 0.1, 200
    ob = bpy.data.objects.new("park", cam)
    sc.collection.objects.link(ob)
    sc.camera = ob
    _frame(ob, phi, w_px, h_px, center)
    return ob


def _frame(ob, phi, w_px, h_px, center):
    # ortho_scale spans the wider side in world units. Horizontal is never stretched, so width rules
    # unless the stretched height is wider.
    w_world = w_px / TILE_PX
    h_world = h_px / TILE_PX * math.cos(phi)       # image height in camera-plane units
    ob.data.ortho_scale = max(w_world, h_world)
    ob.rotation_euler = (phi, 0.0, 0.0)
    d = (0.0, math.sin(phi), -math.cos(phi))       # view direction
    dist = 50.0
    ob.location = (center[0] - d[0] * dist, center[1] - d[1] * dist, -d[2] * dist)


def toon_material(name, rgb, bands=(0.62, 0.82, 1.0), steps=(0.25, 0.7)):
    """Flat color lit in hard bands by a fixed light from the top left. No real lights, no shadows:
    the brightness is N.L through a constant ramp, so the output is a few exact colors per material."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    lv = nt.nodes.new("ShaderNodeCombineXYZ")
    n = math.sqrt(sum(c * c for c in LIGHT))
    for i, c in enumerate(LIGHT):
        lv.inputs[i].default_value = c / n
    dot = nt.nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, (bands[0],) * 3 + (1,)
    els[1].position, els[1].color = steps[0], (bands[1],) * 3 + (1,)
    e3 = els.new(steps[1])
    e3.color = (bands[2],) * 3 + (1,)
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    mul.inputs[6].default_value = _lin(rgb) + (1,)
    em = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(geo.outputs["Normal"], dot.inputs[0])
    nt.links.new(lv.outputs[0], dot.inputs[1])
    nt.links.new(dot.outputs["Value"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], mul.inputs[7])
    nt.links.new(mul.outputs[2], em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


def flat_material(name, rgb):
    """Unlit color, for ground."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = _lin(rgb) + (1,)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def _lin(rgb):
    # Blender works in linear light; the Standard view transform turns it back into sRGB on save.
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb)


def render(sc, path):
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def view_camera(sc, rot_deg, w_px, h_px, center):
    """A plain orthographic camera at 16 px a metre (square pixels): rot_deg is its Euler rotation,
    center the 3D point at the image centre. (90, 0, 0) looks north from the side; (0, 0, 0) looks down."""
    sc.render.resolution_x, sc.render.resolution_y = w_px, h_px
    sc.render.pixel_aspect_x = sc.render.pixel_aspect_y = 1.0
    cam = bpy.data.cameras.new("view")
    cam.type = "ORTHO"
    cam.clip_start, cam.clip_end = 0.1, 200
    cam.ortho_scale = max(w_px, h_px) / TILE_PX
    ob = bpy.data.objects.new("view", cam)
    sc.collection.objects.link(ob)
    sc.camera = ob
    ob.rotation_euler = tuple(math.radians(a) for a in rot_deg)
    d = ob.rotation_euler.to_matrix() @ Vector((0, 0, -1))
    ob.location = tuple(c - dc * 50 for c, dc in zip(center, d))
    return ob
