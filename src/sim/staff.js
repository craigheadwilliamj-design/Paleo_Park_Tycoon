// The job board and the staff who work it. Systems post jobs; staff of the matching role claim the best one
// for their distance, do it, and free it. Nobody else tells staff what to do.
import { SPEED, FOOD, COND, STAFF } from "./config.js";
import { SPECIES, DANGEROUS, BUILDINGS } from "./data.js";
import { neighbours, walkable, idx, isFence, frontTiles } from "./grid.js";
import { route } from "./paths.js";
import { walk, tileOf, placeAt } from "./movers.js";
import { animalsIn, crateUp, uncrateProblem, letOut, crateOn } from "./animals.js";

// ---- jobs ----
// A job: {id, key, kind, role, ex?, tile?, type?, animal?, pri, by (staff id or 0), why}. key stops duplicates.
// A haul job moves an animal (live in its pen, or already crated) to tile, in exhibit ex (0: outside, it stays a crate).
export function postJob(state, job) {
  if (state.jobs.some(j => j.key === job.key)) return;
  state.jobs.push({ id: state.nextId++, by: 0, why: "", ...job });
}
const dropJob = (state, job) => { state.jobs = state.jobs.filter(j => j !== job); };

// Look over the park and post what needs doing. Runs every park hour.
export function planJobs(state, derived) {
  const g = state.grid;
  for (const e of state.exhibits) {
    const t = derived.ex.get(e.id);
    if (!t || !t.feeders.length) continue;
    const cap = t.feeders.length * FOOD.feederCap;
    for (const type of new Set(animalsIn(state, e.id).map(a => SPECIES[a.sp].foodType)))
      if ((e.food[type] || 0) < cap * 0.5) postJob(state, { key: `feed:${e.id}:${type}`, kind: "feed", role: "keeper", ex: e.id, type, pri: 2 });
  }
  for (const a of state.animals) if (a.escaped && !a.crated)
    postJob(state, { key: `catch:${a.id}`, kind: "catch", role: "guard", animal: a.id, pri: 5 });
  for (let i = 0; i < g.cond.length; i++)
    if (isFence(g, i) && g.cond[i] < COND.worn) postJob(state, { key: `fix:${i}`, kind: "repair", role: "mechanic", tile: i, pri: g.cond[i] < COND.damaged ? 3 : 1 });
}

// ---- staff ----
export function newStaff(state, role) {
  return { id: state.nextId++, role, name: role[0].toUpperCase() + role.slice(1) + " " + (state.staffSeq = (state.staffSeq || 0) + 1),
           x: 0, y: 0, face: 1, fx: 0, fy: 0, path: [], job: 0, stage: "", carry: null, t: 0 };
}

const dangerousPen = (state, exId) => animalsIn(state, exId).some(a => SPECIES[a.sp].danger >= DANGEROUS);

// Work from the gate when the animal or its tile makes walking into the pen unsafe.
const haulFromGate = (state, exId, a, tile) => exId && (SPECIES[a.sp].danger >= DANGEROUS
  || SPECIES[a.sp].moves === "swim" || dangerousPen(state, exId) || !walkable(state.grid, tile, "staff"));

// Where staff may walk: anywhere outside, and inside pens that hold nothing dangerous.
function staffAllow(state, derived) {
  const bad = new Set(state.exhibits.filter(e => dangerousPen(state, e.id)).map(e => e.id));
  return i => !bad.has(derived.exOf[i]);
}

// Standable tiles at a building's front (any side for feeders and props), for staff.
function besideBuilding(state, b) {
  const g = state.grid;
  return frontTiles(g, b.x, b.y, BUILDINGS[b.type], b.rot).filter(j => walkable(g, j, "staff"));
}

// Standable tiles just outside an exhibit's keeper gates.
function outsideGates(state, derived, exId) {
  const g = state.grid, t = derived.ex.get(exId);
  return t ? t.gates.flatMap(i => neighbours(g, i).filter(j => derived.exOf[j] !== exId && walkable(g, j, "staff"))) : [];
}

