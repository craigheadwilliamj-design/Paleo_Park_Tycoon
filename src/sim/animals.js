// Animals: needs that drain, and a utility picker that does whatever fixes the most urgent one.
// Every species runs the same ACTIONS table; data (moves, danger, foodType, water, active, drain) decides what each one means.
// Hourly, updateWellbeing turns needs and the habitat score into stress, health and happiness.
import { SPEED, WEAR, W_NONE, ANIMAL } from "./config.js";
import { SPECIES } from "./data.js";
import { neighbours, walkable, idx } from "./grid.js";
import { route } from "./paths.js";
import { walk, tileOf, placeAt } from "./movers.js";
import { habitatScore } from "./habitat.js";
import { rand, range, pick } from "./rng.js";

export const NEEDS = ["hunger", "thirst", "rest", "enrich"];
// The needs this species has: swimmers never get thirsty.
export const needsOf = s => NEEDS.filter(k => k !== "thirst" || s.moves !== "swim");

export function newAnimal(state, sp, exId) {
  return { id: state.nextId++, sp, ex: exId, x: 0, y: 0, face: 1, path: [], act: "idle", t: 0,
           need: { hunger: 20, thirst: 20, rest: 10, enrich: 20 }, stress: 0, health: 100, happy: 70, escaped: false };
}

export const animalsIn = (state, exId) => state.animals.filter(a => a.ex === exId && !a.escaped);

// Tiles of exhibit exId this species can stand on.
export function standable(state, derived, a) {
  const g = state.grid, t = derived.ex.get(a.ex), mv = SPECIES[a.sp].moves;
  return t ? t.tiles.filter(i => walkable(g, i, mv)) : [];
}

export function dropIn(state, derived, a) {
  const spots = standable(state, derived, a);
  if (spots.length) placeAt(state.grid, a, pick(state, spots));
}

// An escaped animal roams to land tiles within a few tiles of where it is.
function roamSpots(state, a) {
  const g = state.grid, out = [], cx = Math.floor(a.x), cy = Math.floor(a.y);
  for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 6; x <= cx + 6; x++)
    if (x >= 0 && y >= 0 && x < g.w && y < g.h && walkable(g, idx(g, x, y), "land")) out.push(idx(g, x, y));
  return out;
}

function stayIn(derived, a) { return i => derived.exOf[i] === a.ex; }

function goTo(state, derived, a, goals) {
  const g = state.grid, mv = SPECIES[a.sp].moves;
  const p = route(g, tileOf(g, a), goals, a.escaped ? "land" : mv, a.escaped ? null : stayIn(derived, a));
  if (!p) return false;
  a.path = p; return true;
}

// Tiles in the pen beside any of these buildings (its feeders or its props).
function besideSpots(state, derived, a, ids) {
  const g = state.grid, out = [];
  for (const b of state.buildings) if (ids.includes(b.id))
    for (const j of neighbours(g, idx(g, b.x, b.y))) if (derived.exOf[j] === a.ex && walkable(g, j, SPECIES[a.sp].moves)) out.push(j);
  return out;
}
function waterSpots(state, derived, a) {
  const g = state.grid, t = derived.ex.get(a.ex);
  if (!t) return [];
  return t.tiles.filter(i => walkable(g, i, SPECIES[a.sp].moves) && (g.water[i] !== W_NONE || neighbours(g, i).some(j => g.water[j] !== W_NONE)));
}

