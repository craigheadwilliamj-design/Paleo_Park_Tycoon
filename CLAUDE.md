# Paleo-Park Tycoon v2

The ground-up restart (design in `docs/plan.md` and `docs/systems.md`). Browser game, ES modules, no build step, canvas renderer. v1 (the `craigheadwilliamj-design/genesis-game` repo) stays the playable reference: read it for how something worked, never copy its code wholesale.

## Keep context small
- This file is an index. How the code fits together is in `docs/architecture.md`; read it before changing a system. The design is `docs/plan.md` (decisions, art pipeline, phases, roster) and `docs/systems.md` (how the systems work).
- When you change a system, update `docs/architecture.md` (or `docs/plan.md` / `docs/systems.md` if the design changed), not this file.

## Layout
- `src/sim/`: the game itself. Plain data and functions, **no DOM**, runs in node. `world.js` owns the state, the commands and the tick.
- `src/view/`: drawing (`renderer.js`), the display size curve (`display.js`), HUD, tools and panels (`ui.js`). Reads the sim; changes it only through world commands.
- `src/main.js`: boot, frame loop, autosave.
- `tests/sim.test.js` (node, no browser) and `tests/smoke.js` (headless Chromium on index.html).

## Rules
- The sim never touches the DOM, and the view never writes to `state`: every change is a `World` command that returns `""` or a short reason it was refused.
- Anything that must survive a reload lives in `world.state`. New fields get a default in `migrate()` (save.js); bump `SAVE_VERSION` when an old save needs converting.
- Content and tuning are data: species, fences, biomes and buildings in `src/sim/data.js`, numbers in `src/sim/config.js`. Systems read fields; they never check a species or fence id.
- Systems talk through the job board (staff) and the bus (`notify`, `breakFence`, `tilesChanged`, `dayEnded`), not by reaching into each other.
- Randomness goes through `rng.js` (seeded from `state.seed`), never `Math.random`, so runs replay and tests stay stable.
- Escape user text with `esc()` (ui.js) before it goes into HTML.
- Panels follow the v1 rules: names, numbers, meters, status chips, buttons. Status says what's wrong in a few words ("No keeper gate."), never how to fix it.
- Art is placeholder blocks until the golden assets exist (see `docs/plan.md`). Draw in the renderer only.
- Every animation goes to the user as a GIF (`tools/sprites/gifs.py`, sent with SendUserFile) and waits for their yes before it is committed, pushed or published.

## Test
`npm test` (or `node --test tests/sim.test.js` and `node tests/smoke.js`). `node tests/smoke.js --shot out.png` saves a screenshot. Run both after any change.

## Publish
Preview artifact: https://claude.ai/artifact/VXqpuMkhig187z6FshjGn3 (separate from v1's). Publish with `file_path: index.html`, that `url`, and `files` listing each changed `src/...` file at its own path. `index.html` has no doctype or head (the publish adds them). The viewer has no `alert`/`confirm`/`prompt`, so confirmations live in the page.