// Goal tiles for each stage of a job. Returns [] when there is nowhere to go (the job gets a why).
function goals(state, derived, s, job) {
  const g = state.grid;
  if (job.kind === "feed" && s.stage === "fetch")
    return state.buildings.filter(b => b.type === "shed" && (b.stock[job.type] || 0) > 0).flatMap(b => besideBuilding(state, b));
  if (job.kind === "feed" && s.stage === "deliver") {
    const t = derived.ex.get(job.ex);
    if (!t) return [];
    if (dangerousPen(state, job.ex))   // a chute: stand outside the pen, beside the chute
      return t.chutes.flatMap(c => neighbours(g, c).filter(j => derived.exOf[j] !== job.ex && walkable(g, j, "staff")));
    return state.buildings.filter(b => t.feeders.includes(b.id)).flatMap(b => besideBuilding(state, b)).filter(j => derived.exOf[j] === job.ex);
  }
  if (job.kind === "repair") return neighbours(g, job.tile).filter(j => walkable(g, j, "staff"));
  if (job.kind === "haul") {
    const a = state.animals.find(a => a.id === job.animal);
    if (!a || a.escaped) return [];
    const near = i => [i, ...neighbours(g, i)].filter(j => walkable(g, j, "staff"));
    if (s.stage === "fetch") {   // to the animal or its crate; a dangerous pen is worked from outside its gate
      if (haulFromGate(state, a.ex, a, tileOf(g, a))) return outsideGates(state, derived, a.ex);
      return near(tileOf(g, a)).filter(j => !a.ex || derived.exOf[j] === a.ex);
    }
    if (haulFromGate(state, job.ex, a, job.tile)) return outsideGates(state, derived, job.ex);
    return near(job.tile).filter(j => derived.exOf[j] === job.ex);
  }
  if (job.kind === "catch") {
    const a = state.animals.find(a => a.id === job.animal);
    if (!a || !a.escaped) return [];
    const i = tileOf(g, a);
    return [i, ...neighbours(g, i)].filter(j => walkable(g, j, "staff"));
  }
  return [];
}

function whyNot(state, derived, s, job) {
  if (job.kind === "feed" && s.stage === "fetch") {
    const sheds = state.buildings.filter(b => b.type === "shed");
    return !sheds.length ? "No food shed." : sheds.some(b => (b.stock[job.type] || 0) > 0) ? "Can't reach the shed." : "Out of " + job.type + ".";
  }
  if (job.kind === "feed") {
    const t = derived.ex.get(job.ex);
    if (t && !t.feeders.length) return "No feeder.";
    if (dangerousPen(state, job.ex)) return t && t.chutes.length ? "Can't reach the chute." : "No feeding chute.";
    return t && t.gates.length ? "Can't reach the feeder." : "No keeper gate.";
  }
  if (job.kind === "haul") {
    const a = state.animals.find(a => a.id === job.animal), ex = s.stage === "fetch" ? a && a.ex : job.ex, t = ex && derived.ex.get(ex);
    if (t && !t.gates.length) return "No keeper gate.";
    return s.stage === "fetch" ? (a && a.crated ? "Can't reach the crate." : "Can't reach it.") : "Can't reach the spot.";
  }
  return "Can't reach it.";
}

function startStage(state, derived, s, job) {
  const g = state.grid, gl = goals(state, derived, s, job);
  const p = gl.length ? route(g, tileOf(g, s), gl, "staff", staffAllow(state, derived)) : null;
  if (!p) { job.why = whyNot(state, derived, s, job); job.by = 0; job.wait = 60; s.job = 0; setDown(state, derived, s); return false; }
  job.why = ""; s.path = p; return true;
}

function claim(state, derived, s) {
  const open = state.jobs.filter(j => j.role === s.role && !j.by && !(j.wait > 0));
  open.sort((p, q) => q.pri - p.pri);
  for (const job of open) {
    s.job = job.id; job.by = s.id; s.stage = job.kind === "feed" || job.kind === "haul" ? "fetch" : "go";
    if (startStage(state, derived, s, job)) return;
  }
  // Nothing to do: wander a few tiles along the paths.
  s.t = 15;
}

function arrive(state, derived, bus, s, job) {
  const g = state.grid;
  if (job.kind === "feed" && s.stage === "fetch") {
    const here = tileOf(g, s);
    const shed = state.buildings.find(b => b.type === "shed" && (b.stock[job.type] || 0) > 0 && besideBuilding(state, b).includes(here));
    if (!shed) return startStage(state, derived, s, job);
    const n = Math.min(FOOD.carry, shed.stock[job.type]);
    shed.stock[job.type] -= n; s.carry = { type: job.type, n }; s.stage = "deliver";
    return startStage(state, derived, s, job);
  }
  if (job.kind === "feed") {
    const e = state.exhibits.find(e => e.id === job.ex), t = derived.ex.get(job.ex);
    if (e && t) { const cap = t.feeders.length * FOOD.feederCap; e.food[job.type] = Math.min(cap, (e.food[job.type] || 0) + s.carry.n); }
    s.carry = null; s.job = 0; dropJob(state, job); return;
  }
  if (job.kind === "catch") {
    const a = state.animals.find(a => a.id === job.animal);
    if (!a || !a.escaped) { s.job = 0; dropJob(state, job); return; }
    if (Math.hypot(a.x - s.x, a.y - s.y) > 1.6) return startStage(state, derived, s, job);   // it moved: follow
    if (s.stage !== "dart") { s.stage = "dart"; s.t = STAFF.dartMin; a.act = "held"; a.t = STAFF.dartMin + 1; a.path = []; return; }
    bus.emit("caught", { animal: a.id }); s.job = 0; dropJob(state, job); return;
  }
  if (job.kind === "haul") return haul(state, derived, bus, s, job);
  if (job.kind === "repair") {
    if (s.stage === "go") { s.stage = "work"; s.t = 20; return; }
    if (isFence(g, job.tile)) { g.cond[job.tile] = 100; bus.emit("repaired", { tile: job.tile }); }
    s.job = 0; dropJob(state, job);
  }
}

