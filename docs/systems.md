# Paleo-Park Tycoon v2.0: how the game works

A draft for discussion. It covers the systems and how they talk to each other; `plan.md` has the build order and the art pipeline.

## The big loop
The player paints tiles. Closed fences become exhibits, and the player sets each exhibit's biome. Animals read their exhibit and their needs, and when something runs low (food, water, a broken fence) it becomes a job on the job board. Staff take jobs. Guests walk the paths, watch the animals they can see, spend money and leave a rating. The rating brings more guests, and money pays for more animals.

```
player commands ──> grid ──> exhibits (derived) ──> animals (needs, behavior)
                                    │                     │
                                    v                     v
                              viewing spots          job board ──> staff
                                    │
                                    v
                guests (needs, wants) ──> money, rating ──> more guests
```
Escapes cut across all of it: an animal outside its exhibit scares guests and posts a recapture job.

## 1. The grid
- The map is W x H tiles of 16 px. Each tile holds a few layers, each stored as a flat typed array (fast to read, small to save):
  - **water:** none, shallow or deep. The only ground the player paints.
  - **structure:** nothing, path, staff path, a fence (type, condition, flags for gate, window and chute) or part of a building.
  - **object:** a plant, a rock, a shelter or a prop, with its variant.
- The map is flat for v2.0. There is no ground paint: outside the exhibits is **park ground**, a neutral texture of its own that belongs to no biome (mowed turf: a duller green than any biome, faint mowed stripes, packed-earth wear near paths and building fronts), and inside, the ground comes from the exhibit's biome.
- Every edit goes through a command (`paint`, `place`, `bulldoze`) and fires `tilesChanged(area)`. Nothing else writes to the grid.
- **Derived layers** are rebuilt only for the area that changed, never saved:
  - **regions:** flood fill of the tiles that aren't fence. A region that doesn't reach the map edge or an open gate is an exhibit.
  - **who can stand where**, one mask per kind of mover: guests (paths), staff (paths, staff paths, and inside exhibits through a keeper gate), walkers (land inside their region), swimmers (water), amphibians (both).
  - **path network:** connected path areas, used by guests and staff for routing.

## 2. Exhibits
- An exhibit is a region record, rebuilt when its tiles change. It keeps its id across edits by matching the most overlap with its old tiles, so its name and animals stay put.
- It has one **biome**, set by the player after it closes (bare dirt until then). Merging two exhibits keeps the bigger one's biome; splitting one keeps it on both halves. Changing it later costs money and is instant.
- It tallies: tile count, shallow and deep water, plant tags (food by group and height, cover), shelters, keeper gates, feeders, and **viewing spots** (path tiles next to any of its fence tiles). Every fence is see-through; a pen with no path beside it can't be watched.
- It never decides anything. Species read it.

