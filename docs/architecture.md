# How v2's code fits together

## State and derived data
- `world.state` is the whole save: clock, money, rating, ticket, the grid, `exhibits`, `openPens`, `buildings`, `animals`, `staff`, `guests`, `jobs`, `testing` (fence tile -> hours tested), `power`, `bell`, `books` (today and last day).
- `world.derived` is rebuilt from the state and never saved: `exOf` (tile -> exhibit id, 0 outside), `regions`, and `ex` (exhibit id -> its tally).
- `world.changed()` rebuilds derived data after any grid change; `hourly()` rebuilds it too, because fences wear and get tested.

## The grid (grid.js)
Typed-array layers, one entry a tile: `water` (none, shallow, deep), `struct` (none, path, fence, building), `fence` (type index + 1), `cond` (0 to 100), `flags` (gate, chute), `bld` (building id), `ex` (the exhibit the tile last belonged to). `walkable(g, i, who)` says who may stand where: guests on paths only; staff anywhere but buildings, deep water and fences (gates excepted); `land`, `swim` and `both` animals by water.

## Bulldozing (world.js)
One tool takes everything away and gives back `REFUND` (25%) of what it cost (`PRICE` in config.js, fence and building prices in data.js), booked as `books.sold`. `bulldozePlan(tiles)` is read only and says what would go: fence and path tiles, water, and any building with a tile in the box (whole); a single tile on a gate or chute takes just that and leaves the wall. The entrance (`fixed`) stays. `plan.ask` is set when it needs a yes first: `opensPens` floods a copy of the grid without those fences and names any exhibit whose animals would end up in a region reaching the map edge, or a building has `ask`. The view marks `planTiles(plan)` in red and shows the money back while dragging. After any paint or bulldoze, `replan` sends guests, animals and staff (`reroute`) whose route crosses a changed tile they can no longer stand on to pick again.

## Exhibits (exhibits.js)
- `findRegions` flood-fills the tiles that aren't fence. A region that doesn't touch the map edge is an exhibit.
- `rebuildExhibits` gives each one an id by voting with the grid's `ex` layer: biggest regions vote first, so a merge keeps the bigger pen's exhibit; a split half without its own id copies the biome of the exhibit it came from. An exhibit whose pen is opened waits in `state.openPens` and comes back when the gap closes.
- `tally` counts land, shallow and deep tiles, fences, gates, chutes, feeders and viewing spots (path tiles next to the pen's fence: every fence is see-through), and works out `security` (the weakest fence tile's tier) and `weakest`.
- `tileTier`: a fence type's tier, one lower when Damaged (Worn keeps it). Electric: 6 with power, 2 without, 1 without and Worn; Damaged electric has lost its power.

## Habitat (habitat.js)
`habitatScore(state, species, tally, count)` gives biome (preferred 1, acceptable 0.7, else 0.2), space (tiles per animal), water (share of the pen, sea water only counts behind aquarium or lagoon walls), group (inside min and max), and their average.

## Animals (animals.js)
Needs (hunger, thirst, rest) drain every step. When an action runs out, `choose` scores the options and starts the best one it can route to: test the fence (when its danger is over the pen's security), eat at a feeder, drink, rest, wander. `testFence` wears the weakest tile and, after `WEAR.breakHours`, emits `breakFence`; the world clears the tile and `settleAnimals` marks anyone now outside an exhibit as escaped. Happiness is half habitat, half needs, updated hourly.

## Staff and the job board (staff.js)
`planJobs` (hourly) posts feed jobs for pens whose feeders are under half full, and repair jobs for Worn or Damaged fence tiles. Each job has a key so it's posted once. Idle staff claim the highest-priority job of their role they can route to. Feeding: fetch from the nearest stocked shed, then deliver at a feeder through a gate, or, for a pen holding danger 3 or more, from outside beside a chute (staff never walk into a dangerous pen). A job that can't be done gets a `why` ("No feeding chute.") and waits an hour.
Guards take catch jobs, posted for every escaped animal: they follow it, dart it (`STAFF.dartMin`), and the world puts it back in its exhibit if that pen is closed again, or into a crate (`a.crated`, off the map) to be released into any exhibit from its panel.

## Guests (guests.js)
Arrivals depend on rating, ticket price and how much the viewable exhibits draw. A guest pays the ticket, then: hungry -> a snack stand; otherwise the most appealing exhibit not seen yet (watch a few minutes, gain fun from its draw); out of time or exhibits -> back to the entrance, where they rate the visit and leave. A guest within `STAFF.panicTiles` of a loose animal of danger 3 or more runs for the exit and rates the visit half a star.

## Time (world.js)
`advance(minutes)` runs fixed steps of `STEP_MIN`. Every hour: exhibits re-tallied, happiness, job planning. At `DAY_MIN` the night runs: wages, the nightly food delivery to each shed (yesterday's eating plus a margin, paid now), fence wear, the books.

## Saving (save.js)
JSON, grid layers as base64. `migrate()` fills in missing fields for older saves. `main.js` autosaves to localStorage every 20 seconds and on page hide.

## Drawing (view/)
`renderer.js` draws ground (park turf or the exhibit's biome, with stable per-tile detail), water from the biome's ramp, paths, fences (top and front face, darker when worn), buildings, then walkers sorted by their feet. `display.js` holds the size curve (`displayPx(meters)`), the only place real size turns into pixels. `ui.js` builds the HUD once (Hire buttons sit by the staff count) and updates numbers, handles tools (drag a box: paths and water fill it, fences outline it, bulldoze clears it; why a click was refused, the money back and a yes/cancel for a bulldoze that asks sit in the status bar under the map), and renders the exhibit and animal panels.

## Build menu (view/menu.js)
`TOOL_KIND` names every tool and how it takes the pointer. `BuildMenu` fills `#build`: a Bulldoze button and four big category buttons (Buildings, Landscaping, Exhibits, Paths) down the left. A category opens its tray along the bottom (menu A); an entry holding a list (Fence Types, Water, each building group) opens it as a bar above (menu B), one at a time. Everything is built from data: fences from `FENCES`, buildings by their `menu` group (guest, staff, exhibits) with `tip` as the tooltip, prices from data.js and `PRICE`. Tapping the tool that's on goes back to Select; Esc drops the tool, then closes the list, then the tray, then the panel. Icons are drawn placeholders until the menu art lands.

## Not built yet
Power plants (power is one switch), plants and browsing, research, the Time Travel and Genetics Labs, vandalism, morale and break rooms, attractions, weather, real art.
