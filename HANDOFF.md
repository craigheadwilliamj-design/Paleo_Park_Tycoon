# HANDOFF.md: current state

A snapshot of where the project stands, for whoever picks it up next. Edit it in place to keep it true; it is not a change log (use `git log` and the PRs for history). Protocol: `AGENTS.md` section 0.

**Last updated:** 2026-11-08, at `main` = `e04ab67` (merge of PR #28).
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
- ✅ No open pull requests (checked 2026-11-08).
- ✅ One remote branch has a commit not in `main`: `claude/gifted-meitner-bae3jt` ("Cotylorhynchus drawing, skeleton and skeleton-posed walk strips", 2026-11-07, not wired into `data.js`). ❓ Probably superseded: `main` already has a Cotylorhynchus sprite built a different way. Ask the user before reviving or deleting it.
- ✅ Many other `claude/*` and `ccr-*` branches exist on the remote; all are fully merged into `main` (stale, safe to ignore).
- This HANDOFF/AGENTS setup: on branch `claude/laughing-albattani-wageix`, PR pending review.

## Known issues
- ✅ No TODO/FIXME markers in `src/`, `tests/` or `tools/`.
- ❓ No known bugs are recorded anywhere in the repo. Bugs reported by the user in past chat sessions may not be written down; ask if unsure.
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
- No build step; nothing to compile.

## Before you modify code
- Read `docs/architecture.md` for the system you're touching; it's long but accurate and kept current.
- Add new save fields with defaults in `migrate()`; `SAVE_VERSION` is 2.
- Animations need the user's yes on GIFs before they're committed.
- Don't merge or publish without the user's say-so.
