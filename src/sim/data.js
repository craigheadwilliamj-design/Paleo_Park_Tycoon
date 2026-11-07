// Game content. Species, fences, biomes and buildings are plain data: systems read these, never special-case an id.

// Fence types. tier: security against an animal's danger (electric is the only 6).
// wear: multiplier on WEAR.perDay. holds: what water the wall keeps (land fences keep fresh water painted inside).
// tech: the research step that unlocks it (none: available from the start).
export const FENCES = {
  hedge:    { name: "Hedge",        tier: 1, price: 20,  wear: 1.4, color: "#4f7a3a" },
  palisade: { name: "Log Palisade", tier: 2, price: 40,  wear: 1.2, color: "#7a5532" },
  glass:    { name: "Glass Wall",   tier: 3, price: 120, wear: 1.0, tech: "glass", color: "#9cc9cf" },
  stone:    { name: "Stone Wall",   tier: 4, price: 150, wear: 0.8, tech: "stone", color: "#8b8a82" },
  concrete: { name: "Concrete",     tier: 5, price: 400, wear: 0.4, tech: "concrete", color: "#b5b1a6" },
  electric: { name: "Electric",     tier: 6, price: 160, wear: 1.0, tech: "electric", color: "#d9b84a", power: true },
  aquarium: { name: "Aquarium Wall", tier: 3, price: 220, wear: 0.8, tech: "aquarium", color: "#6fb1c9", holds: "shallow" },
  lagoon:   { name: "Lagoon Wall",  tier: 5, price: 500, wear: 0.6, tech: "lagoon", color: "#3c7f9c", holds: "deep" },
};
export const FENCE_IDS = Object.keys(FENCES);

// Exhibit biomes. ground and water are placeholder colors until the art lands (sea uses its own water ramp).
export const BIOMES = {
  none:      { name: "Bare Dirt",  ground: "#8a7354", water: ["#5d8fa8", "#3f6e8a"] },
  grassland: { name: "Grassland",  ground: "#a3a04a", water: ["#5f99a6", "#3d7486"] },
  temperate: { name: "Temperate",  ground: "#5f8a3e", water: ["#4f8aa0", "#33677f"] },
  wetland:   { name: "Wetland",    ground: "#5e6b3a", water: ["#6b7a4a", "#4b5a34"] },
  desert:    { name: "Desert",     ground: "#d8c08a", water: ["#7fc0bf", "#4f9a9f"] },
  tropical:  { name: "Tropical",   ground: "#3f7a3a", water: ["#3fb3b0", "#21848c"] },
  boreal:    { name: "Boreal",     ground: "#4f5e44", water: ["#4b6470", "#2f4652"] },
  tundra:    { name: "Tundra",     ground: "#c9cfc8", water: ["#7b97a8", "#56748a"] },
  sea:       { name: "Sea",        ground: "#d6c89a", water: ["#3aa6c4", "#1f6f9c"], sea: true },
};
export const PARK_GROUND = "#7d8c58";   // mowed turf outside every exhibit
export const PARK_WATER = ["#5c94a6", "#3d7186"];

