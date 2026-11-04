// The world: the saved state, the derived data rebuilt from it, the event bus, the commands that change it,
// and the fixed-step tick. The UI and the tests only ever go through these commands.
import { MAP_W, MAP_H, DAY_MIN, STEP_MIN, START_MONEY, S_PATH, S_BUILDING, S_FENCE, W_NONE, W_SHALLOW, W_DEEP,
         F_GATE, F_CHUTE, FOOD, WEAR, GUESTS, STAFF, SAVE_VERSION } from "./config.js";
import { FENCES, BIOMES, BUILDINGS, SPECIES, FOOD_TYPES } from "./data.js";
import { newGrid, inside, idx, setFence, clearTile, isFence } from "./grid.js";
import { rebuildExhibits } from "./exhibits.js";
import { newAnimal, dropIn, animalTick, updateHappiness, settleAnimals, animalsIn } from "./animals.js";
import { planJobs, staffTick, hire, wages } from "./staff.js";
import { guestTick } from "./guests.js";
import { Bus } from "./events.js";

const emptyBooks = () => ({ tickets: 0, shops: 0, food: 0, wages: 0, build: 0, animals: 0, visitors: 0, eaten: {} });

export function newState(seed = 12345) {
  return {
    version: SAVE_VERSION, seed, nextId: 1, day: 1, clock: 4 * 60, money: START_MONEY, rating: 2.5, ticket: GUESTS.ticket,
    grid: newGrid(MAP_W, MAP_H), exhibits: [], openPens: [], buildings: [], animals: [], staff: [], guests: [], jobs: [],
    testing: {}, power: { on: true }, bell: [], books: { today: emptyBooks(), last: null },
  };
}

export class World {
  constructor(state) {
    this.state = state || newState();
    this.derived = {};
    this.bus = new Bus();
    this.bus.on("notify", n => this.note(n.text, n.urgent));
    this.bus.on("breakFence", ({ tile }) => { clearTile(this.state.grid, tile); this.changed(); });
    this.bus.on("caught", ({ animal }) => this.caught(animal));
    this.changed();
  }

  // ---- after any grid change ----
  changed() {
    rebuildExhibits(this.state, this.derived);
    for (const e of this.state.exhibits) e.food = e.food || {};
    settleAnimals(this.state, this.derived, this.bus);
    this.bus.emit("tilesChanged");
  }
  note(text, urgent) {
    const s = this.state;
    s.bell.unshift({ text, day: s.day, clock: s.clock, urgent: !!urgent });
    s.bell.length = Math.min(s.bell.length, 40);
  }
  spend(n, kind) {
    if (this.state.money < n) return false;
    this.state.money -= n; this.state.books.today[kind] = (this.state.books.today[kind] || 0) + n; return true;
  }

  // ---- commands. Each returns "" when it worked, or a short reason when it was refused. ----

  // Paint a tool over a list of [x, y] tiles. Tools: path, erase, water:shallow, water:deep, water:none,
  // fence:<type>, gate, chute.
  paint(tool, tiles) {
    const g = this.state.grid;
    let cost = 0, done = 0, why = "";
    const ops = [];
    for (const [x, y] of tiles) {
      if (!inside(g, x, y)) continue;
      const i = idx(g, x, y), s = g.struct[i];
      if (s === S_BUILDING) { why = "Something is built there."; continue; }
      if (tool === "path") { if (s !== S_PATH && g.water[i] === W_NONE) { ops.push(() => { clearTile(g, i); g.struct[i] = S_PATH; }); cost += 10; } else if (g.water[i]) why = "Not on water."; }
      else if (tool === "erase") { if (s) ops.push(() => clearTile(g, i)); else if (g.water[i]) ops.push(() => { g.water[i] = W_NONE; }); }
      else if (tool.startsWith("water:")) {
        const w = { none: W_NONE, shallow: W_SHALLOW, deep: W_DEEP }[tool.slice(6)];
        if (s === 0) { ops.push(() => { g.water[i] = w; }); cost += w ? 15 : 0; } else why = "Clear it first.";   // bare ground only
      }
      else if (tool.startsWith("fence:")) {
        const id = tool.slice(6), f = FENCES[id];
        if (!f) return "No such fence.";
        if (g.water[i]) { why = "Not on water."; continue; }
        if (!(s === S_FENCE && g.fence[i] - 1 === Object.keys(FENCES).indexOf(id))) { ops.push(() => setFence(g, i, id)); cost += f.price; }
      }
      else if (tool === "gate" || tool === "chute") {
        if (s !== S_FENCE) { why = "Gates and chutes go on a fence."; continue; }
        const bit = tool === "gate" ? F_GATE : F_CHUTE;
        ops.push(() => { g.flags[i] = (g.flags[i] & ~(F_GATE | F_CHUTE)) | bit; }); cost += 50;
      }
      else return "No such tool.";
    }
    if (!ops.length) return why || "Nothing to change.";
    if (!this.spend(cost, "build")) return "Not enough money.";
    for (const op of ops) op();
    this.changed();
    return "";
  }

