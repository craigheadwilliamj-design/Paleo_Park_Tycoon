// Tuning that applies everywhere. Content (species, fences, buildings) lives in data.js.

export const SAVE_VERSION = 4;

export const MAP_W = 96, MAP_H = 64;     // tiles
export const DAY_MIN = 720;              // park minutes a day; the day rolls over at minute 0
export const STEP_MIN = 0.25;            // one sim step, in park minutes
export const START_MONEY = 60000;

// Tile layers (grid.js). Values of the struct layer:
export const S_NONE = 0, S_PATH = 1, S_FENCE = 2, S_BUILDING = 3, S_STAFF = 4;   // S_STAFF: a staff only path
// Values of the water layer:
export const W_NONE = 0, W_SHALLOW = 1, W_DEEP = 2;
// Bits of the flags layer (fence tiles only):
export const F_GATE = 1, F_CHUTE = 2;

// Prices a tile. Fences and buildings carry their own price in data.js.
export const PRICE = { path: 10, staffpath: 10, water: 15, gate: 50, chute: 50 };
export const REFUND = 0.25;   // share of what something cost that bulldozing it gives back

// Fence condition, 0 to 100.
export const COND = { worn: 50, damaged: 25 };
export const WEAR = {
  perDay: 4,            // condition lost a day by an ordinary fence tile
  testedPerHour: 6,     // extra loss an hour while an animal tests the tile
  breakHours: 10,       // hours of testing before a tile under its animal's danger breaks
  mauledPerHour: 4,     // loss an hour while a big bored animal attacks the tile (wear only: it never breaks a fence on its own)
};

// Animals (animals.js). Needs run 0 (met) to 100 (desperate).
export const ANIMAL = {
  fullDays: { hunger: 3, thirst: 2, enrich: 2 },   // park days for a need to go from met to desperate
  daylight: [120, 600],  // park minutes of the day that count as day; night is the rest
  lie: { awake: 8, asleep: 28, nap: [30, 70] },   // how much an animal wants to lie down in its active and off hours (wander scores 25 to 35), and nap minutes
  bored: 60,             // enrichment need over this makes testing the fence likelier
  big: 3,                // size class from which a bored animal attacks its fence; smaller ones get sick instead
  maulFrom: 80,          // enrichment need from which a big animal attacks the fence
  sell: 0.5,             // share of the species' price selling an animal pays
  stress: { needs: 1.5, weights: { hunger: 1, thirst: 1, enrich: 0.5 }, habitat: 0.8, loose: 0.6, ease: 0.3 },   // weights toward the stress target (boredom counts half), and the share of the way it moves an hour
  health: { starveFrom: 90, starve: 1.5, boredSick: 0.5, stressed: 0.5, stressFrom: 70, heal: 2, weak: 30 },   // hunger or thirst over starveFrom costs health, ramping up to starve points an hour at 100 (boredSick for boredom, small animals only); stressed: lost an hour under high stress; heal: gained an hour when all is well
};

// Walking speeds, tiles a park minute.
export const SPEED = { guest: 1.6, staff: 2.2, animal: 0.3 };

export const GUESTS = {
  baseRate: 0.25,        // arrivals a park minute at a 3 star rating and the default ticket
  ticket: 25,            // default ticket price
  stay: [120, 260],      // minutes a guest means to stay
  watchMin: [6, 14],     // minutes spent at a viewing spot
  giftChance: 0.6,       // share of guests who mean to buy a souvenir
  tiredMin: 420,         // park minutes for a guest to go from fresh to worn out
  litterMax: 40,         // litter on the paths in a day that costs every leaving guest half a star
};

export const FOOD = {
  carry: 40,             // units a keeper carries a trip
  feederCap: 120,        // units one feeder holds
  shedCap: 400,          // units of each food type a shed holds
  price: { greens: 2, meat: 6, fish: 5, bugs: 3 },   // per unit, paid on the nightly delivery
  firstDelivery: 120,    // units of each type a new shed starts with
};

// The labs (science.js). Times in park days.
export const SCIENCE = {
  crew: { researcher: { lab: "research", hire: 3000, wage: 250 }, geneticist: { lab: "genetics", hire: 3500, wage: 350 } },
  research: { first: 1, growth: 1.6 },   // days a track's first step takes with one researcher; each next step this many times longer
  drones: { max: 5, price: 15000, growth: 1.5 },   // the Time Travel Lab comes with one; each next costs growth times the last
  sizeLen: [1, 12],      // body length (m) treated as smallest and largest for the numbers below
  fail: [0.1, 0.35],     // chance an expedition comes back empty, smallest to largest, before the period's risk
  trips: [2, 8],         // finds a genome takes on average, smallest to largest
  spread: 0.35,          // a find is worth this share more or less than average
  costMul: [0.35, 1.3],  // expedition price multiplier on the period's trip, smallest to largest
  scoutFind: [0.35, 0.65],   // chance a scouting trip spots each animal not yet seen there (big ones are easier)
  cloneDays: [1, 4],     // days a clone takes, smallest to largest
};

export const STAFF = {
  wage: { keeper: 60, mechanic: 70, guard: 80 },   // a day
  hire: { keeper: 500, mechanic: 600, guard: 700 },
  dartMin: 8,            // minutes a guard takes to dart an escaped animal
  loadMin: 6,            // minutes a keeper takes to crate an animal and pick it up, or to set a crate down
  panicTiles: 5,         // guests this close to a loose animal of danger 3 or more run for the exit
};