// Species. len: real length in meters (diet, danger and display size). danger 1 to 5 (fence tier needed).
// biomes: preferred first; the rest are acceptable. water: share of the pen it wants as water, and which kind.
// space: tiles per animal. group: [min, max]. food: units a day of foodType. appeal: guest draw.
// moves: "land", "swim" or "both". sea: lives in sea water (needs a sea exhibit). cruise: keeps swimming while it wanders instead of stopping at each spot.
// size: class 1 tiny, 2 small, 3 medium, 4 large, 5 huge (bored big animals attack fences, small ones get sick; later prey and fights).
// active: "day" or "night", when it is awake (it lies down more the rest of the time). drain: per-need multipliers on ANIMAL.fullDays (config.js).
// stars: park rating its Time Travel Lab expeditions need. starter: partner parks sell it, so it can be bought without the labs.
// sprite: game sprites from tools/sprites/strips.py (art/animals/<name>-walk|stand-<facing>.png; facings east and west, plus optionally
// the four diagonals northeast..southwest and north and south, or north_r, north_l, south_r, south_l: up or down the map with the head
// leaning right or left): frame size (px, square, or [w, h]), frames in the walk, anchor (the feet in a frame), box (each facing's drawn
// bounds, for the selection outline; the facings it has: without the others it walks every way in profile), cycle (tiles walked per walk cycle),
// scale (optional: drawn this much smaller than its pixels, for a drawing too big for the size curve; the Anomalocaris is 0.5).
// Optional, same script: idle (standing loop: frames, s a cycle), lie (lying down, played backwards to get up: frames, min park
// minutes), rest (lying loop: frames, s) and eat (at the feeder: frames, s; drinking uses it too unless there is a drink), from
// <name>-idle|lie|rest|eat|drink-<facing>.png. Without them: the standing frame.
// None: a placeholder block.
export const SPECIES = {
  arth: { name: "Arthropleura", size: 2, active: "night", period: "Carboniferous", stars: 0, starter: true, len: 2.5, danger: 1, biomes: ["wetland", "tropical"], water: 0,
          space: 6, group: [1, 6], foodType: "greens", food: 4, appeal: 4, price: 5000, moves: "land", color: "#5a3b2a" },
  lyst: { name: "Lystrosaurus", size: 2, active: "day", period: "Permian", stars: 0, starter: true, len: 1.5, danger: 1, biomes: ["grassland", "desert"], water: 0.05,
          space: 8, group: [3, 10], foodType: "greens", food: 5, appeal: 3, price: 3500, moves: "land", color: "#b08a5a",
          sprite: { name: "lystrosaurus", frame: [96, 40], frames: 8, anchor: [48, 37], scale: 0.5, cycle: 0.32,
                    idle: { frames: 12, s: 2.0 }, lie: { frames: 9, min: 6 }, rest: { frames: 8, s: 3.2 }, eat: { frames: 25, s: 3.1 },
                    box: { east: [12, 5, 83, 37], west: [13, 5, 84, 37] } } },
  dime: { name: "Dimetrodon", size: 3, active: "day", drain: { enrich: 1.5 }, period: "Permian", stars: 1, len: 3.2, danger: 3, biomes: ["desert", "grassland"], water: 0.1,
          space: 20, group: [1, 4], foodType: "meat", food: 12, appeal: 7, price: 9000, moves: "land", color: "#b4552a",
          sprite: { name: "dimetrodon", frame: [96, 56], frames: 8, anchor: [48, 48], cycle: 1.25,
                    idle: { frames: 8, s: 3.2 }, lie: { frames: 16, min: 6 }, rest: { frames: 7, s: 4.0 }, eat: { frames: 8, s: 1.6 },
                    attack: { frames: 8, s: 1.2 },
                    box: { east: [7, 13, 84, 50], west: [12, 13, 89, 50] } } },
  coty: { name: "Cotylorhynchus", size: 4, active: "day", period: "Permian", stars: 1.5, len: 4.5, danger: 2, biomes: ["grassland", "desert"], water: 0.05,
          space: 45, group: [2, 5], foodType: "greens", food: 24, appeal: 8, price: 13000, moves: "land", color: "#2a2f45",
          sprite: { name: "cotylorhynchus", frame: [96, 56], frames: 8, anchor: [48, 48], cycle: 1.0,
                    idle: { frames: 8, s: 3.6 }, lie: { frames: 11, min: 6 }, rest: { frames: 8, s: 4.4 }, eat: { frames: 16, s: 3.2 },
                    attack: { frames: 8, s: 1.4 },
                    box: { east: [4, 21, 89, 50], west: [7, 21, 92, 50] } } },
  anom: { name: "Anomalocaris", size: 1, active: "day", period: "Cambrian", stars: 1, len: 1.0, danger: 2, biomes: ["sea"], water: 0.9, waterKind: "shallow",
          space: 8, group: [1, 3], foodType: "fish", food: 4, appeal: 7, price: 7000, moves: "swim", sea: true, cruise: true, color: "#c46a4a",
          sprite: { name: "anomalocaris", frame: [96, 40], frames: 8, anchor: [48, 39], scale: 0.5, cycle: 0.6,
                    idle: { frames: 8, s: 2.0 }, lie: { frames: 8, min: 4 }, rest: { frames: 8, s: 2.8 }, eat: { frames: 18, s: 1.8 },
                    box: { east: [14, 9, 88, 39], west: [8, 9, 82, 39] } } },
  tikt: { name: "Tiktaalik", size: 2, active: "day", period: "Devonian", stars: 0.5, len: 2.7, danger: 1, biomes: ["wetland", "tropical"], water: 0.5,
          space: 10, group: [2, 6], foodType: "fish", food: 5, appeal: 5, price: 4500, moves: "both", color: "#6b7a4a" },
  trex: { name: "Tyrannosaurus rex", size: 5, active: "day", drain: { enrich: 1.5 }, period: "Cretaceous", stars: 4.5, len: 12, danger: 5, biomes: ["temperate", "grassland"], water: 0.05,
          space: 120, group: [1, 2], foodType: "meat", food: 60, appeal: 25, price: 80000, moves: "land", color: "#6a5a3a",
          sprite: { name: "tyrannosaurus", frame: [192, 112], frames: 8, anchor: [96, 96], cycle: 2.4,
                    idle: { frames: 8, s: 3.6 }, lie: { frames: 17, min: 7 }, rest: { frames: 8, s: 4.4 }, eat: { frames: 12, s: 3.0 },
                    attack: { frames: 8, s: 1.4 },
                    box: { east: [28, 18, 186, 102], west: [6, 18, 164, 102] } } },
  mosa: { name: "Mosasaurus", size: 5, active: "day", drain: { enrich: 1.5 }, period: "Cretaceous", stars: 4.5, len: 15, danger: 5, biomes: ["sea"], water: 0.9, waterKind: "deep",
          space: 110, group: [1, 2], foodType: "fish", food: 45, appeal: 22, price: 70000, moves: "swim", sea: true, cruise: true, color: "#3f5a6e",
          sprite: { name: "mosasaurus", frame: [192, 80], frames: 8, anchor: [96, 78], cycle: 1.6,
                    idle: { frames: 8, s: 2.0 }, lie: { frames: 8, min: 4 }, rest: { frames: 8, s: 3.0 }, eat: { frames: 15, s: 1.5 },
                    attack: { frames: 15, s: 1.5 },
                    box: { east: [22, 16, 168, 74], west: [24, 16, 170, 74] } } },
};
export const FOOD_TYPES = ["greens", "meat", "fish", "bugs"];
export const DANGEROUS = 3;   // a pen holding an animal of this danger or more is fed only through a chute