// What an animal can do. score: how much it wants to (0 = not at all); start: head off, false if it can't;
// finish: what doing it changes, once its time runs out at the spot. ctx: { state, derived, bus, s, t, ex }.
const ACTIONS = {
  test: {   // push on the pen's weakest fence tile; only when the fence is under its danger, likelier when bored
    score: (a, c) => (c.t && c.t.security < c.s.danger ? 60 + Math.max(a.need.enrich, ANIMAL.bored) * 0.5 : 0),
    start(a, c) {
      const g = c.state.grid, t = c.t, spots = neighbours(g, t.weakest).filter(j => c.derived.exOf[j] === a.ex && walkable(g, j, c.s.moves));
      if (!spots.length || !goTo(c.state, c.derived, a, spots)) return false;
      a.t = 60;
      if (!c.state.testing[t.weakest]) c.bus.emit("notify", { text: `${c.s.name} is testing the fence.`, ex: a.ex });
      return true;
    },
    finish(a) { a.need.enrich = Math.max(0, a.need.enrich - 10); },
  },
  eat: {
    score: (a, c) => (c.ex && (c.ex.food[c.s.foodType] || 0) > 0 ? a.need.hunger : 0),
    start(a, c) { const spots = besideSpots(c.state, c.derived, a, c.t ? c.t.feeders : []); if (!spots.length || !goTo(c.state, c.derived, a, spots)) return false; a.t = 10; return true; },
    finish(a, c) {
      if (!c.ex) return;
      const meal = Math.min(c.ex.food[c.s.foodType] || 0, c.s.food / 2), eaten = c.state.books.today.eaten;
      c.ex.food[c.s.foodType] -= meal; eaten[c.s.foodType] = (eaten[c.s.foodType] || 0) + meal;
      a.need.hunger = Math.max(0, a.need.hunger - (meal / (c.s.food / 2)) * 70);
    },
  },
  drink: {
    score: (a, c) => (c.s.moves === "swim" ? 0 : a.need.thirst),
    start(a, c) { const spots = waterSpots(c.state, c.derived, a); if (!spots.length || !goTo(c.state, c.derived, a, spots)) return false; a.t = 5; return true; },
    finish(a) { a.need.thirst = 0; },
  },
  rest: {
    score: a => a.need.rest * 0.9,
    start(a, c) { a.path = []; a.t = range(c.state, 30, 70); return true; },
    finish(a) { a.need.rest = Math.max(0, a.need.rest - 60); },
  },
  play: {   // an enrichment prop in the pen
    score: (a, c) => (c.t && c.t.props.length ? a.need.enrich : 0),
    start(a, c) { const spots = besideSpots(c.state, c.derived, a, c.t.props); if (!spots.length || !goTo(c.state, c.derived, a, spots)) return false; a.t = 15; return true; },
    finish(a) { a.need.enrich = Math.max(0, a.need.enrich - 70); },
  },
  wander: {
    score: (a, c) => 25 + rand(c.state) * 10,
    start(a, c) {
      const spots = a.escaped ? roamSpots(c.state, a) : standable(c.state, c.derived, a);
      if (spots.length) goTo(c.state, c.derived, a, [pick(c.state, spots)]);
      a.t = range(c.state, 5, 20); return true;
    },
    finish() {},
  },
};

const ctxOf = (state, derived, bus, a) =>
  ({ state, derived, bus, s: SPECIES[a.sp], t: derived.ex.get(a.ex), ex: state.exhibits.find(e => e.id === a.ex) });

// Pick and start the action that best fixes the most urgent need.
function choose(c, a) {
  const options = Object.entries(ACTIONS).map(([k, act]) => [k, act.score(a, c)]).filter(([, n]) => n > 0);
  options.sort((p, q) => q[1] - p[1]);
  for (const [k] of options) if (ACTIONS[k].start(a, c)) { a.act = k; return; }
  a.act = "idle"; a.t = 10;
}

// Is it outside this species' waking hours right now?
const offHours = (state, s) => {
  const day = state.clock >= ANIMAL.daylight[0] && state.clock < ANIMAL.daylight[1];
  return (s.active || "day") === "day" ? !day : day;
};