// Haul: walk to the animal, crate it (or pick up its crate), carry it to the spot and set it down. Into an
// exhibit, it comes out there; outside one, the crate waits where it was put.
function haul(state, derived, bus, s, job) {
  const g = state.grid, a = state.animals.find(a => a.id === job.animal);
  if (!a || a.escaped) { setDown(state, derived, s); s.job = 0; dropJob(state, job); return; }
  if (s.stage === "fetch") {
    const fromGate = haulFromGate(state, a.ex, a, tileOf(g, a));
    if (!fromGate && Math.hypot(a.x - s.x, a.y - s.y) > 1.6) return startStage(state, derived, s, job);   // it moved: follow
    s.stage = "load"; s.t = STAFF.loadMin;
    if (!a.crated) { a.act = "held"; a.t = STAFF.loadMin + 1; a.path = []; }
    return;
  }
  if (s.stage === "load") {
    if (!a.crated) { crateUp(state, derived, a); state.jobs = state.jobs.filter(j => j === job || j.animal !== a.id); }
    a.carried = s.id; a.ex = 0; s.carry = { crate: a.id }; s.stage = "deliver";
    return startStage(state, derived, s, job);
  }
  if (s.stage === "deliver") { s.stage = "unload"; s.t = STAFF.loadMin; return; }
  // The keeper's footing and the animal's destination are different: swimmers can go into deep water.
  // Recheck the destination after the journey. If it changed, leave a crate with the keeper, never release it there.
  const target = { ...a, x: job.tile % g.w + 0.5, y: ((job.tile / g.w) | 0) + 0.5, carried: 0 };
  const why = derived.exOf[job.tile] !== job.ex ? "The exhibit changed."
    : crateOn(state, job.tile, a) ? "A crate is there."
    : job.ex ? uncrateProblem(state, derived, target)
    : !walkable(g, job.tile, "staff") || isFence(g, job.tile) ? "Can't put it there." : "";
  setDown(state, derived, s, why ? -1 : job.tile);
  s.job = 0; dropJob(state, job);
  if (why) { bus.emit("notify", { text: `${SPECIES[a.sp].name} is in a crate. ${why}` }); return; }
  if (!job.ex) return;
  letOut(state, derived, a);
}

// A keeper carrying a crate puts it down: on tile, or where the keeper stands.
export function setDown(state, derived, s, tile = -1) {
  const a = s.carry && s.carry.crate && state.animals.find(a => a.id === s.carry.crate);
  s.carry = null;
  if (!a) return;
  a.carried = 0;
  placeAt(state.grid, a, tile >= 0 ? tile : tileOf(state.grid, s));
  a.ex = derived.exOf[tileOf(state.grid, a)] || 0;
}

// The way ahead changed: plan the current stage again (it drops the job if there's no way now).
export function reroute(state, derived, s) {
  const job = s.job && state.jobs.find(j => j.id === s.job);
  s.path = [];
  if (job) startStage(state, derived, s, job);
}

export function staffTick(state, derived, bus, dt) {
  const g = state.grid;
  for (const j of state.jobs) if (j.wait > 0) j.wait -= dt;
  for (const s of state.staff) {
    const done = walk(g, s, SPEED.staff, dt);
    if (s.carry && s.carry.crate) { const a = state.animals.find(a => a.id === s.carry.crate); if (a) { a.x = s.x; a.y = s.y; } }
    if (!done) continue;
    if ((s.t -= dt) > 0) continue;
    const job = s.job && state.jobs.find(j => j.id === s.job);
    if (!job) { s.job = 0; setDown(state, derived, s); claim(state, derived, s); continue; }
    arrive(state, derived, bus, s, job);
  }
}

export function hire(state, derived, role) {
  const s = newStaff(state, role), ent = state.buildings.find(b => b.type === "entrance");
  if (ent) { const spots = besideBuilding(state, ent); if (spots.length) placeAt(state.grid, s, spots[0]); }
  state.staff.push(s);
  return s;
}
export const wages = state => state.staff.reduce((m, s) => m + (STAFF.wage[s.role] || 0), 0);