// Buildings. w and h in tiles. Feeders stand inside exhibits; everything else on park ground.
// fixed: can't be built or bulldozed. ask: bulldozing it asks first. menu: the build menu group (guest, staff, science, exhibits).
// enrich: an enrichment prop, played with by bored animals (inside an exhibit). serves: the guest need it answers; stay: minutes a guest spends there (default 4). tip: its tooltip there. unique: one a park. lab: which lab it is (science.js). upkeep: paid every night.
export const BUILDINGS = {
  entrance: { name: "Entrance",   w: 3, h: 2, price: 0, fixed: true, color: "#c9a16a" },
  shed:     { name: "Food Shed",  w: 2, h: 2, price: 2500, ask: true, menu: "staff", tip: "Keepers fetch food here. Restocked every night.", color: "#8a6a4a" },
  feeder:   { name: "Feeder",     w: 1, h: 1, price: 300, inside: true, menu: "exhibits", tip: "Goes inside an exhibit. Keepers fill it.", color: "#c2a35a" },
  log:      { name: "Enrichment Log", w: 1, h: 1, price: 200, inside: true, enrich: 1, menu: "exhibits", tip: "Goes inside an exhibit. Animals play with it when they're bored.", color: "#7a5a3a" },
  research: { name: "Research Lab", w: 4, h: 3, price: 9000, upkeep: 120, unique: true, lab: "research", ask: true, menu: "science", tip: "Researchers work down the research tracks here.", color: "#5a4a8c" },
  timetravel: { name: "Time Travel Lab", w: 4, h: 3, price: 15000, upkeep: 200, unique: true, lab: "timetravel", ask: true, menu: "science", tip: "Drones scout fossil sites and bring back genomes. Comes with one drone.", color: "#2f7a7e" },
  genetics: { name: "Genetics Lab", w: 4, h: 3, price: 12000, upkeep: 160, unique: true, lab: "genetics", ask: true, menu: "science", tip: "Geneticists clone animals with a complete genome.", color: "#8e3a46" },
  snack:    { name: "Snack Stand", w: 2, h: 2, price: 1500, serves: "hunger", sale: 6, cost: 2, menu: "guest", tip: "Feeds hungry guests. Put it beside a path.", color: "#d27a4a" },
  restroom: { name: "Restroom",   w: 2, h: 2, price: 1200, serves: "bladder", sale: 0, cost: 1, upkeep: 15, menu: "guest", tip: "Guests relieve themselves here. Put it beside a path.", color: "#6f8fa8" },
  bench:    { name: "Bench",      w: 1, h: 1, price: 150, serves: "tired", stay: 14, sale: 0, cost: 0, menu: "guest", tip: "Tired guests sit here. Put it beside a path.", color: "#9a7448" },
  bin:      { name: "Trash Bin",  w: 1, h: 1, price: 80, serves: "litter", stay: 1, sale: 0, cost: 0, menu: "guest", tip: "Guests bin their rubbish. Without one it ends up on the path. Put it beside a path.", color: "#5f6b66" },
  gift:     { name: "Gift Stand", w: 2, h: 2, price: 2000, serves: "gift", sale: 14, cost: 4, menu: "guest", tip: "Guests who've seen something buy a souvenir. Put it beside a path.", color: "#b5538c" },
};

