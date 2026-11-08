# AGENTS.md: working on Paleo-Park Tycoon v2 ("Genesis")

Shared instructions for any AI coding assistant (or human) working in this repo. Assistant-specific notes live in their own files (`CLAUDE.md` for Claude Code); where they add tool-specific details they must not contradict this file. The current state of work is in `HANDOFF.md`.

## 0. Session protocol (read this first)

**Start of a session**
1. Read this file.
2. Read `HANDOFF.md`: what's done, what's in flight, what's broken.
3. Read the docs for the area you'll touch: `docs/architecture.md` (how the code fits together; read before changing any system), `docs/systems.md` (how the game is meant to work), `docs/plan.md` (decisions, art pipeline, phases, roster).
4. Check the repo state: `git status`, `git branch`, `git log --oneline -10`, `git fetch origin && git log --oneline HEAD..origin/main`. Make sure you're on a fresh branch off up-to-date `main` (or the branch you were told to use) and that nobody's unmerged work is about to be stomped.
5. Run `npm test` before changing anything, so you know the baseline.
6. Identify the task and the existing systems it touches. Find the world command, data entry or config number that already does something similar before writing new code.

**End of a session**
1. Run `npm test` again; record the result.
2. Update `docs/architecture.md` (or `plan.md` / `systems.md` if the design changed) for any system you changed.
3. Update `HANDOFF.md` so it describes the project **as it is now**: status, work in progress, known problems, test results, open branches/PRs, and anything the next assistant must know before touching the code. It is a snapshot, not a diary: don't append a log of what you did (git history and PR descriptions are the record). Edit entries in place; before removing one, check whether it's still true, and keep what still is. Your summary of changes goes in the commit message and PR description.
4. Commit the docs with the code they describe, push the branch, open a PR into `main` (unless told otherwise). Don't merge or publish unless the user says so.

## 1. What the game is

A browser park-builder: a prehistoric zoo spanning the whole Phanerozoic (Cambrian to Quaternary). It's v2, a ground-up restart of v1 (the `craigheadwilliamj-design/genesis-game` repo, still live and playable). v1 is the reference for how something looked or worked; read it, never copy its code wholesale. Only v1's art, tuning numbers and design notes carry over.

**Core loop:** paint tiles (paths, fences, water) → a closed fence becomes an exhibit → set its biome → buy or clone animals → animals' needs post jobs → staff (keepers, mechanics, guards) do them → guests walk the paths, watch exhibits, spend and rate → rating brings more guests, money buys more. Escapes cut across all of it. Science (research tracks, Time Travel Lab expeditions for genome, Genetics Lab cloning) unlocks fences and new species.

**Design philosophy** (full list in `docs/plan.md` "Decided"):
- No busywork. If a system would need automating to be bearable, it's automated from the start. Keep only fun decisions (where, how many, what kind). Food is one hop: sheds, a nightly delivery, keepers fill feeders.
- Content is data. A species is one data entry plus its art; behavior comes from shared systems switched on by fields, never species-specific code.
- You don't place exhibits, you close fences. Water is the only paintable ground. Fences are a whole tile thick, with security tiers 1-6 vs species danger 1-5.
- Escapes are never instant: animals test a weak fence for hours, with a warning, before it breaks.
- Pixel art look, top-down with a tilt (K = 0.75), 16 px tiles, a display size curve (`src/view/display.js`) so small animals draw bigger and big ones smaller without the order flipping.

## 2. Repository layout

