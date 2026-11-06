# Blender tools

Headless Blender through its Python module (`bpy`, from PyPI). No Blender app or window needed.

```bash
python3 -m venv /tmp/bvenv && /tmp/bvenv/bin/pip install bpy pillow numpy
/tmp/bvenv/bin/python tools/blender/calibrate.py out/
```

`bpy` needs the Python version it was built for (bpy 5.2 wants 3.13) and is about 400 MB, so keep the venv outside the repo.

- `camera.py`: the park camera and the toon material. An orthographic camera tilted `atan(K)` from straight down, with `pixel_aspect_x = 1/cos` so a ground tile stays 16 x 16 px. An upright face of `h` m draws `16*h*K` px tall. 1 Blender unit = 1 tile = 1 m. Materials are emission only, lit in hard bands by a fixed top-left light (N.L through a constant ramp), rendered in Cycles with 1 sample and no anti-aliasing, so each material gives a few exact colors.
- `calibrate.py`: renders one small scene (fence corner, 2 x 2 restroom, a person, two Dimetrodon stand-ins turned to the two 3/4 facings, a ball) at several K values onto the park ground, adds a tinted outline, and writes a contact sheet beside today's placeholder fence and person. Prints the fence front and person heights so they can be checked.
- `creature.py`: builds an animal from its species file. Skin-modifier chains (the body from tail tip to snout with a half width and half height at each point, each limb its own chain mirrored to both sides), a sail slab, eyes. Blender renders labels, never colors: each material writes a ramp step (or ink), the light band and the depth (16-bit, Raw), and `finish()` looks every pixel up in the species' ramps, then draws the silhouette and depth-step outlines in ink. Regions are rules: belly where the surface faces down, sail stripes by position along the back, mouth line and eyes in ink.
- `animals/<species>.json`: anatomy as numbers (metres, x forward, z up) plus the ramps and ink.
- `turnaround.py`: the review sheet: side, front, top, both 3/4 facings, and game size at two turn angles plus 1x.

```bash
/tmp/bvenv/bin/python tools/blender/turnaround.py tools/blender/animals/dimetrodon.json out/
```
