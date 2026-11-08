// Guests: arrive at the entrance, pay, walk the paths to exhibits they haven't seen, watch, eat, and leave.
// Same utility idea as animals: a pressing need first, then the most appealing unseen exhibit, then home.
import { SPEED, GUESTS, S_PATH, STAFF } from "./config.js";
import { SPECIES, BUILDINGS } from "./data.js";
import { frontTiles } from "./grid.js";
import { route } from "./paths.js";
import { walk, tileOf, placeAt } from "./movers.js";
import { animalsIn } from "./animals.js";
import { rand, range } from "./rng.js";

// Guest path tiles at a building's front (where guests queue or leave from). Staff paths don't count.
export function pathsBeside(state, b) {
  const g = state.grid;
  return frontTiles(g, b.x, b.y, BUILDINGS[b.type], b.rot).filter(j => g.struct[j] === S_PATH);
}

// How much an exhibit draws guests right now: its animals' appeal, scaled by how happy they are.
export function exhibitDraw(state, exId) {
  return animalsIn(state, exId).reduce((d, a) => d + SPECIES[a.sp].appeal * (0.4 + 0.6 * a.happy / 100), 0);
}
export const parkDraw = (state, derived) =>
  state.exhibits.reduce((d, e) => d + (derived.ex.get(e.id)?.viewing.length ? exhibitDraw(state, e.id) : 0), 0);

function arrivals(state, derived, dt) {
  const ent = state.buildings.find(b => b.type === "entrance");
  if (!ent) return;
  const draw = parkDraw(state, derived);
  const price = Math.max(0.2, 1.4 - state.ticket / (GUESTS.ticket * 2.5));
  const rate = GUESTS.baseRate * (0.3 + state.rating / 4) * Math.min(2.5, 0.15 + draw / 25) * price;
  state.arrivalAcc = (state.arrivalAcc || 0) + rate * dt;
  while (state.arrivalAcc >= 1) {
    state.arrivalAcc -= 1;
    const spots = pathsBeside(state, ent);
    if (!spots.length) return;
    const gst = { id: state.nextId++, x: 0, y: 0, face: 1, fx: 0, fy: 0, path: [], plan: "arrive", t: 0, fun: 0, hunger: range(state, 0, 40),
                  bladder: range(state, 0, 30), tired: 0, litter: 0, gift: rand(state) < GUESTS.giftChance, seen: [], until: state.clock + range(state, ...GUESTS.stay), at: 0 };
    placeAt(state.grid, gst, spots[Math.floor(rand(state) * spots.length)]);
    state.guests.push(gst);
    state.money += state.ticket; state.books.today.tickets += state.ticket;
  }
}

function decide(state, derived, gst) {
  const g = state.grid, here = tileOf(g, gst);
  // A pressing need first, the worst one that has a stand it can reach. A souvenir is a want, not a need: only after seeing something.
  const wants = [["hunger", gst.hunger], ["bladder", gst.bladder], ["tired", gst.tired], ["litter", gst.litter], ["gift", gst.gift && gst.fun > 0 ? 71 : 0]].filter(w => w[1] > 70).sort((a, b) => b[1] - a[1]);
  for (const [serves] of wants) {
    const stands = state.buildings.filter(b => BUILDINGS[b.type].serves === serves);
    const p = stands.length && route(g, here, stands.flatMap(b => pathsBeside(state, b)), "guest");
    if (p) { gst.path = p; gst.plan = "use"; gst.use = serves; gst.t = Object.values(BUILDINGS).find(d => d.serves === serves).stay ?? 4; return; }
    if (serves === "gift") gst.gift = false;   // no stand to reach: stop wanting one
    if (serves === "litter") { gst.litter = 0; state.litter = (state.litter || 0) + 1; }   // no bin to reach: it goes on the path
  }
  if (state.clock < gst.until) {
    const options = state.exhibits.filter(e => !gst.seen.includes(e.id) && derived.ex.get(e.id)?.viewing.length && exhibitDraw(state, e.id) > 0)
      .map(e => [e, exhibitDraw(state, e.id) * (0.6 + rand(state) * 0.8)]).sort((a, b) => b[1] - a[1]);
    for (const [e] of options) {
      const p = route(g, here, derived.ex.get(e.id).viewing, "guest");
      if (p) { gst.path = p; gst.plan = "watch"; gst.at = e.id; gst.t = range(state, ...GUESTS.watchMin); return; }
      gst.seen.push(e.id);   // can't get there: don't keep trying
    }
  }
  const ent = state.buildings.find(b => b.type === "entrance");
  const p = ent && route(g, here, pathsBeside(state, ent), "guest");
  gst.path = p || []; gst.plan = "leave"; gst.t = 0;
}

export function guestTick(state, derived, bus, dt) {
  arrivals(state, derived, dt);
  const g = state.grid, gone = [];
  const loose = state.animals.filter(a => a.escaped && SPECIES[a.sp].danger >= 3);
  for (const gst of state.guests) {
    if (!gst.panic && loose.some(a => Math.hypot(a.x - gst.x, a.y - gst.y) < STAFF.panicTiles)) {
      gst.panic = true; gst.until = 0; gst.t = 0;
      const ent = state.buildings.find(b => b.type === "entrance");
      gst.path = (ent && route(g, tileOf(g, gst), pathsBeside(state, ent), "guest")) || []; gst.plan = "leave";
    }
    gst.hunger = Math.min(100, gst.hunger + dt * 100 / 300);
    gst.bladder = Math.min(100, (gst.bladder || 0) + dt * 100 / 360);
    gst.tired = Math.min(100, (gst.tired || 0) + dt * 100 / GUESTS.tiredMin);
    if (!walk(g, gst, SPEED.guest, dt)) continue;
    if ((gst.t -= dt) > 0) continue;
    if (gst.plan === "watch") {
      gst.fun += exhibitDraw(state, gst.at); gst.seen.push(gst.at);
    } else if (gst.plan === "use") {
      const def = Object.values(BUILDINGS).find(d => d.serves === gst.use), net = def.sale - def.cost;
      if (gst.use === "gift") gst.gift = false; else gst[gst.use] = 0;
      state.money += net; state.books.today.shops += net;
      if (gst.use === "hunger") gst.litter = 71;   // a wrapper to get rid of
    } else if (gst.plan === "leave") { gone.push(gst); continue; }
    decide(state, derived, gst);
  }
  for (const gst of gone) leave(state, gst);
}

// A guest going home rates the visit: fun had against what the ticket cost.
function leave(state, gst) {
  const worth = gst.fun / Math.max(10, state.ticket * 0.8);
  const stars = gst.panic ? 0.5 : Math.max(0.5, Math.min(5, 1 + worth * 2.5 - (gst.hunger > 80 ? 0.5 : 0) - (gst.bladder > 80 ? 0.5 : 0) - (gst.tired > 80 ? 0.5 : 0) - Math.min(0.5, (state.litter || 0) / GUESTS.litterMax)));
  state.rating = state.rating * 0.97 + stars * 0.03;
  state.books.today.visitors++;
  state.guests = state.guests.filter(x => x !== gst);
}
