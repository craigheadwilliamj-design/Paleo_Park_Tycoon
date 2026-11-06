# Paleo-Park Tycoon v2.0 plan

A ground-up restart: same game, smaller and cleaner. v1 stays live as the playable reference; nothing is ported wholesale, only the art, the tuning numbers and the design notes.

## Decided
- **Platform:** browser, published as a claude.ai Artifact like v1. Canvas renderer (no SVG). Godot only if the game outgrows the browser later.
- **Code:** sim split from drawing. The sim is plain data that ticks on its own and can be tested headless; the renderer only reads it. One module per system, talking through events, not reaching into each other. One versioned save format from day one.
- **Grid:** 16 px tiles. A tile is a game unit, not a set number of meters. People are about 2 tiles tall (24 to 32 px).
- **Size curve:** sprite size grows slower than real size. Small animals are drawn bigger and big ones smaller, but the order never flips (a small animal never looks bigger than a bigger one). The smallest have a floor size; swarm animals (trilobites, early fish) show as a cluster. The sim still uses real size for diet, danger and who eats whom; space needs are balance numbers in tiles.
- **Fences:** a whole tile thick (Let's Build a Zoo style), painted like paths, auto-connecting, with a top and a short front face. Whatever is fully enclosed is an exhibit (flood fill). One fence tile between two pens is a wall for both. Gates and viewing windows are fence tiles with a flag. Security is in tiers (1 to 5, electric 6) against each species' danger (1 to 5); see `systems.md`.
- **Fence types (8):** six for land (hedge, log palisade, stone, concrete, electric (tier 6 while powered, the strongest), glass wall; every fence is see-through) and two that hold sea water: the aquarium wall (shallow sea, small sea animals, research at 2 stars) and the lagoon wall (deep sea, big marine animals, deep research). Themes are looks, not new types. The first animals you can get are land animals.
- **Exhibits:** you don't place an exhibit, you get one by closing a fence, then you pick its biome. Ground isn't paintable: each biome has one varied fill. The exhibit tracks its tiles, water, plants, rocks and gates. Each species scores it per need (biome, space, water, plants, cover, group size) as meters.
- **Water is the only paintable ground:** shallow and deep tiles painted inside a pen. One water tile set, recolored to each biome's water ramp. Species need a share of water (0%, 50%, 100% deep...). A tile can block walkers and let swimmers through, which also makes moats possible. A glass wall beside deep water is the aquarium. No separate vivarium or aquarium system.
- **Plants:** about 15 to 20 iconic ones covering the whole Phanerozoic, added in over time. Each plant is tagged with food group, browse height, cover and period. Animals prefer tags, not individual plants. Planting from the right period gives a bonus; anything is allowed.
- **Roster:** whole Phanerozoic, small at launch, growing for good. A species is one data file plus its art; behavior comes from shared systems switched on by data, never species-specific code.
- **Weather comes back, purely cosmetic:** rain, snow and fog to look at, park-wide, with the odds following the season (snow in winter, more rain in spring). It lives in the renderer and changes nothing in the sim. If it stays easy, the turf and plants also shift color by season, by the same ramp swap as the water.
- **No busywork systems:** if a system would end up automated to make it bearable, it's automated from the start. Keep only the decisions that are fun (where, how many, what kind). Food is one hop: sheds, a nightly delivery, keepers filling feeders, chutes for dangerous pens.
- **Art style:** keep the pixel look. Tinted outlines (dark edge in the material's color), flat fills, light from the top left. The style is set by approved golden assets, not by a written description.
- **Mixed pens:** different species can share an exhibit, and each scores the pen for itself. A carnivore in a pen with prey it can eat hunts it (see `systems.md`).
- **Breeding and aging:** after v2.0. At launch animals come only from cloning and starter purchases.

## Scope against v1
- **Ported (reworked, never copied):** Time Travel Lab (timeline, sites, drones, scouting, expeditions), Genetics Lab (clone at 100% genome), research (now tracks), the pools roster (now lagoons), the museum (now one attraction), security guards, staff morale and break rooms, flat rides, weather (cosmetic only). Assets: rigs, palette, ground and water sprites, timeline maps, site data, tuning numbers.
- **New in v2:** tile-thick fences where closing one makes the exhibit, water as the only paintable ground, security tiers against danger with slow wear and warned escapes, the job board with zones, one-hop food, the display size curve, tagged plants with a period bonus, mixed pens with predation.
- **Cut from v2.0:** medicine (vets, illness, genome therapy; after v2.0), breeding and aging (after v2.0), hotels, the tram, tour rides, themes (later, as looks only), clone accuracy, failed clones and genetic disorders, any supply chain (food orders, stock screens, shop restocking), greenhouses and flora production, ground paint, separate vivarium and aquarium systems, museum modules, research points and project queues.
- **Parked ideas** (not decided): star goals or scenarios, feeding shows and keeper talks, guest groups, a photo mode.

## Art pipeline
| What | How |
|---|---|
| Animals, plants, rocks | Gemini draws it (with the golden Dimetrodon as a reference image), Paleo Snapper v2 fixes the grid and moves the colors onto our palette, you clean it up, Claude cuts it into rig parts |
| Paths, fences, water | Claude generates them by rule. Dual-grid autotiling, so about 5 tiles per terrain. Water is drawn once and recolored per biome |
| Biome ground fills | One base tile and a few detail clumps per biome, generated by rule. Park ground (outside exhibits) is its own neutral fill: mowed turf, duller than any biome, with faint stripes and worn patches. Check it beside every biome fill at game zoom and in grayscale |
| Buildings | Front view from Gemini, other views from Blender or shape generators (to be tested) |
| UI, fonts, audio | Bought or free packs (Sonniss GDC bundle, a pixel font). Each pack goes into `vendor/` untouched with its license, then a conversion script restyles it |
| Animation | v1 rig JSON (`tools/rigger/*/*-rig.json` in the v1 repo (`craigheadwilliamj-design/genesis-game`)) converted to the new format. Pivots scale up; only the part pictures get redrawn at the new size |

Every asset passes an automatic check (palette, scale, transparency, parts with pivots), then a fresh judge agent compares it with the golden assets, and only then goes to you on a contact sheet for yes or no.

## Phases

### 0. Foundations
- v2 lives in its own repo (this one); v1 stays in `genesis-game` as the reference.
- Scaffold: module layout, canvas renderer stub, sim tick, event bus, save format, headless smoke test.
- Publish a hello-world to a new artifact to prove multi-file modules work there.
- Write a v2 `CLAUDE.md` index and a `docs/` folder from the start.
- **Done when:** an empty grid you can pan and zoom is live at its own link, and the smoke test runs.

### 1. Style lock
- Build the palette and ramps from v1 (`tools/genesis_style.py`, `sprites/ground/` and `sprites/water/` in the v1 repo).
- Paleo Snapper v2: new canvas sizes from the size curve, a palette and outline pass after the grid snap.
- Golden assets: Dimetrodon at the new size (rigged), one plant, one fence set, one biome fill, the water set, one guest base.
- The judge rubric, written for this style.
- **Done when:** you have approved all the golden assets.

### 2. Vertical slice
- Paint water and paths; set an exhibit's biome. One fence type with autotiling. Enclosure detection makes the exhibit.
- One species (Dimetrodon) that wanders, gets hungry and naps.
- One keeper who feeds it through the gate.
- Guests who arrive, walk the paths, look at the exhibit and pay. Money.
- Save and load.
- **Done when:** a 10-minute loop is playable at its own link, built from golden or placeholder art, and the smoke test passes.

### 3. Core systems
- The species data format and suitability scoring. Plant tags.
- All 8 fence types, security tiers, wear, escapes, and power for electric.
- Shallow and deep water, swimmers and amphibians.
- Guest basics (food, drink, restrooms), custodians, the first buildings (testing the building pipeline).
- The display size curve applied to the whole roster.
- **Done when:** 3 species with different needs (land, amphibious, marine) live in one park and the scores make sense.

### 4. Content ramp
- Run the species pipeline in batches: Gemini, Snapper, cleanup, rig cut, data file, check, judge, your approval.
- The roster is in the Roster section below, in build order.
- Plants: about 15 iconic ones (Lepidodendron, Calamites, Glossopteris, Dicroidium, cycads, ginkgo, Araucaria, tree ferns, Williamsonia, Magnolia, Metasequoia, horsetails, ferns, Archaeopteris, Prototaxites, plus the reef pieces).
- Time Travel Lab and Genetics Lab from v1 (100% genome to clone; flora unlocks plants and paleoflora), see `systems.md`.
- **Done when:** the roster and plants are in, and unlocking feels like a progression.

### 5. Polish and launch
- Audio, a UI pass, How to play, balance, performance at the largest target park size.
- Publish v2.0. v1 keeps its own link.

## Roster
77 species, in build order. The first 24 except Arthropleura, plus Estemmenosuchus and Dunkleosteus, are rigged in v1 (25 in all).

1. Arthropleura
2. Cotylorhynchus
3. Tyrannosaurus rex
4. Anomalocaris
5. Mosasaurus
6. Lystrosaurus
7. Dimetrodon
8. Platyhystrix
9. Scutosaurus
10. Inostrancevia
11. Diictodon
12. Moschops
13. Prionosuchus
14. Tiktaalik
15. Coelophysis
16. Plateosaurus
17. Carcharodontosaurus
18. Spinosaurus
19. Dryosaurus
20. Compsognathus
21. Allosaurus
22. Chalicotherium
23. Ichthyostega
24. Sacabambaspis
25. Stegosaurus
26. Megalodon
27. Basilosaurus
28. Great Auk
29. Eryops
30. Estemmenosuchus
31. Dunkleosteus
32. Rhizodus
33. Opabinia
34. Hypsilophodon
35. Oviraptor
36. Parasaurolophus
37. Ankylosaurus
38. Carnotaurus
39. Gigantopithecus
40. Macrauchenia
41. Megaloceros
42. Desmatosuchus
43. Megatherium
44. Dire Wolf
45. Erythrosuchus
46. Ornitholestes
47. Arctodus
48. Postosuchus
49. Paraceratherium
50. Scelidosaurus
51. Kentrosaurus
52. Apatosaurus
53. Argentinosaurus
54. Diplodocus
55. Therizinosaurus
56. Jaekelopterus
57. Nothosaurus
58. Ichthyosaurus
59. Elasmosaurus
60. Ceratosaurus
61. Doedicurus
62. Psittacosaurus
63. Gallimimus
64. Pachycephalosaurus
65. Iguanodon
66. Trilobite
67. Velociraptor
68. Triceratops
69. Ambulocetus
70. Andrewsarchus
71. Aepycamelus
72. Kelenken
73. Dodo
74. Smilodon
75. Elasmotherium
76. Woolly Mammoth
77. Cameroceras

## Open questions
- Medicine (vets, illness, genome therapy) and breeding and aging are on the back burner until after v2.0.
- Coming back: security, staff morale with break rooms, attractions (the museum plus flat rides). Themes later. Not for now: hotels, the tram, tour rides.
- Do hills, cliffs and moats count as terrain height, or is the ground flat?
- The exact size-curve numbers and the largest target park size.
- Whether buildings come from Blender or shape generators (test on the restroom).
- Getting Gemini outputs in: you in the Gemini app for now, or an API key for batches later.
