# HANDOFF.md: current state

A snapshot of where the project stands, for whoever picks it up next. Edit it in place to keep it true; it is not a change log (use `git log` and the PRs for history). Protocol: `AGENTS.md` section 0.

**Last updated:** 2026-11-08, based on `main` = `b76ed7f` (merge of PR #32); the published Artifact is version 60, published from this commit.
Legend: ✅ confirmed (checked in the repo or by running it) · ❓ unverified / assumption.

## Status
- ✅ Phase: between plan phases 3 (core systems) and 4 (content ramp). Core sim is in: grid and tools, fence-made exhibits with biomes, 8 fence types with tiers/wear/power/escapes, animals with needs/behavior/wellbeing/death, crates (crate, uncrate, move by keeper haul, sell), keepers/mechanics/guards on a job board, guests with stands/benches/bins/litter/rating, sandbox mode, all three labs (research tracks, Time Travel expeditions for genome, Genetics cloning), versioned saves.
- ✅ 10 species in `SPECIES`; 9 have sprites (all but Arthropleura): Dimetrodon, Cotylorhynchus, T. rex, Anomalocaris, Mosasaurus, Sacabambaspis, Dunkleosteus, Lystrosaurus, Tiktaalik. The roster in `docs/plan.md` is 100 species.
- ✅ All five guest amenities have user-approved sprites in `art/buildings/`: restroom, snack stand, gift stand, bench and trash bin. Other buildings and people remain placeholder art (blocks, flat colors).
- ✅ Not built yet: see `docs/architecture.md` "Not built yet" (plants/browsing, power plants, custodians, staff morale/break rooms, attractions and museum, Guests research track, vandalism, weather, mixed-pen predation, more animations, real art).

## Most recent state of `main`
Recent merges set the context for what's fresh and most likely to need follow-up (details in the PRs, not here):
- ✅ PR #32: approved restroom sprite (`art/buildings/restroom.png`; buildings can now carry a `sprite` path).
- ✅ PR #31: T. rex walks at 2x (`speed: 2` in its `data.js` entry; per-species `speed` multiplier read in `animals.js`). Shipped without a GIF review at the user's say-so.
- ✅ PR #30: transport fixes. Deep-water hauls no longer retry forever; gate handoffs account for the animal and its tile (dangerous, swimmer, unwalkable); unloading rechecks movement, biome, exhibit and crate occupancy, and an invalid destination leaves a crate with the keeper and a reason in the bell. Covered by 3 regression tests.
- ✅ PR #28: crates sit on the map; sell animals; move animals with a crate ghost and keeper hauling.
- ✅ PR #27: destroy/sell crates with in-row confirm; sea animals only in sea exhibits; swimmers can't escape.
- ✅ PRs #24-#26: Sacabambaspis and Dunkleosteus added; Lystrosaurus and Tiktaalik sprites.

## In progress / outstanding
- Guest artwork on `codex/guest-building-art`, prepared for review into `main`: snack and gift stands, bench and trash bin match the approved restroom. The user approved all four concepts before commit. Images were trimmed and resized with nearest-neighbor sampling; footprints, guest behavior, prices, upkeep and saves are unchanged. All 45 simulation checks and the existing browser smoke test passed before and after the changes. Smoke ran in installed Chrome with local-file request interception (bundled browser absent; loopback networking restricted), without changing repository tests or dependencies. Visually inspected zooms 2 and 4; canvas instrumentation verified all five sprites at zooms 1–4 and all four new placement/move ghosts, with no browser errors or missing assets. Independent art review found no material issues. Not merged or published.
- ✅ `claude/gifted-meitner-bae3jt` (an alternate Cotylorhynchus walk, never wired in) is dead per the user; don't revive it. If it still exists on the remote, it's waiting to be deleted.
- ✅ Many other `claude/*` and `ccr-*` branches exist on the remote; all are fully merged into `main` (stale, safe to ignore).
- ✅ The HANDOFF/AGENTS setup was merged in PR #29.


## Known issues
- ✅ No TODO/FIXME markers in `src/`, `tests/` or `tools/`.
- ✅ Environment gaps for non-Claude assistants: `tests/smoke.js` needs Playwright + Chromium, which aren't in `package.json`; PixelLab scripts (`tools/sprites/animate.py`, `skelwalk.py`) only authenticate inside Claude Code's cloud proxy. See `AGENTS.md` section 3.
- ✅ The published Artifact can only be updated from a Claude Code session (`CLAUDE.md` "Publish").
- ✅ The published Artifact matches `main` at `b76ed7f` (version 60, 2026-11-08). Republish after each merge.

## Next steps (as documented)
No prioritized task list is written down. What the docs point to:
- Phase 4 content ramp: more species from the roster in `docs/plan.md` (rigged in v1 first: the first 23 except Arthropleura, plus Estemmenosuchus and Dunkleosteus), each a `data.js` entry plus sprites; Arthropleura still has no sprite.
- Plants (about 15 iconic ones, tagged), which unlock browsing and the Cover habitat meter.
- Systems still marked "coming back" in `docs/plan.md`: staff morale and break rooms, attractions (museum + flat rides), custodians, power plants.
- ❓ The user decides priorities; confirm before starting anything large.

## Build and test status
- ✅ 2026-11-08 at `b76ed7f`: `npm test` passes: `tests/sim.test.js` 45/45, smoke test `ok` (day 4, ~180 guests (varies run to run: the page seeds new parks from `Date.now()`), 0 escapes, 0 starving). Run in Claude Code's cloud container (Node 22, preinstalled Playwright/Chromium).
- No build step; nothing to compile.

## Before you modify code
- Read `docs/architecture.md` for the system you're touching; it's long but accurate and kept current.
- Add new save fields with defaults in `migrate()`; `SAVE_VERSION` is 2.
- Animations need the user's yes on GIFs before they're committed.
- Don't merge or publish without the user's say-so.