## 3. Species and animals
- **A species file:** real size (for display, diet and danger), biomes it likes (preferred first, then acceptable), water wants (%, depth), space per animal (in tiles), group size min and max, social style (solo, herd, pack), diet (plant tags and browse height, or prey size), temperament (shy, calm, aggressive), danger (1 to 5: the fence security it needs), movement kind, active hours, period, price and appeal.
- **Habitat score:** the species compares its wants with the exhibit and gets one meter per need, plus an overall score. That's the panel. Biome: full marks if preferred, part if acceptable, poor otherwise.
- **An animal:** needs (hunger, thirst, rest, social, comfort from the habitat score) that drain over time, plus health and stress.
- **Behavior is a utility picker:** every few seconds each animal scores its possible actions by how much they'd fix its most urgent need, and does the best one: eat (a feeder, or browse a plant at its height), drink, rest (cover or a shelter), stay near its group, wander, show off. The same list serves every species; data switches extras on (herds flee together, packs move together, carnivores pace the fence).
- **Happiness** comes from the needs and the habitat score. It drives appeal to guests, health, breeding later, and stress.
- **Mixed pens:** any species can share an exhibit. Each species scores the pen for itself, counting all the animals in it toward space, and only its own kind toward group size. A carnivore whose prey size covers another animal in the pen hunts it: hunting is an eat action in the utility picker, open when the hunter is hungry, and the prey dies. Prey flee from a hunter nearby. The exhibit panel warns before it happens ("Prey for Allosaurus."). Herbivores and carnivores that can't eat each other live together with no penalty.
- **Breeding and aging** come after v2.0.
- **Fence security:** every fence type has a security tier (hedge 1, log palisade 2, glass 3, stone 4, concrete 5 (very expensive to build, wears slower than any other fence, needs no power), and electric 6, the only fence above 5; the aquarium and lagoon walls hold what they're built for). A pen's security is its weakest tile. Security at or above an animal's danger holds it, full stop. Danger runs from 1 (small and harmless, like Arthropleura) through 2 (Lystrosaurus, Dryosaurus), 3 (Coelophysis, Moschops), 4 (Allosaurus, Inostrancevia) to 5 (Tyrannosaurus, Spinosaurus). A fence one tier above an animal's danger is a buffer against wear. Electric at 6 can't be broken while it has power, so it's the only buffer for a danger 5 animal.
- **Wear:** each fence tile has a condition that drops slowly over time and faster where animals push on it. Good and Worn keep the full tier; Worn posts a repair job for mechanics. Only Damaged, after a long stretch of neglect, drops the tile one tier. Mechanics put it back to Good.
- **Electric:** cheaper to build than concrete (wire and poles), but it costs power every day and needs regular mechanic visits. Tier 6 with power. Without power it's a 2, or a 1 when Worn. A Damaged electric tile loses its power, so an electric fence never breaks while kept up, but a neglected one will let its animals out.
- **Escapes are never instant:** an animal whose danger is above its pen's security tests the weakest tile, and the bell warns ("Tyrannosaurus is testing the fence.") while it does. Only after hours of testing does the tile break; the region opens and an animal that walks out is escaped. A power cut drops electric fences to 2 (1 if Worn) at once, which starts testing but still gives time to react.

## 4. The job board and staff
- Systems never order staff around. They **post jobs**: "feed exhibit 3", "refill water", "repair fence at (40,12)", "pick up trash at (8,30)", "recapture animal 12". Each job has a role, a place, a priority and how long it takes.
- **Staff claim jobs:** an idle staff member of the matching role takes the job with the best priority for its distance, walks there, does it, and frees it. If they can't reach it, it goes back on the board with a reason ("No keeper gate.").
- **Zones:** each staff member can be given a painted work zone and then only takes jobs inside it; unzoned staff take anything. A heatmap view shows coverage per role.
- **Roles:** keeper (food, water, cleaning pens), mechanic (fences, power), custodian (trash, restrooms), security guard (escapes, and rowdy guests who vandalize). The slice needs only keepers.
- Keepers enter pens only through keeper gates, and feed carnivore pens through a feeding chute (see Food).
- **Morale:** staff tire as they work and rest in a **break room**; a far-off or missing break room wears morale down, and low morale makes them slower and eventually makes them quit.
- **Security:** unhappy, rowdy guests vandalize props and buildings; guards patrol their zone, deter it and catch vandals, and they're the ones who recapture escaped animals.

## 5. Food
One hop, no supply chain. The only food decisions are where the sheds go and how many keepers you have; everything else runs itself.
- **Food sheds** are buildings you place. Each one holds all four food types; themes change only its look. A delivery fills them every night, sized to what the park ate the day before, and paid that night. No orders, no stock screens.
- **Feeders** sit inside a pen. Keepers fill them from the nearest shed that has the food, so a pen far from any shed gets slower refills.
- **Food types (4):** greens, meat, fish, bugs. A species eats one or two.
- **Upgrades, not new chains:** paleoflora from the Botany Lab (a happiness bonus for herbivores of that period) and whole carcasses for big carnivores (costs more, counts as enrichment, guests watch).
- **Browsing:** herbivores also eat the plants in their pen when the tags and heights match. Plants get eaten down and grow back slowly, so a well-planted pen needs fewer keeper trips.
- **Feeding chute:** a fence tile with a flag, like a gate or a window. A keeper drops food through it from outside. Pens with dangerous animals are fed only through a chute; keepers walk in only through a keeper gate, and only into safe pens.
- **Shortages** happen on their own: out of money, a shed out of reach, too few keepers, or a new animal the delivery hasn't caught up with yet.

## 6. Guests
- **Arrivals:** guests come in at the entrance, in small groups. How many depends on rating, ticket price and the roster's appeal.
- **Needs:** hunger, thirst, bladder, energy, fun. Money in pocket.
- **Wants:** a short list of species they came to see, weighted by appeal (the headline animals).
- **Behavior is the same utility picker:** a pressing need sends them to the nearest service. Otherwise they head to the most appealing viewing spot they haven't used yet, and they leave when they're tired, broke or done.
- **Watching:** a guest at a viewing spot gains fun from the exhibit as a whole: its animals' appeal and how happy they are. Where the animals stand doesn't matter.
- **Money:** ticket at the gate, spending at shops. Shops just work: always stocked, with a cost per sale. No restocking. Litter becomes custodian jobs.
- **Rating:** satisfaction on the way out feeds the park rating, and the rating feeds arrivals.
- **Fear:** an escaped animal nearby makes guests run for the exit and drops the rating.
- **Attractions:** buildings with a queue, a capacity, a ride time, a ticket price you set, an appeal that feeds guest fun, upkeep, and breakdowns that post mechanic jobs. Flat rides only for v2.0 (fossil dig pit, dino carousel, 4D theater, a drop ride...), unlocked on the Guests research track. Tour rides that pass the pens come later.
- **Museum:** an attraction, one building with no modules. Its appeal grows with the events (Cambrian Explosion, Great Dying, K-Pg Impact...) recorded by Time Travel Lab expeditions to their sites.
- **Thoughts:** short lines for the guest panel ("This T. rex is amazing.", "Too expensive.").

## 7. Getting animals and plants
The Time Travel Lab and the Genetics Lab work as in v1 (`DISCOVERY_PLAN.md` in the v1 repo (`craigheadwilliamj-design/genesis-game`)), with the changes below. The site data (`tools/timeline/` in v1) carries over; a site shows only when one of its animals is in the roster.
- **Time Travel Lab:** a timeline of real fossil sites. Drones scout a site to discover its animals, then fly expeditions to it to collect genome. Expeditions for an animal are locked until the park reaches its stars.
- **Genetics Lab:** an animal can be cloned once its genome is 100%. No accuracy, no failed clones, no genetic disorders. A finished clone arrives in a crate.
- **Flora (the Botany Lab, folded into Genetics):** flora expeditions fill a period's flora genome. A full one unlocks that period's plants for planting and its paleoflora as a premium food in the sheds. No greenhouses or production.
- **Research Lab:** research comes in **tracks**, each a straight line of unlocks (built: Exhibits, Time Travel, Park Ops; Guests waits for attractions to unlock). You hire scientists and put each one on a track; a track goes as fast as the scientists on it. Each step down a track takes longer than the one before, so early unlocks come quickly and deep ones take a while. A few deep steps also need a star rating before they can start. Scientists can be moved at any time, and a track keeps its progress. No points, no project queue.
- **Lagoons** are a research unlock (Exhibits track, star-gated): the lagoon wall fence and deep sea water, for the big marine animals (Dunkleosteus, Mosasaurus and later the rest of v1's pool roster in `POOLS_PLAN.md` in v1). Sea is an exhibit biome: water in a sea exhibit is sea water (its own ramp). Small sea animals (Anomalocaris, trilobites, Sacabambaspis) live in shallow sea pens walled with the **aquarium wall**, a glass wall that holds shallow sea water and gives full viewing; it's an early Exhibits research step gated at 2 stars, well before lagoons. A viewing gallery (Guests track) and feeding shows can follow.
- **Starter plants are modern**, available from the start, so the first pens aren't bare.
- **Medicine** is on the back burner: no vet, illness or genome therapy in v2.0.

## 8. Shared machinery
- **The sim tick:** a fixed step in game time. Faster speeds run more steps per frame. The day clock runs on the same tick, with an end-of-day pass for the books and the day report.
- **Events:** `tilesChanged`, `exhibitChanged`, `animalEscaped`, `jobPosted`, `guestLeft`, `dayEnded`. Systems listen to these instead of calling each other.
- **Pathfinding:** A* over the right mask for each kind of mover, cached and thrown away on `tilesChanged`. Guests and staff route on the path network; animals wander inside their region with short hops.
- **"Who's near":** a coarse bucket grid (say 8 x 8 tiles), so checks like "guests near an escaped animal" stay cheap.
- **Commands:** the UI never edits the sim directly. It sends commands (paint, place, hire, set price), and the smoke test drives the game with the same commands.
- **Saving:** the tile layers, the entity lists (animals, staff, guests, jobs) and the clock, with a version number. Derived data is rebuilt on load.
- **Drawing:** the renderer only reads the sim. Each biome's ground is a base tile plus clumps of detail (dirt, tufts, pebbles, litter) picked from the tile's coordinates, so it looks varied but never changes between loads. Water is one tile set (shallow, deep, edges) recolored per biome by swapping its color ramp onto that biome's water ramp, done once at load (water outside any exhibit uses a park ramp that matches the park ground); it's never a tint, so colors stay on the palette. Paths and fences are autotiled from the tile layers; then objects, buildings, animals and people are drawn sorted by their bottom edge.

## Open questions
- Research: the tracks and what's on each.
- Which plants are starters: living fossils (horsetails, ferns, cycads, ginkgo, Araucaria, Metasequoia) count as modern, or only plants that look modern?
- Which species count as dangerous (chute only).
- Mixed pens: do species that clash (two carnivores, a big animal and a small one) lose comfort, or only predation counts?
- Terrain height: flat for now, hills or cliffs decided later.
- Game mode: sandbox only, or star goals or scenarios too?
- Guests in groups or one by one?
- How long a day is, and how fast the needs drain.