  place(type, x, y) {
    const def = BUILDINGS[type], g = this.state.grid, d = this.derived;
    if (!def || def.fixed) return "Can't build that.";
    let ex = null;
    for (let yy = y; yy < y + def.h; yy++) for (let xx = x; xx < x + def.w; xx++) {
      if (!inside(g, xx, yy)) return "Off the map.";
      const i = idx(g, xx, yy);
      if (g.struct[i] !== 0 || g.water[i]) return "Something is in the way.";
      const e = d.exOf[i] || 0;
      if (ex === null) ex = e; else if (ex !== e) return "Something is in the way.";
    }
    if (def.inside && !ex) return "Feeders go inside an exhibit.";
    if (!def.inside && ex) return "Not inside an exhibit.";
    if (!this.spend(def.price, "build")) return "Not enough money.";
    this.putBuilding(type, x, y);
    this.changed();
    return "";
  }
  putBuilding(type, x, y) {
    const def = BUILDINGS[type], g = this.state.grid;
    const b = { id: this.state.nextId++, type, x, y };
    if (type === "shed") b.stock = Object.fromEntries(FOOD_TYPES.map(t => [t, FOOD.firstDelivery]));
    for (let yy = y; yy < y + def.h; yy++) for (let xx = x; xx < x + def.w; xx++) { const i = idx(g, xx, yy); clearTile(g, i); g.struct[i] = S_BUILDING; g.bld[i] = b.id; }
    this.state.buildings.push(b);
    return b;
  }
  demolish(x, y) {
    const g = this.state.grid, i = idx(g, x, y), id = g.bld[i], b = this.state.buildings.find(b => b.id === id);
    if (!b) return "Nothing to remove.";
    if (BUILDINGS[b.type].fixed) return "Can't remove that.";
    for (let k = 0; k < g.bld.length; k++) if (g.bld[k] === id) { g.bld[k] = 0; g.struct[k] = 0; }
    this.state.buildings = this.state.buildings.filter(o => o !== b);
    this.changed();
    return "";
  }

  setBiome(exId, biome) {
    const e = this.state.exhibits.find(e => e.id === exId);
    if (!e || !BIOMES[biome]) return "No such exhibit.";
    if (e.biome === biome) return "";
    const cost = e.biome === "none" ? 0 : 5 * (this.derived.ex.get(exId)?.tiles.length || 0);
    if (!this.spend(cost, "build")) return "Not enough money.";
    e.biome = biome; this.changed(); return "";
  }
  rename(exId, name) { const e = this.state.exhibits.find(e => e.id === exId); if (e) e.name = String(name).slice(0, 40); }

