// Animals: needs that drain, and a utility picker that does whatever fixes the most urgent one.
// Every species runs the same list; data (moves, danger, foodType, water) decides what each action means.
import { SPEED, WEAR, W_NONE } from "./config.js";
import { SPECIES } from "./data.js";
import { neighbours, walkable, idx } from "./grid.js";
import { route } from "./paths.js";
import { walk, tileOf, placeAt } from "./movers.js";
import { habitatScore } from "./habitat.js";
import { rand, range, pick } from "./rng.js";

// Needs run 0 (met) to 100 (desperate); these are points a park minute.
const DRAIN = { hunger: 100 / 420, thirst: 100 / 300, rest: 100 / 540 };

export function newAnimal(state, sp, exId) {
  return { id: state.nextId++, sp, ex: exId, x: 0, y: 0, face: 1, path: [], act: "idle", t: 0,
           need: { hunger: 20, thirst: 20, rest: 10 }, happy: 70, escaped: false };
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

// Tiles beside the exhibit's feeders.
function feederSpots(state, derived, a) {
  const g = state.grid, t = derived.ex.get(a.ex), out = [];
  if (!t) return out;
  for (const b of state.buildings) if (t.feeders.includes(b.id))
    for (const j of neighbours(g, idx(g, b.x, b.y))) if (derived.exOf[j] === a.ex && walkable(g, j, SPECIES[a.sp].moves)) out.push(j);
  return out;
}
function waterSpots(state, derived, a) {
  const g = state.grid, t = derived.ex.get(a.ex);
  if (!t) return [];
  return t.tiles.filter(i => walkable(g, i, SPECIES[a.sp].moves) && (g.water[i] !== W_NONE || neighbours(g, i).some(j => g.water[j] !== W_NONE)));
}

// Pick and start the action that best fixes the most urgent need.
function choose(state, derived, bus, a) {
  const s = SPECIES[a.sp], t = derived.ex.get(a.ex), ex = state.exhibits.find(e => e.id === a.ex);
  const swims = s.moves === "swim";
  const options = [];
  if (t && t.security < s.danger) options.push(["test", 95]);
  if (ex && (ex.food[s.foodType] || 0) > 0) options.push(["eat", a.need.hunger]);
  if (!swims) options.push(["drink", a.need.thirst]);
  options.push(["rest", a.need.rest * 0.9]);
  options.push(["wander", 25 + rand(state) * 10]);
  options.sort((p, q) => q[1] - p[1]);
  for (const [act] of options) {
    if (act === "test") {
      const g = state.grid, spots = neighbours(g, t.weakest).filter(j => derived.exOf[j] === a.ex && walkable(g, j, s.moves));
      if (spots.length && goTo(state, derived, a, spots)) {
        a.act = "test"; a.t = 60;
        if (!state.testing[t.weakest]) bus.emit("notify", { text: `${s.name} is testing the fence.`, ex: a.ex });
        return;
      }
    } else if (act === "eat") {
      const spots = feederSpots(state, derived, a);
      if (spots.length && goTo(state, derived, a, spots)) { a.act = "eat"; a.t = 10; return; }
    } else if (act === "drink") {
      const spots = waterSpots(state, derived, a);
      if (spots.length && goTo(state, derived, a, spots)) { a.act = "drink"; a.t = 5; return; }
    } else if (act === "rest") {
      a.act = "rest"; a.path = []; a.t = range(state, 30, 70); return;
    } else {
      const spots = a.escaped ? roamSpots(state, a) : standable(state, derived, a);
      if (spots.length) { goTo(state, derived, a, [pick(state, spots)]); }
      a.act = "wander"; a.t = range(state, 5, 20); return;
    }
  }
  a.act = "idle"; a.t = 10;
}

// What happens when an action's time runs out at its spot.
function finish(state, derived, bus, a) {
  const s = SPECIES[a.sp], ex = state.exhibits.find(e => e.id === a.ex);
  if (a.act === "eat" && ex) {
    const meal = Math.min(ex.food[s.foodType] || 0, s.food / 2);
    ex.food[s.foodType] -= meal; state.books.today.eaten[s.foodType] = (state.books.today.eaten[s.foodType] || 0) + meal;
    a.need.hunger = Math.max(0, a.need.hunger - (meal / (s.food / 2)) * 70);
  } else if (a.act === "drink") a.need.thirst = 0;
  else if (a.act === "rest") a.need.rest = Math.max(0, a.need.rest - 60);
}

export function animalTick(state, derived, bus, dt) {
  const g = state.grid;
  for (const a of state.animals) {
    if (a.crated) continue;
    const s = SPECIES[a.sp];
    a.need.hunger = Math.min(100, a.need.hunger + DRAIN.hunger * dt);
    if (s.moves !== "swim") a.need.thirst = Math.min(100, a.need.thirst + DRAIN.thirst * dt);
    a.need.rest = Math.min(100, a.need.rest + DRAIN.rest * dt);
    if (!walk(g, a, SPEED.animal, dt)) continue;
    if (a.act === "test") testFence(state, derived, bus, a, dt);
    if ((a.t -= dt) > 0) continue;
    finish(state, derived, bus, a);
    choose(state, derived, bus, a);
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

// Happiness: needs met, and the habitat score of where it lives.
export function updateHappiness(state, derived) {
  for (const e of state.exhibits) {
    const t = derived.ex.get(e.id), here = animalsIn(state, e.id);
    for (const a of here) {
      const h = habitatScore(state, a.sp, t, here.filter(b => b.sp === a.sp).length);
      const needs = 1 - (a.need.hunger + a.need.thirst + a.need.rest) / 300;
      a.happy = Math.round(100 * (0.5 * h.overall + 0.5 * needs));
    }
  }
  for (const a of state.animals) if (a.escaped) a.happy = Math.min(a.happy, 20);
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