```
index.html            page shell + CSS; no doctype/head on purpose (the Artifact publish adds them). Loads src/main.js as a module.
package.json          "type": "module", no dependencies; one script: npm test
src/main.js           boot, load/save (localStorage key "ppt2-save"), frame loop, camera, autosave every 20 s and on pagehide; exposes window.__ppt for tests
src/sim/              the game. Plain data + functions, NO DOM, runs in node
  world.js            World class: owns state, all commands, the tick (advance/hourly/night), newPark()
  config.js           every tuning number (SAVE_VERSION, map size, prices, wear, animal/staff/guest/science tuning)
  data.js             content: FENCES, BIOMES, SPECIES (+ sprite specs), BUILDINGS, TRACKS, SITES, PERIODS, EPOCHS
  grid.js             typed-array tile layers, walkable()
  exhibits.js         flood fill -> regions -> exhibits, ids kept across edits, tally, fence tiers
  habitat.js          habitat score, fitProblem (sea vs land)
  animals.js          needs, ACTIONS utility table, wellbeing, crates
  staff.js            job board: planJobs, claiming, feed/repair/catch/haul jobs
  guests.js           arrivals, needs, stands, viewing, rating, litter, panic
  paths.js / movers.js  routing (4-way for people, 8-way for animals) and step movement/facing
  science.js          research tracks, drones/scouting/expeditions, cloning, reports
  money.js            afford()/charge() (sandbox-aware)
  events.js           the Bus
  rng.js              seeded RNG (mulberry32 on state.seed)
  save.js             serialize/deserialize (grid as base64), migrate()
src/view/             drawing and UI. Reads the sim; changes it only through World commands
  renderer.js         canvas drawing of ground, water, fences, buildings, walkers, sprites and animation state
  display.js          TILE size and the size curve displayPx(meters)
  ui.js               HUD, tools, side panels (exhibit/animal), status bar; esc()
  menu.js             build menu (TOOL_KIND, categories, trays)
  labs.js             Research / Time Travel / Genetics full-size panels
tests/sim.test.js     node:test unit tests of the sim (no browser)
tests/smoke.js        headless Chromium: serves the repo, builds a park via world commands, drives the UI, checks for errors
art/animals/          finished sprite strips the game loads: <name>-<strip>-<east|west>.png
art/source/<name>/    source frames and keyframes per species (inputs to tools/sprites)
art/v1/               v1 rigs (JSON) the sprite tools pose
art/timeline/         260x130 period maps for the Time Travel Lab
tools/sprites/        Python art pipeline (Pillow; some scripts call the PixelLab API)
tools/blender/        headless Blender route (on hold; see its README)
docs/                 architecture.md, systems.md, plan.md
```

How systems talk: the `World` owns `state` and a `Bus`. Systems post work to the **job board** (`state.jobs`, staff claim it) and talk over the bus (`notify`, `breakFence`, `tilesChanged`, `dayEnded`, `escaped`, `animalDied`, ...) rather than calling into each other. Derived data (`world.derived`: exhibit map, regions, tallies) is rebuilt by `world.changed()` and never saved. Details: `docs/architecture.md`.

## 3. Development environment

- **Runtime:** a modern browser for the game; Node 22+ for tests (verified with Node 22.23). No build step, no bundler, no npm dependencies.
- **Run the game locally:** ES modules don't load from `file://`, so serve the repo root over HTTP and open `index.html`, e.g.
  ```bash
  python3 -m http.server 8000
  ```
  then open http://localhost:8000/index.html. The save is in localStorage; the HUD has a New Park button and a Sandbox toggle (unlimited money, instant labs) for testing.
- **Tests:** `npm test` runs `node --test tests/sim.test.js && node tests/smoke.js`.
  - `tests/sim.test.js` needs only Node.
  - `tests/smoke.js` needs Playwright and a Chromium it can launch. It does `require("playwright")` but Playwright is **not** in `package.json` (deliberately: no dependencies). Claude Code's cloud container has it preinstalled globally. Elsewhere, make it resolvable without committing it (e.g. install it globally or in a scratch location on `NODE_PATH`) and install a Chromium for it. Do not add it to `package.json` or commit `node_modules/` without the user's say-so.
  - `node tests/smoke.js --shot out.png` saves a screenshot of the test park (don't commit it).
- **Art tools:** Python 3.13 + Pillow (`tools/sprites/*.py`). `animate.py` and `skelwalk.py` call `https://api.pixellab.ai/v2` with a dummy `Bearer x` header: in Claude Code's cloud environment a proxy injects the real key. In any other environment those two scripts will fail auth unless you supply a PixelLab key yourself (don't commit a key). `strips.py`, `rigpose.py`, `rigclips.py` and `gifs.py` are local-only. Blender tools need a separate `bpy` venv (`tools/blender/README.md`).