  buyAnimal(sp, exId) {
    const s = SPECIES[sp], e = this.state.exhibits.find(e => e.id === exId);
    if (!s) return "No such animal.";
    if (!e) return "Not in an exhibit.";
    if (!this.spend(s.price, "animals")) return "Not enough money.";
    const a = newAnimal(this.state, sp, exId);
    dropIn(this.state, this.derived, a);
    this.state.animals.push(a);
    return "";
  }
  // A darted animal goes back to its exhibit if that pen is closed again, otherwise into a crate.
  caught(id) {
    const a = this.state.animals.find(a => a.id === id);
    if (!a) return;
    a.escaped = false; a.path = []; a.act = "idle"; a.t = 0;
    if (this.state.exhibits.some(e => e.id === a.home)) { a.ex = a.home; dropIn(this.state, this.derived, a); this.note(`${SPECIES[a.sp].name} is back in its exhibit.`); }
    else { a.crated = true; a.ex = 0; this.note(`${SPECIES[a.sp].name} is in a crate.`); }
  }
  release(id, exId) {
    const a = this.state.animals.find(a => a.id === id && a.crated);
    if (!a) return "No such crate.";
    if (!this.state.exhibits.some(e => e.id === exId)) return "Not in an exhibit.";
    a.crated = false; a.ex = exId; dropIn(this.state, this.derived, a); return "";
  }
  hire(role) {
    if (!STAFF.hire[role]) return "No such job.";
    if (!this.spend(STAFF.hire[role], "wages")) return "Not enough money.";
    hire(this.state, this.derived, role); return "";
  }
  fire(id) { this.state.staff = this.state.staff.filter(s => s.id !== id); this.state.jobs.forEach(j => { if (j.by === id) j.by = 0; }); }
  setTicket(p) { this.state.ticket = Math.max(0, Math.min(200, Math.round(p))); }
  setPower(on) { this.state.power.on = !!on; this.changed(); }

  // ---- time ----
  // Advance by minutes of park time in fixed steps.
  advance(minutes) {
    const s = this.state;
    for (let left = minutes; left > 1e-9; left -= STEP_MIN) {
      const dt = Math.min(STEP_MIN, left);
      const hourBefore = Math.floor(s.clock / 60);
      s.clock += dt;
      animalTick(s, this.derived, this.bus, dt);
      staffTick(s, this.derived, this.bus, dt);
      guestTick(s, this.derived, this.bus, dt);
      if (Math.floor(s.clock / 60) !== hourBefore) this.hourly();
      if (s.clock >= DAY_MIN) { s.clock -= DAY_MIN; this.night(); }
    }
  }
  hourly() {
    rebuildExhibits(this.state, this.derived);   // fences wear and get tested, so security is rechecked each hour
    updateHappiness(this.state, this.derived);
    planJobs(this.state, this.derived);
  }
  // The day rolls over: wages, the nightly food delivery, fence wear, the books.
  night() {
    const s = this.state, g = s.grid, b = s.books.today;
    const pay = wages(s); s.money -= pay; b.wages += pay;
    for (const shed of s.buildings.filter(x => x.type === "shed")) {
      const n = s.buildings.filter(x => x.type === "shed").length;
      for (const t of FOOD_TYPES) {
        const want = Math.min(FOOD.shedCap, Math.ceil(((b.eaten[t] || 0) * 1.25) / n) + 20) - (shed.stock[t] || 0);
        if (want <= 0) continue;
        const cost = want * FOOD.price[t];
        if (s.money < cost) { this.note("Food delivery short: not enough money.", true); continue; }
        s.money -= cost; b.food += cost; shed.stock[t] = (shed.stock[t] || 0) + want;
      }
    }
    for (let i = 0; i < g.cond.length; i++) if (isFence(g, i)) {
      const f = FENCES[Object.keys(FENCES)[g.fence[i] - 1]];
      g.cond[i] = Math.max(0, g.cond[i] - WEAR.perDay * (f ? f.wear : 1));
    }
    s.books.last = b; s.books.today = emptyBooks(); s.day++;
    this.changed();
    this.bus.emit("dayEnded", { day: s.day });
  }
}

// A fresh park: an entrance at the bottom middle with a short path into the park.
export function newPark(seed) {
  const w = new World(newState(seed)), g = w.state.grid;
  const ex = Math.floor(g.w / 2) - 1, ey = g.h - 2;
  w.putBuilding("entrance", ex, ey);
  for (let y = ey - 1; y > ey - 6; y--) g.struct[idx(g, ex + 1, y)] = S_PATH;
  w.changed();
  return w;
}
