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
// moves: "land", "swim" or "both". sea: lives in sea water (needs a sea exhibit).
// stars: park rating its Time Travel Lab expeditions need. starter: partner parks sell it, so it can be bought without the labs.
export const SPECIES = {
  arth: { name: "Arthropleura", period: "Carboniferous", stars: 0, starter: true, len: 2.5, danger: 1, biomes: ["wetland", "tropical"], water: 0,
          space: 6, group: [1, 6], foodType: "greens", food: 4, appeal: 4, price: 5000, moves: "land", color: "#5a3b2a" },
  lyst: { name: "Lystrosaurus", period: "Permian", stars: 0, starter: true, len: 1.5, danger: 1, biomes: ["grassland", "desert"], water: 0.05,
          space: 8, group: [3, 10], foodType: "greens", food: 5, appeal: 3, price: 3500, moves: "land", color: "#b08a5a" },
  dime: { name: "Dimetrodon", period: "Permian", stars: 1, len: 3.2, danger: 3, biomes: ["desert", "grassland"], water: 0.1,
          space: 20, group: [1, 4], foodType: "meat", food: 12, appeal: 7, price: 9000, moves: "land", color: "#b4552a" },
  anom: { name: "Anomalocaris", period: "Cambrian", stars: 1, len: 1.0, danger: 2, biomes: ["sea"], water: 0.9, waterKind: "shallow",
          space: 8, group: [1, 3], foodType: "fish", food: 4, appeal: 7, price: 7000, moves: "swim", sea: true, color: "#c46a4a" },
  tikt: { name: "Tiktaalik", period: "Devonian", stars: 0.5, len: 2.7, danger: 1, biomes: ["wetland", "tropical"], water: 0.5,
          space: 10, group: [2, 6], foodType: "fish", food: 5, appeal: 5, price: 4500, moves: "both", color: "#6b7a4a" },
  trex: { name: "Tyrannosaurus rex", period: "Cretaceous", stars: 4.5, len: 12, danger: 5, biomes: ["temperate", "grassland"], water: 0.05,
          space: 120, group: [1, 2], foodType: "meat", food: 60, appeal: 25, price: 80000, moves: "land", color: "#6a5a3a" },
};
export const FOOD_TYPES = ["greens", "meat", "fish", "bugs"];
export const DANGEROUS = 3;   // a pen holding an animal of this danger or more is fed only through a chute

// Buildings. w and h in tiles. Feeders stand inside exhibits; everything else on park ground.
// fixed: can't be built or bulldozed. ask: bulldozing it asks first. menu: the build menu group (guest, staff, science, exhibits).
// tip: its tooltip there. unique: one a park. lab: which lab it is (science.js). upkeep: paid every night.
export const BUILDINGS = {
  entrance: { name: "Entrance",   w: 3, h: 2, price: 0, fixed: true, color: "#c9a16a" },
  shed:     { name: "Food Shed",  w: 2, h: 2, price: 2500, ask: true, menu: "staff", tip: "Keepers fetch food here. Restocked every night.", color: "#8a6a4a" },
  feeder:   { name: "Feeder",     w: 1, h: 1, price: 300, inside: true, menu: "exhibits", tip: "Goes inside an exhibit. Keepers fill it.", color: "#c2a35a" },
  research: { name: "Research Lab", w: 4, h: 3, price: 9000, upkeep: 120, unique: true, lab: "research", ask: true, menu: "science", tip: "Researchers work down the research tracks here.", color: "#5a4a8c" },
  timetravel: { name: "Time Travel Lab", w: 4, h: 3, price: 15000, upkeep: 200, unique: true, lab: "timetravel", ask: true, menu: "science", tip: "Drones scout fossil sites and bring back genomes. Comes with one drone.", color: "#2f7a7e" },
  genetics: { name: "Genetics Lab", w: 4, h: 3, price: 12000, upkeep: 160, unique: true, lab: "genetics", ask: true, menu: "science", tip: "Geneticists clone animals with a complete genome.", color: "#8e3a46" },
  snack:    { name: "Snack Stand", w: 2, h: 2, price: 1500, serves: "hunger", sale: 6, cost: 2, menu: "guest", tip: "Feeds hungry guests. Put it beside a path.", color: "#d27a4a" },
};

// ---- Science (science.js) ----

// Geological periods, oldest first. trip: what a scouting trip or a mid-size expedition costs; days: how long it takes;
// risk: extra chance an expedition comes back with nothing.
export const PERIODS = [
  { id: "Cambrian",      ago: "539–485 million years ago", trip: 3000, days: 1.5, risk: 0.10 },
  { id: "Ordovician",    ago: "485–443 million years ago", trip: 3100, days: 1.5, risk: 0.10 },
  { id: "Silurian",      ago: "443–419 million years ago", trip: 3200, days: 1.5, risk: 0.10 },
  { id: "Devonian",      ago: "419–359 million years ago", trip: 3500, days: 1.5, risk: 0.10 },
  { id: "Carboniferous", ago: "359–299 million years ago", trip: 4000, days: 1.5, risk: 0.10 },
  { id: "Permian",       ago: "299–252 million years ago", trip: 4500, days: 1.5, risk: 0.12 },
  { id: "Triassic",      ago: "252–201 million years ago", trip: 5000, days: 2.5, risk: 0.12 },
  { id: "Jurassic",      ago: "201–145 million years ago", trip: 7000, days: 2.5, risk: 0.15 },
  { id: "Cretaceous",    ago: "145–66 million years ago",  trip: 7500, days: 2.5, risk: 0.15 },
  { id: "Paleogene",     ago: "66–23 million years ago",   trip: 4500, days: 1.5, risk: 0.10 },
  { id: "Neogene",       ago: "23–2.6 million years ago",  trip: 3500, days: 1.5, risk: 0.07 },
  { id: "Quaternary",    ago: "2.6 million years ago to today", trip: 3000, days: 1.5, risk: 0.05 },
];

// Real fossil sites the Time Travel Lab's drones fly to (from v1's tools/timeline/sites.py). from/to: years ago.
// fauna: species found there; a site shows only while one of them is in SPECIES. Its period is the one it starts in.
export const SITES = [
  { id: "burgess",   name: "Burgess Shale", where: "British Columbia, Canada", period: "Cambrian", from: 507e6, to: 505e6, fauna: ["anom"] },
  { id: "fram",      name: "Fram Formation", where: "Ellesmere Island, Canada", period: "Devonian", from: 378e6, to: 372e6, fauna: ["tikt"] },
  { id: "joggins",   name: "Joggins Fossil Cliffs", where: "Nova Scotia, Canada", period: "Carboniferous", from: 315e6, to: 312e6, fauna: ["arth"] },
  { id: "texasred",  name: "Texas Red Beds", where: "Texas, USA", period: "Permian", from: 290e6, to: 275e6, fauna: ["dime"] },
  { id: "karoolate", name: "Karoo, Daptocephalus Zone", where: "Eastern Cape, South Africa", period: "Permian", from: 256e6, to: 252.2e6, fauna: ["lyst"] },
  { id: "hellcreek", name: "Hell Creek Formation", where: "Montana, USA", period: "Cretaceous", from: 67e6, to: 66.1e6, fauna: ["trex"] },
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
