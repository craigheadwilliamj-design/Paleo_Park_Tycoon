// The job board and the staff who work it. Systems post jobs; staff of the matching role claim the best one
// for their distance, do it, and free it. Nobody else tells staff what to do.
import { SPEED, FOOD, COND, STAFF } from "./config.js";
import { SPECIES, DANGEROUS, BUILDINGS } from "./data.js";
import { neighbours, walkable, idx, isFence } from "./grid.js";
import { route } from "./paths.js";
import { walk, tileOf, placeAt } from "./movers.js";
import { animalsIn } from "./animals.js";

// ---- jobs ----
// A job: {id, key, kind, role, ex?, tile?, type?, pri, by (staff id or 0), why}. key stops duplicates.
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

// Where staff may walk: anywhere outside, and inside pens that hold nothing dangerous.
function staffAllow(state, derived) {
  const bad = new Set(state.exhibits.filter(e => dangerousPen(state, e.id)).map(e => e.id));
  return i => !bad.has(derived.exOf[i]);
}

// Standable tiles beside a building, for staff.
function besideBuilding(state, b) {
  const g = state.grid, def = BUILDINGS[b.type], out = new Set();
  for (let y = b.y; y < b.y + def.h; y++) for (let x = b.x; x < b.x + def.w; x++)
    for (const j of neighbours(g, idx(g, x, y))) if (walkable(g, j, "staff")) out.add(j);
  return [...out];
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
  if (job.kind === "catch") {
    const a = state.animals.find(a => a.id === job.animal);
    if (!a || !a.escaped) return [];
    const i = tileOf(g, a);
    return [i, ...neighbours(g, i)].filter(j => walkable(g, j, "staff"));
  }
  return [];
}

function whyNot(state, derived, s, job) {
  if (job.kind === "feed" && s.stage === "fetch") return state.buildings.some(b => b.type === "shed") ? "Out of " + job.type + "." : "No food shed.";
  if (job.kind === "feed") {
    const t = derived.ex.get(job.ex);
    if (t && !t.feeders.length) return "No feeder.";
    if (dangerousPen(state, job.ex)) return t && t.chutes.length ? "Can't reach the chute." : "No feeding chute.";
    return t && t.gates.length ? "Can't reach the feeder." : "No keeper gate.";
  }
  return "Can't reach it.";
}

function startStage(state, derived, s, job) {
  const g = state.grid, gl = goals(state, derived, s, job);
  const p = gl.length ? route(g, tileOf(g, s), gl, "staff", staffAllow(state, derived)) : null;
  if (!p) { job.why = whyNot(state, derived, s, job); job.by = 0; job.wait = 60; s.job = 0; s.carry = null; return false; }
  job.why = ""; s.path = p; return true;
}

function claim(state, derived, s) {
  const open = state.jobs.filter(j => j.role === s.role && !j.by && !(j.wait > 0));
  open.sort((p, q) => q.pri - p.pri);
  for (const job of open) {
    s.job = job.id; job.by = s.id; s.stage = job.kind === "feed" ? "fetch" : "go";
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
  if (job.kind === "repair") {
    if (s.stage === "go") { s.stage = "work"; s.t = 20; return; }
    if (isFence(g, job.tile)) { g.cond[job.tile] = 100; bus.emit("repaired", { tile: job.tile }); }
    s.job = 0; dropJob(state, job);
  }
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
    if (!walk(g, s, SPEED.staff, dt)) continue;
    if ((s.t -= dt) > 0) continue;
    const job = s.job && state.jobs.find(j => j.id === s.job);
    if (!job) { s.job = 0; s.carry = null; claim(state, derived, s); continue; }
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