// ---- Science (science.js) ----

// Geological periods, oldest first. trip: what a scouting trip or a mid-size expedition costs; days: how long it takes;
// risk: extra chance an expedition comes back with nothing. epochs: [name, years ago it began]; each ends where the next
// begins (the last at TIMELINE_FLOOR). Epochs only pick the map and which sites show; the period is what every rule uses.
export const PERIODS = [
  { id: "Cambrian",      ago: "539–485 million years ago", trip: 3000, days: 1.5, risk: 0.10,
    epochs: [["Early Cambrian", 538.8e6], ["Middle Cambrian", 506.5e6], ["Late Cambrian", 497e6]] },
  { id: "Ordovician",    ago: "485–443 million years ago", trip: 3100, days: 1.5, risk: 0.10,
    epochs: [["Early Ordovician", 485.4e6], ["Middle Ordovician", 471.3e6], ["Late Ordovician", 458.2e6]] },
  { id: "Silurian",      ago: "443–419 million years ago", trip: 3200, days: 1.5, risk: 0.10,
    epochs: [["Early Silurian", 443.1e6], ["Late Silurian", 426.7e6]] },
  { id: "Devonian",      ago: "419–359 million years ago", trip: 3500, days: 1.5, risk: 0.10,
    epochs: [["Early Devonian", 419.6e6], ["Middle Devonian", 393.3e6], ["Late Devonian", 382.7e6]] },
  { id: "Carboniferous", ago: "359–299 million years ago", trip: 4000, days: 1.5, risk: 0.10,
    epochs: [["Mississippian", 358.9e6], ["Pennsylvanian", 323.4e6]] },
  { id: "Permian",       ago: "299–252 million years ago", trip: 4500, days: 1.5, risk: 0.12,
    epochs: [["Cisuralian", 298.9e6], ["Guadalupian", 273.0e6], ["Lopingian", 259.5e6]] },
  { id: "Triassic",      ago: "252–201 million years ago", trip: 5000, days: 2.5, risk: 0.12,
    epochs: [["Early Triassic", 251.9e6], ["Middle Triassic", 246.7e6], ["Late Triassic", 237e6]] },
  { id: "Jurassic",      ago: "201–145 million years ago", trip: 7000, days: 2.5, risk: 0.15,
    epochs: [["Early Jurassic", 201.4e6], ["Middle Jurassic", 174.7e6], ["Late Jurassic", 161.5e6]] },
  { id: "Cretaceous",    ago: "145–66 million years ago",  trip: 7500, days: 2.5, risk: 0.15,
    epochs: [["Early Cretaceous", 143.1e6], ["Late Cretaceous", 100.5e6]] },
  { id: "Paleogene",     ago: "66–23 million years ago",   trip: 4500, days: 1.5, risk: 0.10,
    epochs: [["Paleocene", 66.0e6], ["Eocene", 56.0e6], ["Oligocene", 33.9e6]] },
  { id: "Neogene",       ago: "23–2.6 million years ago",  trip: 3500, days: 1.5, risk: 0.07,
    epochs: [["Miocene", 23.03e6], ["Pliocene", 5.333e6]] },
  { id: "Quaternary",    ago: "2.6 million years ago to today", trip: 3000, days: 1.5, risk: 0.05,
    epochs: [["Pleistocene", 2.58e6], ["Holocene", 11700]] },
];

// Each period's color on the timeline and tabs (the ICS chart colors, as in v1).
export const PERIOD_COLOR = {
  Cambrian: "#7FA056", Ordovician: "#009270", Silurian: "#B3E1B6", Devonian: "#C28A4D", Carboniferous: "#67A599", Permian: "#F04028",
  Triassic: "#812B92", Jurassic: "#34B2C9", Cretaceous: "#7FC64E", Paleogene: "#FD9A52", Neogene: "#F2D32A", Quaternary: "#E8E27A",
};