## 4. Implemented systems (short version; `docs/architecture.md` has the detail)

- **Grid & tools:** 96x64 tiles, layers for water, structure (path/fence/building), fence type, condition, flags (gate, chute), building id, exhibit id. Paint paths/water/fences by dragging a box; bulldoze anything for a 25% refund with a confirm when it would open a pen; move buildings free; ghost previews with refusal reasons.
- **Exhibits & habitats:** closing a fence makes an exhibit (flood fill); ids survive merges/splits; biome per exhibit; tally of water, gates, chutes, feeders, props, viewing spots, security. Habitat score = biome, space, water, group. Sea species only in `sea` biomes and vice versa.
- **Fences & escapes:** 8 types (hedge, palisade, glass, stone, concrete, electric, aquarium, lagoon), tiers vs danger, daily wear, Worn/Damaged, power for electric, testing → break → escape; swimmers can't escape.
- **Animals:** 10 species in `SPECIES` (Arthropleura, Lystrosaurus, Dimetrodon, Cotylorhynchus, Anomalocaris, Sacabambaspis, Dunkleosteus, Tiktaalik, T. rex, Mosasaurus); the full 100-species roster is planned in `docs/plan.md`. Needs (hunger, thirst, enrichment), a utility-picker `ACTIONS` table (eat, drink, rest, play, test fence, maul, wander), stress, health, death, happiness. Crates: crate/uncrate/move (keeper haul job)/sell.
- **Staff:** keepers (feed via gates or chutes, haul crates), mechanics (repair), guards (dart escapees). Hire/fire, wages nightly.
- **Guests & economy:** arrivals by rating, ticket and draw; snack, restroom, bench, bin, gift stand; litter; panic near loose dangerous animals; star rating. Money via ticket and stands, costs via building, wages, nightly food delivery, lab upkeep. Sandbox mode bypasses money.
- **Science / genome collection:** Research Lab (tracks of steps that unlock fences and effects), Time Travel Lab (timeline of real fossil sites, drones, scouting to discover species, expeditions to collect genome %), Genetics Lab (clone at 100% genome into a crate). Only `starter` species can be bought outright.
- **Save:** versioned JSON in localStorage, `migrate()` upgrades old saves.
- **Not built yet:** see the "Not built yet" section of `docs/architecture.md` (plants, power plants, custodians, morale, attractions, weather, most sprites, real art...).

## 5. Art and animation

- Placeholder blocks everywhere except animals that have sprites. Draw only in `src/view/renderer.js`.
- A species gets a sprite by adding a `sprite` field in `data.js` (format documented in the comment above `SPECIES`): strip name, frame size, frame count, anchor, `cycle` (tiles per walk cycle), optional `scale`, and optional `idle`/`lie`/`rest`/`eat`/`drink`/`attack`/`swim` strips with timing. The renderer loads `art/animals/<name>-<strip>-<east|west>.png`; west is east mirrored. Missing strips fall back to the standing frame, missing sprites to a block.
- Pipeline (`docs/plan.md` "Art pipeline" and the per-species notes in `docs/architecture.md` "Drawing"): the v1 drawing/rig is the sprite; PixelLab animates between keyframes (`animate.py`, `skelwalk.py`), or `rigpose.py`/`rigclips.py` pose the v1 rig RotSprite-style; `strips.py` snaps colors and builds the strips; `gifs.py` makes review GIFs.
- **Approval rule:** every new or changed animation is shown to the user as GIFs (`tools/sprites/gifs.py`) and waits for their explicit yes before it's committed, pushed or published. Style is set by approved golden assets, not by description.

