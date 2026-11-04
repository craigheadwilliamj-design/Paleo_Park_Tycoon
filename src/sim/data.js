// Game content. Species, fences, biomes and buildings are plain data: systems read these, never special-case an id.

// Fence types. tier: security against an animal's danger (electric is the only 6).
// wear: multiplier on WEAR.perDay. holds: what water the wall keeps (land fences keep fresh water painted inside).
export const FENCES = {
  hedge:    { name: "Hedge",        tier: 1, price: 20,  wear: 1.4, color: "#4f7a3a" },
  palisade: { name: "Log Palisade", tier: 2, price: 40,  wear: 1.2, color: "#7a5532" },
  glass:    { name: "Glass Wall",   tier: 3, price: 120, wear: 1.0, color: "#9cc9cf" },
  stone:    { name: "Stone Wall",   tier: 4, price: 150, wear: 0.8, color: "#8b8a82" },
  concrete: { name: "Concrete",     tier: 5, price: 400, wear: 0.4, color: "#b5b1a6" },
  electric: { name: "Electric",     tier: 6, price: 160, wear: 1.0, color: "#d9b84a", power: true },
  aquarium: { name: "Aquarium Wall", tier: 3, price: 220, wear: 0.8, color: "#6fb1c9", holds: "shallow" },
  lagoon:   { name: "Lagoon Wall",  tier: 5, price: 500, wear: 0.6, color: "#3c7f9c", holds: "deep" },
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
export const SPECIES = {
  arth: { name: "Arthropleura", period: "Carboniferous", len: 2.5, danger: 1, biomes: ["wetland", "tropical"], water: 0,
          space: 6, group: [1, 6], foodType: "greens", food: 4, appeal: 4, price: 5000, moves: "land", color: "#5a3b2a" },
  lyst: { name: "Lystrosaurus", period: "Permian", len: 1.5, danger: 1, biomes: ["grassland", "desert"], water: 0.05,
          space: 8, group: [3, 10], foodType: "greens", food: 5, appeal: 3, price: 3500, moves: "land", color: "#b08a5a" },
  dime: { name: "Dimetrodon", period: "Permian", len: 3.2, danger: 3, biomes: ["desert", "grassland"], water: 0.1,
          space: 20, group: [1, 4], foodType: "meat", food: 12, appeal: 7, price: 9000, moves: "land", color: "#b4552a" },
  anom: { name: "Anomalocaris", period: "Cambrian", len: 1.0, danger: 2, biomes: ["sea"], water: 0.9, waterKind: "shallow",
          space: 8, group: [1, 3], foodType: "fish", food: 4, appeal: 7, price: 7000, moves: "swim", sea: true, color: "#c46a4a" },
  tikt: { name: "Tiktaalik", period: "Devonian", len: 2.7, danger: 1, biomes: ["wetland", "tropical"], water: 0.5,
          space: 10, group: [2, 6], foodType: "fish", food: 5, appeal: 5, price: 4500, moves: "both", color: "#6b7a4a" },
  trex: { name: "Tyrannosaurus rex", period: "Cretaceous", len: 12, danger: 5, biomes: ["temperate", "grassland"], water: 0.05,
          space: 120, group: [1, 2], foodType: "meat", food: 60, appeal: 25, price: 80000, moves: "land", color: "#6a5a3a" },
};
export const FOOD_TYPES = ["greens", "meat", "fish", "bugs"];
export const DANGEROUS = 3;   // a pen holding an animal of this danger or more is fed only through a chute

// Buildings. w and h in tiles. Feeders stand inside exhibits; everything else on park ground.
// fixed: can't be built or bulldozed. ask: bulldozing it asks first. menu: the build menu group (guest, staff, exhibits). tip: its tooltip there.
export const BUILDINGS = {
  entrance: { name: "Entrance",   w: 3, h: 2, price: 0, fixed: true, color: "#c9a16a" },
  shed:     { name: "Food Shed",  w: 2, h: 2, price: 2500, ask: true, menu: "staff", tip: "Keepers fetch food here. Restocked every night.", color: "#8a6a4a" },
  feeder:   { name: "Feeder",     w: 1, h: 1, price: 300, inside: true, menu: "exhibits", tip: "Goes inside an exhibit. Keepers fill it.", color: "#c2a35a" },
  snack:    { name: "Snack Stand", w: 2, h: 2, price: 1500, serves: "hunger", sale: 6, cost: 2, menu: "guest", tip: "Feeds hungry guests. Put it beside a path.", color: "#d27a4a" },
};
