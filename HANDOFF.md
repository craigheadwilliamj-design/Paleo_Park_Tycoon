# HANDOFF.md: current state

A snapshot of where the project stands, for whoever picks it up next. Edit it in place to keep it true; it is not a change log (use `git log` and the PRs for history). Protocol: `AGENTS.md` section 0.

**Last updated:** 2026-11-08, based on `main` = `d363fdb` (merge of PR #38), plus distinct kiosk art on `codex/distinct-kiosk-colors`.
Legend: ✅ confirmed (checked in the repo or by running it) · ❓ unverified / assumption.

## Status
- ✅ Phase: between plan phases 3 (core systems) and 4 (content ramp). Core sim is in: grid and tools, fence-made exhibits with biomes, 8 fence types with tiers/wear/power/escapes, animals with needs/behavior/wellbeing/death, crates (crate, uncrate, move by keeper haul, sell), keepers/mechanics/guards on a job board, guests with stands/benches/bins/litter/rating, sandbox mode, all three labs (research tracks, Time Travel expeditions for genome, Genetics cloning), versioned saves.
- ✅ 10 species in `SPECIES`; 9 have sprites (all but Arthropleura): Dimetrodon, Cotylorhynchus, T. rex, Anomalocaris, Mosasaurus, Sacabambaspis, Dunkleosteus, Lystrosaurus, Tiktaalik. The roster in `docs/plan.md` is 100 species.
- ✅ All five guest amenities have user-approved sprites in `art/buildings/`: restroom, snack stand, gift stand, bench and trash bin. Other buildings and people remain placeholder art (blocks, flat colors).
- ✅ Not built yet: see `docs/architecture.md` "Not built yet" (plants/browsing, power plants, custodians, staff morale/break rooms, attractions and museum, Guests research track, vandalism, weather, mixed-pen predation, more animations, real art).

## Building fronts, turning and staff paths (PR #35)
- ✅ Buildings turn in quarter turns (`b.rot`, 0 south / 1 west / 2 north / 3 east) and are used only from their front: guests from a guest path in front, staff from a standable tile in front. Feeders and logs have `anySide`. Controls: R or right click (Shift for back) or the status bar's Turn button while placing (the ghost auto-faces a path until turned, its front tinted yellow), R or a right press while carrying with Move, or a tap or right click with Move turns it in place; right drag still pans elsewhere. `frontProblem` shows "No path at the front." / "Front is blocked." without refusing.
- ✅ Staff Path (`S_STAFF` = 4, Paths tray, $10/tile): staff walk it, guests never do, not a viewing spot. It gives staff no speed bonus: staff still walk open grass too, so it's guest separation and look only. ❓ The user may want staff to prefer or move faster on paths; not decided.
- ✅ `SAVE_VERSION` is 3: `migrate()` gives old buildings the turn that already faces a path (`autoRot`).
- ✅ All guest amenities have user-approved front/back/side views. East is a horizontal mirror of the west image. Kiosks now have separate colored rear and side views: blue restroom with privacy windows/vents, terracotta snack stand with exhaust, and plum gift stand with display windows. Front wall colors match; the restroom front is unchanged; the bench has separate rear and side art. The bin is now a plain green trashcan: a front with an opening and one plain image reused for sides and back, as requested. Other buildings still use placeholders.

## Most recent state of `main`
Recent merges set the context for what's fresh and most likely to need follow-up (details in the PRs, not here):
- ✅ PR #38: approved guest back/side sprites, mirrored east views, and the simplified green bin with one plain image shared by sides and back.
- ✅ PR #37: labs use a stable tile anchor when turned, so full cycles and reverse turns no longer drift. Covered by a regression test including save/reload midway.
- ✅ PR #35: buildings turn and are used only from their front; Staff Path tool; save version 3 (details in the section above).
- ✅ PR #34: snack stand, gift stand, bench and trash bin sprites (approved), matching the restroom.
- ✅ PR #32: approved restroom sprite (`art/buildings/restroom.png`; buildings can now carry a `sprite` path).
- ✅ PR #31: T. rex walks at 2x (`speed: 2` in its `data.js` entry; per-species `speed` multiplier read in `animals.js`). Shipped without a GIF review at the user's say-so.
- ✅ PR #30: transport fixes. Deep-water hauls no longer retry forever; gate handoffs account for the animal and its tile (dangerous, swimmer, unwalkable); unloading rechecks movement, biome, exhibit and crate occupancy, and an invalid destination leaves a crate with the keeper and a reason in the bell. Covered by 3 regression tests.
- ✅ PR #28: crates sit on the map; sell animals; move animals with a crate ghost and keeper hauling.
- ✅ PR #27: destroy/sell crates with in-row confirm; sea animals only in sea exhibits; swimmers can't escape.
- ✅ PRs #24-#26: Sacabambaspis and Dunkleosteus added; Lystrosaurus and Tiktaalik sprites.

## In progress / outstanding
- Distinct kiosk colors/art on `codex/distinct-kiosk-colors`, prepared for review into `main`. Eight approved images replace the shared kiosk shell: snack/gift fronts plus three individual back/side pairs. Color identity carries over all faces, including fallback drawing colors. All 51 simulation tests and the expanded browser smoke passed before and after; normal-zoom screenshot and independent art review found no material issues. Smoke used installed Chrome with local-file interception for this environment; tests and dependencies are unchanged. No gameplay, footprints or save changes. Not merged or published.
- ✅ `claude/gifted-meitner-bae3jt` (an alternate Cotylorhynchus walk, never wired in) is dead per the user; don't revive it. If it still exists on the remote, it's waiting to be deleted.
- ✅ Many other `claude/*` and `ccr-*` branches exist on the remote; all are fully merged into `main` (stale, safe to ignore).
- ✅ The HANDOFF/AGENTS setup was merged in PR #29.


## Known issues
- ✅ No TODO/FIXME markers in `src/`, `tests/` or `tools/`.
- ✅ Environment gaps for non-Claude assistants: `tests/smoke.js` needs Playwright + Chromium, which aren't in `package.json`; PixelLab scripts (`tools/sprites/animate.py`, `skelwalk.py`) only authenticate inside Claude Code's cloud proxy. See `AGENTS.md` section 3.
- ✅ The published Artifact can only be updated from a Claude Code session (`CLAUDE.md` "Publish").
- The last documented published Artifact is version 62 (from PR #35). Publication of PR #37 or the directional art branch has not been verified here.

## Next steps (as documented)
No prioritized task list is written down. What the docs point to:
- Phase 4 content ramp: more species from the roster in `docs/plan.md` (rigged in v1 first: the first 23 except Arthropleura, plus Estemmenosuchus and Dunkleosteus), each a `data.js` entry plus sprites; Arthropleura still has no sprite.
- Plants (about 15 iconic ones, tagged), which unlock browsing and the Cover habitat meter.
- Systems still marked "coming back" in `docs/plan.md`: staff morale and break rooms, attractions (museum + flat rides), custodians, power plants.
- ❓ The user decides priorities; confirm before starting anything large.

## Build and test status
- ✅ 2026-11-08 at `0feade2`: `npm test` passes: `tests/sim.test.js` 50/50, smoke `ok` (now also checks turning by tap, R, Shift+R, right click, a right press while carrying and the Turn button, that right drag still pans, and painting a staff path).
- ✅ 2026-11-08 at `b76ed7f`: `npm test` passes: `tests/sim.test.js` 45/45, smoke test `ok` (day 4, ~180 guests (varies run to run: the page seeds new parks from `Date.now()`), 0 escapes, 0 starving). Run in Claude Code's cloud container (Node 22, preinstalled Playwright/Chromium).
- No build step; nothing to compile.

## Before you modify code
- Read `docs/architecture.md` for the system you're touching; it's long but accurate and kept current.
- Add new save fields with defaults in `migrate()`; `SAVE_VERSION` is 3.
- A building's footprint is `bldSize(def, b.rot)` / `bldTiles`, never `def.w` x `def.h`; who uses it from where is `frontTiles` (grid.js).
- Animations need the user's yes on GIFs before they're committed.
- Don't merge or publish without the user's say-so.
