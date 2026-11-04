// Tuning that applies everywhere. Content (species, fences, buildings) lives in data.js.

export const SAVE_VERSION = 1;

export const MAP_W = 96, MAP_H = 64;     // tiles
export const DAY_MIN = 720;              // park minutes a day; the day rolls over at minute 0
export const STEP_MIN = 0.25;            // one sim step, in park minutes
export const START_MONEY = 60000;

// Tile layers (grid.js). Values of the struct layer:
export const S_NONE = 0, S_PATH = 1, S_FENCE = 2, S_BUILDING = 3;
// Values of the water layer:
export const W_NONE = 0, W_SHALLOW = 1, W_DEEP = 2;
// Bits of the flags layer (fence tiles only):
export const F_GATE = 1, F_CHUTE = 2;

// Prices a tile. Fences and buildings carry their own price in data.js.
export const PRICE = { path: 10, water: 15, gate: 50, chute: 50 };
export const REFUND = 0.25;   // share of what something cost that bulldozing it gives back

// Fence condition, 0 to 100.
export const COND = { worn: 50, damaged: 25 };
export const WEAR = {
  perDay: 4,            // condition lost a day by an ordinary fence tile
  testedPerHour: 6,     // extra loss an hour while an animal tests the tile
  breakHours: 10,       // hours of testing before a tile under its animal's danger breaks
};

// Walking speeds, tiles a park minute.
export const SPEED = { guest: 1.6, staff: 2.2, animal: 1.2 };

export const GUESTS = {
  baseRate: 0.25,        // arrivals a park minute at a 3 star rating and the default ticket
  ticket: 25,            // default ticket price
  stay: [120, 260],      // minutes a guest means to stay
  watchMin: [6, 14],     // minutes spent at a viewing spot
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
  panicTiles: 5,         // guests this close to a loose animal of danger 3 or more run for the exit
};