## 6. Coding conventions and architectural rules

- The sim never touches the DOM; the view never writes to `state`. Every change goes through a `World` command that returns `""` on success or a short reason it was refused ("No keeper gate."). Pair a command with a read-only `xxxProblem()` check when the view needs to preview a refusal.
- Anything that must survive a reload lives in `world.state`. New fields get a default in `migrate()` (`src/sim/save.js`); bump `SAVE_VERSION` (config.js) when an old save needs converting, and add a test.
- Content and tuning are data: species, fences, biomes, buildings, tracks, sites in `data.js`; numbers in `config.js`. Systems read fields; they never check a species or fence id.
- Systems talk through the job board and the bus, not by reaching into each other.
- All randomness through `rng.js` (seeded from `state.seed`), never `Math.random`.
- Escape user text with `esc()` (ui.js) before it goes into HTML.
- Panels: names, numbers, meters, status chips, buttons. Status says what's wrong in a few words, never how to fix it.
- The published viewer has no `alert`/`confirm`/`prompt`: confirmations live in the page (in-row "Are you sure?" Yes/No).
- Style of the code: small ES modules, plain objects, short functions, a one-line header comment per file saying what it does. Comments and docs in plain, short sentences. Match the surrounding code rather than introducing new patterns, frameworks or TypeScript.

## 7. Testing and validation

- Run `npm test` after every change. Both parts must pass. Baseline is in `HANDOFF.md`.
- New sim behavior gets a test in `tests/sim.test.js` (build a small park with world commands, `advance()` time, assert on state). UI flows that can break in the browser get a check in `tests/smoke.js`.
- The smoke test drives the page through `window.__ppt` (world, ui, cam, save); keep that hook working.
- For visual changes, take a smoke screenshot (`--shot`) and look at it.
- Save compatibility: load an old save through `migrate()` in a test when you add fields.

## 8. GitHub workflow

- Repo: `craigheadwilliamj-design/paleo_park_tycoon`. `main` is the released line; nothing is pushed straight to it.
- One branch per task, off current `origin/main`. Claude Code sessions use `claude/<name>` branches; other assistants should use their own prefix (e.g. `codex/<name>`) so it's clear who owns what. Never push to someone else's branch.
- Commits: one clear subject line saying what changed in game terms ("Crates on the map, sell animals, ..."), body if needed. Commit docs updates with the code.
- Open a PR into `main`. The user reviews and merges (merge commits, "Merge pull request #N ..."). Don't merge your own PR unless the user explicitly asks.
- If your branch's PR was already merged, start follow-up work fresh from the new `main`; don't stack on merged history.
- **Publishing (unchanged, Claude-only):** after a merge, the game is published from the latest `main` to a claude.ai Artifact by a Claude Code session (details in `CLAUDE.md` "Publish"). Other assistants don't publish; they get changes merged to `main` and a Claude session publishes. Don't change `index.html`'s shell, the artifact link or the publish setup.

## 9. Constraints and things to avoid

- Don't add dependencies, a build step, a framework or a bundler. Don't restructure folders.
- Don't add species-specific or fence-specific branches in systems: add a data field.
- Don't use `Math.random`, `Date.now()` in the sim (seeding a new park in `main.js` is the exception), or the DOM in `src/sim/`.
- Don't put a doctype/head in `index.html`.
- Don't commit generated scratch output (screenshots, GIFs, PixelLab seed runs you didn't pick, `node_modules/`).
- Don't commit art the user hasn't approved.
- Don't change game mechanics or tuning as a side effect of another task; mention it and ask.
- Cut from v2.0 (don't build): medicine, breeding/aging, hotels, the tram, tour rides, themes, clone accuracy/failed clones, supply chains, ground paint, separate vivarium/aquarium systems, research points/queues. See `docs/plan.md` "Scope against v1".
- Known limits: the map is flat; power is a single park-wide switch; the Blender model route is on hold; PixelLab access exists only where a key is provided.