export function animalTick(state, derived, bus, dt) {
  const g = state.grid;
  for (const a of state.animals) {
    if (a.crated) continue;
    const s = SPECIES[a.sp], off = offHours(state, s);
    for (const k of needsOf(s)) {
      const rate = (100 / ANIMAL.fullMin[k]) * ((s.drain && s.drain[k]) || 1) * (k === "rest" && off ? ANIMAL.offHoursRest : 1);
      a.need[k] = Math.min(100, a.need[k] + rate * dt);
    }
    if (!walk(g, a, SPEED.animal, dt)) continue;
    if (a.act === "test") testFence(state, derived, bus, a, dt);
    if ((a.t -= dt) > 0) continue;
    const c = ctxOf(state, derived, bus, a);
    if (ACTIONS[a.act]) ACTIONS[a.act].finish(a, c);
    choose(c, a);
  }
}

// An animal at its pen's weakest tile wears it down; after enough hours under its danger, the tile breaks.
function testFence(state, derived, bus, a, dt) {
  const t = derived.ex.get(a.ex), g = state.grid;
  if (!t || t.weakest < 0 || t.security >= SPECIES[a.sp].danger) return;
  const f = t.weakest, h = (state.testing[f] = (state.testing[f] || 0) + dt / 60);
  g.cond[f] = Math.max(0, g.cond[f] - (WEAR.testedPerHour * dt) / 60);
  if (h >= WEAR.breakHours) {
    delete state.testing[f];
    bus.emit("breakFence", { tile: f, by: a.id });
  }
}

// Hourly: stress eases toward what the needs, the habitat and being loose call for; health falls while a need
// sits at 100 or stress stays high, and heals when all is well; at 0 the animal dies. Happiness sums it up.
export function updateWellbeing(state, derived, bus) {
  const S = ANIMAL.stress, H = ANIMAL.health;
  for (const a of state.animals) {
    if (a.crated) continue;
    const s = SPECIES[a.sp], keys = needsOf(s), t = !a.escaped && derived.ex.get(a.ex);
    const here = t ? animalsIn(state, a.ex).filter(b => b.sp === a.sp).length : 0;
    const hab = t ? habitatScore(state, a.sp, t, here).overall : 0;
    const needPart = keys.reduce((n, k) => n + Math.max(0, (a.need[k] - 70) / 30), 0) / keys.length;
    const target = 100 * Math.min(1, S.needs * needPart + S.habitat * (1 - hab) + (a.escaped ? S.loose : 0));
    a.stress += (target - a.stress) * S.ease;
    const starving = ["hunger", "thirst"].filter(k => keys.includes(k) && a.need[k] >= 100).length;
    if (starving || a.stress >= H.stressFrom) a.health -= starving * H.starve + (a.stress >= H.stressFrom ? H.stressed : 0);
    else if (a.stress < H.stressFrom / 2) a.health += H.heal;
    a.health = Math.max(0, Math.min(100, a.health));
    if (a.health < H.weak && !a.weak) { a.weak = true; bus.emit("notify", { text: `${s.name} is weak.`, urgent: true }); }
    else if (a.health >= H.weak + 10) a.weak = false;
    const met = 1 - keys.reduce((n, k) => n + a.need[k], 0) / (100 * keys.length);
    a.happy = Math.round(100 * (0.45 * hab + 0.35 * met + 0.2 * (1 - a.stress / 100)));
    if (a.escaped) a.happy = Math.min(a.happy, 20);
  }
  for (const a of state.animals.filter(a => !a.crated && a.health <= 0)) bus.emit("animalDied", { animal: a.id });
}

// After the grid changes: an animal no longer standing in its exhibit has escaped.
export function settleAnimals(state, derived, bus) {
  const g = state.grid;
  for (const a of state.animals) {
    if (a.crated) continue;
    const here = derived.exOf[tileOf(g, a)];
    if (!a.escaped && here !== a.ex) {
      if (here && state.exhibits.some(e => e.id === here)) { a.ex = here; continue; }
      a.home = a.ex; a.escaped = true; a.ex = 0; a.path = []; a.act = "idle"; a.t = 0;
      bus.emit("notify", { text: `${SPECIES[a.sp].name} has escaped!`, urgent: true });
    }
  }
}
