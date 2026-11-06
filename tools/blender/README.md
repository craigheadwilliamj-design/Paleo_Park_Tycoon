# Blender tools

Headless Blender through its Python module (`bpy`, from PyPI). No Blender app or window needed.

Cloud sessions in the `paleo_park_tycoon` environment get it from the setup script, at `/opt/bvenv`. Elsewhere:

```bash
python3 -m venv /opt/bvenv && /opt/bvenv/bin/pip install bpy==5.2.3 pillow numpy
/opt/bvenv/bin/python tools/blender/calibrate.py out/
```

`bpy` needs the Python version it was built for (bpy 5.2 wants 3.13) and is about 400 MB, so keep the venv outside the repo.

- `camera.py`: the park camera and the toon material. An orthographic camera tilted `atan(K)` from straight down, with `pixel_aspect_x = 1/cos` so a ground tile stays 16 x 16 px. An upright face of `h` m draws `16*h*K` px tall. 1 Blender unit = 1 tile = 1 m. Materials are emission only, lit in hard bands by a fixed top-left light (N.L through a constant ramp), rendered in Cycles with 1 sample and no anti-aliasing, so each material gives a few exact colors.
- `calibrate.py`: renders one small scene (fence corner, 2 x 2 restroom, a person, two Dimetrodon stand-ins turned to the two 3/4 facings, a ball) at several K values onto the park ground, adds a tinted outline, and writes a contact sheet beside today's placeholder fence and person. Prints the fence front and person heights so they can be checked.
- `animal.py`: builds an animal from its drawn side view (a v1 rig in `art/v1/`). The trunk is lofted column by column from the drawing, so the side silhouette is the drawing's; width per region, sail thickness and leg sprawl come from the species file. The drawing's pixels become labels (ramp + step, or ink) projected onto the model from the side; Blender renders labels, light bands and depth (16-bit, Raw), and `finish()` looks every pixel up in the species' ramps, then draws the silhouette and depth-step outlines in ink. No color is ever made by Blender.
- `animals/<species>.json`: the species file: the rig, the ramps (every drawing color must map to a ramp step or ink), width ratios by drawing column, sail thickness, legs.
- `turnaround.py`: the review sheet: drawing vs model side view with a silhouette diff, front, top, both 3/4 facings, and game size at a few turn angles.

```bash
/opt/bvenv/bin/python tools/blender/turnaround.py tools/blender/animals/dimetrodon.json out/
```
- `walk.py`: the walk cycle. A pose per frame bends the model (the UVs keep the rest-pose projection, so the drawing moves with the body instead of sliding): the spine swings in a wave (hips and shoulders opposite, growing toward the tail), diagonal limb pairs step together, feet plant and slide back, then lift and swing; elbows and knees are solved each frame and bent outward to stay sprawled. Numbers live under `"walk"` in the species file. Facings: east and west in profile, north and south turned 40 degrees toward east or west (`FACINGS`). Writes the frame sheet and GIF previews; with `--export art/animals` also the game sprites (`<species>-walk-<facing>.png` strips and `-stand-<facing>.png`, 64 px frames) and prints the `sprite` entry for data.js.

```bash
/opt/bvenv/bin/python tools/blender/walk.py tools/blender/animals/dimetrodon.json out/ --export art/animals
```
- `idle.py`: standing and resting, from the same model and camera as the walk. `idle` loops a breath (the back and sail rise), a slow tail sway and a look to one side; `lie` goes from standing to lying (the game plays it backwards to get up); `rest` loops a slow breath while lying: each column of the trunk drops until its underside is on the floor (the chin a little higher), feet splay, the tail curls and the head turns aside. Numbers under `"idle"` and `"rest"` in the species file. With `--export art/animals` writes `<species>-idle|lie|rest-<facing>.png` and prints the `idle`/`lie`/`rest` entries for data.js and boxes to merge with the walk's. `--facings east,south` renders only those (for quick looks).

```bash
/opt/bvenv/bin/python tools/blender/idle.py tools/blender/animals/dimetrodon.json out/ --export art/animals
```