export const TIMELINE_FLOOR = 10;
// The map an epoch shows (by its name, else its period's): art/timeline/<name>.png, 260 x 130 Mollweide, from v1's
// tools/timeline/genmaps.py, drafted from the PALEOMAP PaleoDEMs (Scotese & Wright 2018, CC BY 4.0; credited in the panel).
export const TIMELINE_MAPS = {
  Cambrian: "cambrian", Ordovician: "ordovician", Silurian: "silurian", Devonian: "devonian", Carboniferous: "carboniferous",
  Permian: "permian", Triassic: "triassic", Jurassic: "jurassic", "Early Jurassic": "jurassic-early", "Late Jurassic": "jurassic-late",
  "Early Cretaceous": "cretaceous-early", "Late Cretaceous": "cretaceous-late", Paleogene: "paleogene", Neogene: "neogene",
  Pleistocene: "pleistocene", Holocene: "holocene",
};
export const TIMELINE_MAP_SIZE = [260, 130];

// Real fossil sites the Time Travel Lab's drones fly to (from v1's tools/timeline/sites.py). from/to: years ago.
// fauna: species found there; a site shows only while one of them is in SPECIES. Its period is the one it starts in.
// at: its marker's pixel on each map it shows on (placed by plate reconstruction in v1's tools/timeline/placesites.py).
export const SITES = [
  { id: "burgess",   name: "Burgess Shale", where: "British Columbia, Canada", period: "Cambrian", from: 507e6, to: 505e6, at: { cambrian: [68, 66] }, fauna: ["anom"] },
  { id: "fram",      name: "Fram Formation", where: "Ellesmere Island, Canada", period: "Devonian", from: 378e6, to: 372e6, at: { devonian: [117, 65] }, fauna: ["tikt"] },
  { id: "joggins",   name: "Joggins Fossil Cliffs", where: "Nova Scotia, Canada", period: "Carboniferous", from: 315e6, to: 312e6, at: { carboniferous: [126, 70] }, fauna: ["arth"] },
  { id: "texasred",  name: "Texas Red Beds", where: "Texas, USA", period: "Permian", from: 290e6, to: 275e6, at: { permian: [106, 61] }, fauna: ["dime"] },
  { id: "hennessey", name: "Hennessey Formation", where: "Oklahoma, USA", period: "Permian", from: 276e6, to: 272e6, at: { permian: [114, 60] }, fauna: ["coty"] },
  { id: "karoolate", name: "Karoo, Daptocephalus Zone", where: "Eastern Cape, South Africa", period: "Permian", from: 256e6, to: 252.2e6, at: { permian: [116, 114] }, fauna: ["lyst"] },
  { id: "hellcreek", name: "Hell Creek Formation", where: "Montana, USA", period: "Cretaceous", from: 67e6, to: 66.1e6, at: { "cretaceous-late": [92, 19] }, fauna: ["trex"] },
  { id: "maastricht", name: "Maastricht Formation", where: "Limburg, Netherlands", period: "Cretaceous", from: 68e6, to: 66.1e6, at: { "cretaceous-late": [135, 28] }, fauna: ["mosa"] },
];

// Research tracks: each a straight line of steps. A step's effects add up once it's done (fences name their step in `tech`).
// stars: rating the step needs before work on it can start.
// Effects: droneCut (share of the empty-handed chance taken away), tripTime and cloneTime (share of the time cut), wearCut (fence wear cut).
export const TRACKS = {
  exhibits: { name: "Exhibits", steps: [
    { id: "stone", name: "Stone Wall" },
    { id: "glass", name: "Glass Wall" },
    { id: "aquarium", name: "Aquarium Wall", stars: 2 },
    { id: "electric", name: "Electric Fence", stars: 2.5 },
    { id: "concrete", name: "Concrete Wall", stars: 3 },
    { id: "lagoon", name: "Lagoon Wall", stars: 4 },
  ] },
  timetravel: { name: "Time Travel", steps: [
    { id: "dronemk2", name: "Drone Mk. II", effect: { droneCut: 0.15 } },
    { id: "fasttrips", name: "Faster Trips", effect: { tripTime: 0.25 } },
    { id: "dronemk3", name: "Drone Mk. III", effect: { droneCut: 0.15 }, stars: 2 },
    { id: "dronemk4", name: "Drone Mk. IV", effect: { droneCut: 0.1 }, stars: 3 },
  ] },
  parkops: { name: "Park Ops", steps: [
    { id: "incub1", name: "Faster Incubators", effect: { cloneTime: 0.25 } },
    { id: "tough", name: "Hardwearing Fences", effect: { wearCut: 0.25 } },
    { id: "incub2", name: "Faster Incubators II", effect: { cloneTime: 0.25 }, stars: 2.5 },
  ] },
};
