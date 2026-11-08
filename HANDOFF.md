# HANDOFF.md: current state

A snapshot of where the project stands, for whoever picks it up next. Edit it in place to keep it true; it is not a change log (use `git log` and the PRs for history). Protocol: `AGENTS.md` section 0.

**Last updated:** 2026-11-08, based on `main` = `6829de2` (merge of PR #29); transport fixes on `codex/fix-animal-transport`.
Legend: ✅ confirmed (checked in the repo or by running it) · ❓ unverified / assumption.

## Status
- ✅ Phase: between plan phases 3 (core systems) and 4 (content ramp). Core sim is in: grid and tools, fence-made exhibits with biomes, 8 fence types with tiers/wear/power/escapes, animals with needs/behavior/wellbeing/death, crates (crate, uncrate, move by keeper haul, sell), keepers/mechanics/guards on a job board, guests with stands/benches/bins/litter/rating, sandbox mode, all three labs (research tracks, Time Travel expeditions for genome, Genetics cloning), versioned saves.
- ✅ 10 species in `SPECIES`; 9 have sprites (all but Arthropleura): Dimetrodon, Cotylorhynchus, T. rex, Anomalocaris, Mosasaurus, Sacabambaspis, Dunkleosteus, Lystrosaurus, Tiktaalik. The roster in `docs/plan.md` is 100 species.
- ✅ Everything else is placeholder art (blocks, flat colors).
- ✅ Not built yet: see `docs/architecture.md` "Not built yet" (plants/browsing, power plants, custodians, staff morale/break rooms, attractions and museum, Guests research track, vandalism, weather, mixed-pen predation, more animations, real art).

## Most recent state of `main`
Recent merges set the context for what's fresh and most likely to need follow-up (details in the PRs, not here):
- ✅ PR #28: crates sit on the map; sell animals; move animals with a crate ghost and keeper hauling.
- ✅ PR #27: destroy/sell crates with in-row confirm; sea animals only in sea exhibits; swimmers can't escape.
- ✅ PRs #24-#26: Sacabambaspis and Dunkleosteus added; Lystrosaurus and Tiktaalik sprites.

## In progress / outstanding
- Transport fixes on `codex/fix-animal-transport`, submitted as a draft PR into `main`. Run the full tests in the normal development environment before merge.
- ✅ `claude/gifted-meitner-bae3jt` (an alternate Cotylorhynchus walk, never wired in) is dead per the user; don't revive it. If it still exists on the remote, it's waiting to be deleted.
- ✅ Many other `claude/*` and `ccr-*` branches exist on the remote; all are fully merged into `main` (stale, safe to ignore).
- ✅ The HANDOFF/AGENTS setup was merged in PR #29.

- ✅ T. rex walks at 2x (`speed: 2` in its `data.js` entry; per-species `speed` multiplier read in `animals.js`). Shipped without a GIF review at the user's say-so.

## Known issues
- ✅ No TODO/FIXME markers in `src/`, `tests/` or `tools/`.
- ✅ Transport bugs reproduced on `main`: deep-water hauls retry indefinitely, and the first dangerous animal delivered into an empty pen leaves its keeper inside. Fixed on `codex/fix-animal-transport`: gate handoffs account for the animal and its tile; unloading rechecks movement, biome, exhibit and crate occupancy. Invalid destinations leave a crate with the keeper and a reason in the bell. Awaiting review and merge.
- ✅ Environment gaps for non-Claude assistants: `tests/smoke.js` needs Playwright + Chromium, which aren't in `package.json`; PixelLab scripts (`tools/sprites/animate.py`, `skelwalk.py`) only authenticate inside Claude Code's cloud proxy. See `AGENTS.md` section 3.
- ✅ The published Artifact can only be updated from a Claude Code session (`CLAUDE.md` "Publish").
- ❓ Whether the published Artifact currently matches `main` is not checked here.

## Next steps (as documented)
No prioritized task list is written down. What the docs point to:
- Phase 4 content ramp: more species from the roster in `docs/plan.md` (rigged in v1 first: the first 23 except Arthropleura, plus Estemmenosuchus and Dunkleosteus), each a `data.js` entry plus sprites; Arthropleura still has no sprite.
- Plants (about 15 iconic ones, tagged), which unlock browsing and the Cover habitat meter.
- Systems still marked "coming back" in `docs/plan.md`: staff morale and break rooms, attractions (museum + flat rides), custodians, power plants.
- ❓ The user decides priorities; confirm before starting anything large.

## Build and test status
- ✅ 2026-11-08 at `e04ab67`: `npm test` passes: `tests/sim.test.js` 42/42, smoke test `ok` (day 4, ~180 guests (varies run to run: the page seeds new parks from `Date.now()`), 0 escapes, 0 starving). Run in Claude Code's cloud container (Node 22.23, preinstalled Playwright/Chromium).
- ✅ Transport branch: 44/45 simulation tests pass through the bundled Node test runner, including 3 new regression tests (deep-water delivery and pickup for safe/dangerous swimmers, keeper safety in an empty pen, and biome/water/building changes during unloading). All 3 new tests fail against the original staff code and pass after the fix.
- Environment limits for this run: the local review copy omits artwork, so the existing timeline-map file-presence test fails; `npm` is not on PATH and Playwright is unavailable, so the full `npm test` / browser smoke test still needs to run in the normal development environment before merge. No dependencies or artwork were changed.
- No build step; nothing to compile.

## Before you modify code
- Read `docs/architecture.md` for the system you're touching; it's long but accurate and kept current.
- Add new save fields with defaults in `migrate()`; `SAVE_VERSION` is 2.
- Animations need the user's yes on GIFs before they're committed.
- Don't merge or publish without the user's say-so.
