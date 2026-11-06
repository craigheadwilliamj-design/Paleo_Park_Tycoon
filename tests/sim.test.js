// Headless sim tests: no browser, just the sim modules. Run with `node --test tests/sim.test.js`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newPark, World } from "../src/sim/world.js";
import { serialize, deserialize } from "../src/sim/save.js";
import { idx } from "../src/sim/grid.js";
import { tileTier } from "../src/sim/exhibits.js";
import { S_PATH, DAY_MIN } from "../src/sim/config.js";
import { TRACKS, SITES } from "../src/sim/data.js";
import { trackStep, stepMinutes, tripOdds, siteById } from "../src/sim/science.js";

// Every research step done, so tests can build any fence.
const researchAll = w => { w.state.science.done = Object.values(TRACKS).flatMap(t => t.steps.map(s => s.id)); };

// A rectangle's outline as [x, y] tiles.
const ring = (x0, y0, x1, y1) => {
  const out = [];
  for (let x = x0; x <= x1; x++) out.push([x, y0], [x, y1]);
  for (let y = y0 + 1; y < y1; y++) out.push([x0, y], [x1, y]);
  return out;
};
const line = (x0, y0, x1, y1) => { const out = []; for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) out.push([x, y]); return out; };

// A small park: a path from the entrance up and across, one pen beside it with a gate, a feeder and a pond, a shed.
function buildPark(fence = "palisade") {
  const w = newPark(7), g = w.state.grid;
  researchAll(w);
  const ex = Math.floor(g.w / 2);                       // the entrance path column
  assert.equal(w.paint("path", line(ex, 40, ex, g.h - 3)), "");
  assert.equal(w.paint("path", line(ex - 20, 40, ex, 40)), "");
  assert.equal(w.paint(`fence:${fence}`, ring(ex - 18, 28, ex - 6, 39)), "");   // bottom wall sits on row 39, beside the path on row 40
  assert.equal(w.paint("gate", [[ex - 12, 39]]), "");
  assert.equal(w.paint("water:shallow", line(ex - 16, 30, ex - 14, 32)), "");
  assert.equal(w.state.exhibits.length, 1, "closing the ring makes one exhibit");
  const e = w.state.exhibits[0];
  assert.equal(w.place("feeder", ex - 10, 35), "");
  assert.equal(w.place("shed", ex + 2, 42), "");
  assert.equal(w.paint("path", line(ex + 1, 41, ex + 1, 44)), "");
  return { w, e, ex };
}

test("closing a fence makes an exhibit, opening it again removes it", () => {
  const { w, e, ex } = buildPark();
  assert.equal(e.biome, "none");
  assert.equal(w.setBiome(e.id, "desert"), "");
  const t = w.derived.ex.get(e.id);
  assert.ok(t.viewing.length > 0, "path beside the fence gives viewing spots");
  assert.equal(t.gates.length, 1);
  assert.equal(t.security, 2, "palisade is tier 2");
  assert.equal(w.bulldoze([[ex - 18, 33]]), "");
  assert.equal(w.state.exhibits.length, 0, "a gap in the wall opens the pen");
  assert.equal(w.paint("fence:palisade", [[ex - 18, 33]]), "");
  assert.equal(w.state.exhibits.length, 1);
  assert.equal(w.state.exhibits[0].id, e.id, "closing it again brings back the same exhibit");
  assert.equal(w.state.exhibits[0].biome, "desert", "and its biome");
});

test("splitting a pen keeps the biome on both halves", () => {
  const { w, e, ex } = buildPark();
  w.setBiome(e.id, "grassland");
  assert.equal(w.paint("fence:hedge", line(ex - 17, 34, ex - 7, 34)), "");
  assert.equal(w.state.exhibits.length, 2);
  assert.ok(w.state.exhibits.every(x => x.biome === "grassland"));
  assert.ok(w.state.exhibits.some(x => x.id === e.id), "the bigger half keeps the id");
});

test("security tiers, wear and electric power", () => {
  const { w, e } = buildPark("electric");
  const t = () => w.derived.ex.get(e.id);
  assert.equal(t().security, 6);
  w.setPower(false);
  assert.equal(t().security, 2, "electric without power is a 2");
  const f = t().fences[0], g = w.state.grid;
  g.cond[f] = 40; assert.equal(tileTier(w.state, f), 1, "and a 1 when worn");
  w.setPower(true);
  assert.equal(tileTier(w.state, f), 6, "worn electric with power still holds");
  g.cond[f] = 10; assert.equal(tileTier(w.state, f), 1, "damaged electric loses its power");
});

test("a park runs: keepers feed, guests come and pay, the day rolls over", () => {
  const { w, e } = buildPark();
  w.setBiome(e.id, "desert");
  for (let k = 0; k < 4; k++) assert.equal(w.buyAnimal("lyst", e.id), "");
  assert.equal(w.hire("keeper"), "");
  const money0 = w.state.money;
  w.advance(720 * 2);
  const s = w.state;
  assert.equal(s.day, 3);
  assert.ok(s.books.last.visitors + s.books.today.visitors > 0, "guests visited");
  assert.ok(s.books.last.tickets > 0, "tickets were sold");
  assert.ok(Object.values(e.food).some(n => n > 0) || s.books.last.eaten.greens > 0, "keepers fed the pen");
  for (const a of s.animals) assert.ok(a.need.hunger < 90, "nobody is starving");
  assert.ok(s.animals.every(a => !a.escaped), "palisade holds Lystrosaurus");
  assert.notEqual(s.money, money0);
});

test("guests use restrooms and buy souvenirs", () => {
  const { w, e, ex } = buildPark();
  w.setBiome(e.id, "desert");
  for (let k = 0; k < 4; k++) assert.equal(w.buyAnimal("lyst", e.id), "");
  assert.equal(w.place("restroom", ex + 1, 46), "");
  assert.equal(w.place("gift", ex - 2, 46), "");
  w.advance(200);
  const s = w.state, shops0 = s.books.today.shops;
  const gst = s.guests.find(x => x.plan !== "leave" && s.clock < x.until - 60);   // one with time left, not on its way out
  assert.ok(gst, "a guest is in the park");
  gst.bladder = 100; gst.gift = true; gst.fun = 50; gst.hunger = 0;
  const seen = new Set(gst.plan === "use" ? [gst.use] : []);   // it may already be on its way to a stand
  for (let k = 0; k < 120 && s.guests.includes(gst); k++) { w.advance(1); if (gst.plan === "use") seen.add(gst.use); }
  assert.ok(seen.has("bladder"), "the guest went to a restroom");
  assert.ok(seen.has("gift"), "the guest went to a gift stand");
  assert.ok(!gst.gift && gst.bladder < 100, "and was served");
  assert.notEqual(s.books.today.shops, shops0);
  assert.equal(deserialize(serialize(s)).guests.length, s.guests.length);
});

test("guests sit on benches and bin their rubbish", () => {
  const { w, e, ex } = buildPark();
  w.setBiome(e.id, "desert");
  for (let k = 0; k < 4; k++) assert.equal(w.buyAnimal("lyst", e.id), "");
  assert.equal(w.place("bench", ex + 1, 46), "");
  assert.equal(w.place("bin", ex - 1, 46), "");
  w.advance(200);
  const s = w.state, gst = s.guests.find(x => x.plan === "watch" || x.plan === "leave" || x.plan === "use") || s.guests[0];
  assert.ok(gst, "a guest is in the park");
  gst.tired = 100; gst.litter = 71; gst.fun = 50; gst.hunger = 0; gst.bladder = 0;
  gst.path = []; gst.plan = ""; gst.t = 0; gst.until = s.clock + 300;   // decide afresh
  const seen = new Set(gst.plan === "use" ? [gst.use] : []);   // it may already be on its way to a stand
  for (let k = 0; k < 120 && s.guests.includes(gst); k++) { w.advance(1); if (gst.plan === "use") seen.add(gst.use); }
  assert.ok(seen.has("tired") && seen.has("litter"), "the guest used the bench and the bin");
  assert.equal(s.litter, 0, "nothing hit the path");
  // With no bin the rubbish ends up on the path.
  assert.equal(w.bulldoze([[ex - 1, 46]]), "");
  w.advance(30);
  const g2 = s.guests.find(x => x !== gst);
  assert.ok(g2, "another guest is in the park");
  g2.litter = 71; g2.path = []; g2.plan = ""; g2.t = 0; g2.until = s.clock + 300;
  w.advance(2);
  assert.ok(s.litter > 0 && g2.litter === 0, "with no bin it ends up on the path");
  assert.equal(deserialize(serialize(s)).litter, s.litter);
});

test("a dangerous animal tests a weak fence and breaks out", () => {
  const { w, e } = buildPark("hedge");
  w.setBiome(e.id, "desert");
  w.spawn("dime", e.id);
  w.advance(720 * 2);
  assert.ok(w.state.bell.some(n => /testing the fence/.test(n.text)), "the bell warns first");
  assert.ok(w.state.animals[0].escaped, "Dimetrodon (danger 3) gets through a hedge (tier 1)");
});

test("keepers feed a dangerous pen only through a chute", () => {
  const { w, e, ex } = buildPark("concrete");
  w.setBiome(e.id, "desert");
  w.spawn("dime", e.id);
  w.hire("keeper");
  w.advance(180);
  const job = w.state.jobs.find(j => j.kind === "feed");
  assert.ok(job && job.why === "No feeding chute.", "no chute: the job says why");
  w.paint("chute", [[ex - 9, 39]]);
  w.advance(240);
  assert.ok((e.food.meat || 0) > 0 || w.state.books.today.eaten.meat > 0, "fed through the chute");
  assert.ok(!w.state.animals[0].escaped, "concrete holds Dimetrodon");
});

test("save and load round-trip", () => {
  const { w, e } = buildPark();
  w.buyAnimal("lyst", e.id);
  w.advance(100);
  const text = serialize(w.state);
  const w2 = new World(deserialize(text));
  assert.equal(w2.state.exhibits.length, 1);
  assert.equal(w2.state.animals.length, 1);
  assert.equal(w2.state.grid.struct[idx(w2.state.grid, Math.floor(w2.state.grid.w / 2), 40)], S_PATH);
  assert.deepEqual(w2.derived.ex.get(e.id).tiles.length, w.derived.ex.get(e.id).tiles.length);
  w2.advance(100);
});

test("a guard darts an escaped animal: back home if the pen is closed again, else a crate", () => {
  const { w, e } = buildPark("hedge");
  w.setBiome(e.id, "desert");
  w.spawn("dime", e.id);
  w.hire("guard");
  for (let k = 0; k < 40 && !w.state.animals[0].escaped; k++) w.advance(60);
  const a = w.state.animals[0];
  assert.ok(a.escaped, "it got out");
  for (let k = 0; k < 24 && a.escaped; k++) w.advance(30);
  assert.ok(!a.escaped, "the guard caught it");
  assert.ok(a.crated, "the pen is still open, so it's in a crate");
  assert.ok(w.state.bell.some(n => /in a crate/.test(n.text)));
  // Close the gap with concrete and release it.
  const gap = []; const g = w.state.grid;
  for (let i = 0; i < g.struct.length; i++) if (g.ex[i] === e.id && !w.derived.exOf[i] && g.struct[i] === 0) {
    const x = i % g.w, y = (i / g.w) | 0;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.derived.exOf[(y + dy) * g.w + x + dx] === 0 && g.ex[(y + dy) * g.w + x + dx] !== e.id)) gap.push([x, y]);
  }
  assert.equal(w.paint("fence:concrete", gap), "");
  assert.ok(w.state.exhibits.some(x => x.id === e.id), "closing the gap brings the exhibit back");
  assert.equal(w.release(a.id, e.id), "");
  assert.ok(!a.crated && a.ex === e.id);
});

test("guests run from a loose predator", () => {
  const { w, e } = buildPark("hedge");
  w.setBiome(e.id, "desert");
  w.spawn("dime", e.id);
  w.advance(200);
  const a = w.state.animals[0];
  a.escaped = true; a.ex = 0;
  const gst = w.state.guests[0];
  if (gst) { gst.x = a.x + 1; gst.y = a.y; w.advance(1); assert.ok(gst.panic, "a guest next to it panics"); }
});

test("bulldoze takes what's on the tiles and gives a share back", () => {
  const { w, e, ex } = buildPark();
  const g = w.state.grid, money = () => w.state.money;
  // A path tile: 25% of its price.
  let m0 = money();
  assert.equal(w.bulldoze([[ex, 45]]), "");
  assert.equal(g.struct[idx(g, ex, 45)], 0);
  assert.equal(money() - m0, Math.round(10 * 0.25));
  // A tap on a gate takes the gate and leaves the wall.
  m0 = money();
  assert.equal(w.bulldoze([[ex - 12, 39]]), "");
  assert.equal(g.struct[idx(g, ex - 12, 39)], 2, "the fence stays");
  assert.equal(w.derived.ex.get(e.id).gates.length, 0);
  assert.equal(money() - m0, Math.round(50 * 0.25));
  // Any tile of a building takes all of it.
  const shed = w.state.buildings.find(b => b.type === "shed");
  const plan = w.bulldozePlan([[shed.x + 1, shed.y + 1]]);
  assert.equal(plan.ask, "Bulldoze Food Shed?", "the shed asks first");
  assert.equal(w.planTiles(plan).length, 4);
  assert.equal(w.bulldoze([[shed.x + 1, shed.y + 1]]), "");
  assert.ok(!w.state.buildings.includes(shed));
  assert.equal(g.struct[idx(g, shed.x, shed.y)], 0);
  // A box over water dries it.
  assert.equal(w.bulldoze(line(ex - 16, 30, ex - 14, 32)), "");
  assert.equal(w.derived.ex.get(e.id).shallow, 0);
  // The entrance stays; empty ground says so.
  const ent = w.state.buildings.find(b => b.type === "entrance");
  assert.equal(w.bulldoze([[ent.x, ent.y]]), "Can't remove that.");
  assert.equal(w.bulldoze([[2, 2]]), "Nothing to bulldoze.");
  assert.ok(w.state.books.today.sold > 0);
});

test("bulldozing a wall of a pen with animals asks first, then lets them out", () => {
  const { w, e, ex } = buildPark();
  assert.equal(w.bulldozePlan([[ex - 18, 33]]).ask, "", "an empty pen doesn't ask");
  w.buyAnimal("lyst", e.id);
  assert.equal(w.bulldozePlan([[ex - 18, 33]]).ask, `Open a gap in ${e.name}?`);
  assert.equal(w.bulldoze([[ex - 18, 33]]), "");
  assert.equal(w.state.exhibits.length, 0);
  assert.ok(w.state.animals[0].escaped, "it's loose");
});

test("guests walking over a bulldozed path pick a new way", () => {
  const { w, e, ex } = buildPark();
  w.setBiome(e.id, "desert");
  w.buyAnimal("lyst", e.id);
  w.advance(60);
  const g = w.state.grid, gst = w.state.guests.find(x => x.path.length);
  assert.ok(gst, "someone is walking");
  const [x, y] = [gst.path[0] % g.w, (gst.path[0] / g.w) | 0];
  w.bulldoze([[x, y]]);
  assert.ok(!gst.path.includes(idx(g, x, y)), "the route no longer crosses the gap");
  w.advance(60);
});

test("move takes a building to a new spot for free and keeps what it holds", () => {
  const { w, e, ex } = buildPark();
  const g = w.state.grid, shed = w.state.buildings.find(b => b.type === "shed"), money = w.state.money;
  shed.stock.meat = 77;
  assert.equal(w.moveBuilding(shed.id, ex + 6, 44), "");
  assert.equal(w.state.money, money, "moving is free");
  assert.equal(g.struct[idx(g, ex + 2, 42)], 0, "the old spot is clear");
  assert.equal(g.bld[idx(g, ex + 7, 45)], shed.id);
  assert.equal(shed.stock.meat, 77);
  assert.equal(w.moveBuilding(shed.id, ex + 6, 45), "", "it can overlap where it stood");
  assert.equal(w.moveBuilding(shed.id, ex, 44), "Something is in the way.", "not onto a path");
  assert.equal(w.moveBuilding(shed.id, ex - 12, 33), "Not inside an exhibit.");
  const feeder = w.state.buildings.find(b => b.type === "feeder");
  assert.equal(w.moveBuilding(feeder.id, ex - 15, 36), "");
  assert.equal(w.derived.ex.get(e.id).feeders.length, 1, "still the pen's feeder");
  assert.equal(w.moveBuilding(feeder.id, ex + 10, 50), "Feeders go inside an exhibit.");
  const ent = w.state.buildings.find(b => b.type === "entrance");
  assert.equal(w.moveBuilding(ent.id, 5, 5), "Can't move that.");
});

test("placeProblem says why place would refuse, without changing anything", () => {
  const w = newPark(12), before = w.state.money;
  assert.equal(w.placeProblem("shed", 5, 5), "");
  assert.equal(w.placeProblem("shed", -1, 5), "Off the map.");
  assert.equal(w.placeProblem("feeder", 5, 5), "Feeders go inside an exhibit.");
  w.state.money = 0;
  assert.equal(w.placeProblem("shed", 5, 5), "Not enough money.");
  w.state.money = before;
  assert.equal(w.place("research", 5, 5), "");
  assert.equal(w.placeProblem("research", 12, 5), "Only one a park.");
  assert.equal(w.placeProblem("shed", 5, 5), "Something is in the way.");
});

test("research: researchers on a track unlock its steps in order; deep steps wait for stars", () => {
  const w = newPark(11), sc = w.state.science;
  w.state.money = 1e6;
  assert.equal(w.paint("fence:stone", [[5, 30]]), "Not researched yet.");
  assert.equal(w.hireCrew("researcher"), "No Research Lab.");
  assert.equal(w.place("research", 5, 5), "");
  assert.equal(w.place("research", 12, 5), "Only one a park.");
  assert.equal(w.hireCrew("researcher"), "");
  assert.equal(w.assign("exhibits", 1), "");
  assert.equal(w.assign("exhibits", 1), "No idle researchers.");
  w.advance(stepMinutes(0) + 1);
  assert.ok(sc.done.includes("stone"), "first step done after its time");
  assert.equal(w.paint("fence:stone", [[5, 30]]), "");
  assert.equal(trackStep(w.state, "exhibits").step.id, "glass");
  sc.done.push("glass"); w.state.rating = 1;
  w.advance(stepMinutes(2) + 1);
  assert.ok(!sc.done.includes("aquarium"), "the Aquarium Wall waits for 2 stars");
  assert.ok(w.state.bell.some(n => /Research done: Stone Wall/.test(n.text)));
});

test("time travel to cloning: scout a site, collect the genome, clone, release", () => {
  const w = newPark(5), sc = w.state.science, site = siteById("texasred");
  w.state.money = 1e7;
  assert.equal(w.scout("texasred"), "No Time Travel Lab.");
  assert.equal(w.place("timetravel", 5, 5), "");
  assert.equal(sc.drones, 1, "the lab comes with a drone");
  assert.equal(w.scout("texasred"), "");
  assert.equal(w.scout("hellcreek"), "No free drone.");
  for (let k = 0; k < 12 && !sc.found.dime; k++) { w.advance(DAY_MIN * 2); if (!sc.found.dime) w.scout("texasred"); }
  assert.ok(sc.found.dime, "scouting discovered Dimetrodon");
  w.state.rating = 0.5;
  assert.equal(w.expedition("texasred", "dime"), "Needs 1 stars.");
  w.state.rating = 1.5;
  assert.ok(tripOdds(w.state, site, "dime") > 0.4 && tripOdds(w.state, site, "dime") < 0.9);
  for (let k = 0; k < 60 && (sc.genome.dime || 0) < 100; k++) { assert.equal(w.expedition("texasred", "dime"), ""); w.advance(DAY_MIN * 2); }
  assert.equal(sc.genome.dime, 100);
  assert.equal(w.expedition("texasred", "dime"), "Genome complete.");
  assert.equal(w.buyAnimal("dime", 0), "Clone it at the Genetics Lab.");
  assert.equal(w.clone("dime"), "No Genetics Lab.");
  assert.equal(w.place("genetics", 12, 5), "");
  assert.equal(w.clone("dime"), "No geneticists.");
  w.hireCrew("geneticist");
  assert.equal(w.clone("dime"), "");
  assert.equal(w.clone("dime"), "No free incubator.");
  w.advance(DAY_MIN * 3);
  const a = w.state.animals.find(x => x.sp === "dime");
  assert.ok(a && a.crated, "the clone waits in a crate");
  assert.ok(w.state.bell.some(n => /clone is ready/.test(n.text)));
});

test("the labs bill wages and upkeep every night", () => {
  const w = newPark(5);
  w.place("research", 5, 5); w.hireCrew("researcher");
  w.advance(DAY_MIN);
  assert.equal(w.state.books.last.wages, 3000 + 250 + 120, "hiring fee, a day of wages, a day of upkeep");
});

test("saves from before the labs keep the fences they built", () => {
  const { w } = buildPark("stone");
  delete w.state.science;
  const w2 = new World(deserialize(serialize(w.state)));
  assert.ok(w2.state.science.done.includes("stone"));
  assert.ok(!w2.state.science.done.includes("glass"));
});

test("every site shows on a map in its own period, and every map exists", async () => {
  const { epochsOf, sitesIn } = await import("../src/sim/science.js");
  const { PERIODS, TIMELINE_MAPS } = await import("../src/sim/data.js");
  const { existsSync } = await import("node:fs");
  for (const s of SITES) assert.ok(epochsOf(s.period).some(e => sitesIn(e).includes(s)), s.id + " shows in the " + s.period);
  for (const p of PERIODS) for (const e of epochsOf(p.id)) assert.ok(existsSync(new URL(`../art/timeline/${e.map}.png`, import.meta.url)), e.map);
  assert.equal(new Set(Object.values(TIMELINE_MAPS)).size, 16);
});

test("drones and incubators keep their numbers, and every trip leaves a report", async () => {
  const { yearsAt, uAt } = await import("../src/sim/science.js");
  const w = newPark(5), sc = w.state.science;
  w.state.money = 1e7; w.state.rating = 5;
  w.place("timetravel", 5, 5); w.buyDrone(); w.buyDrone();
  assert.equal(w.scout("texasred"), ""); assert.equal(w.scout("karoolate"), ""); assert.equal(w.scout("hellcreek"), "");
  assert.deepEqual(sc.trips.map(t => t.slot), [0, 1, 2]);
  sc.trips[1].end = 0;   // drone 2 lands first
  w.advance(1);
  assert.equal(sc.reports.length, 1); assert.equal(sc.reports[0].slot, 1);
  assert.equal(w.scout("burgess"), ""); assert.equal(sc.trips.find(t => t.site === "burgess").slot, 1, "the free drone flies it");
  assert.equal(w.dismissReport(sc.reports[0].id), ""); assert.equal(sc.reports.length, 0);
  // The slider maps back to the years it came from.
  for (const y of [500e6, 290e6, 66.5e6, 30000, 100]) assert.ok(Math.abs(yearsAt(uAt(y)).years / y - 1) < 1e-6, y + " years ago");
});

test("a bored animal plays with an enrichment log; without one boredom only grows", () => {
  const { w, e, ex } = buildPark();
  w.setBiome(e.id, "desert");
  const a = w.spawn("lyst", e.id);
  Object.assign(a.need, { hunger: 0, thirst: 0, rest: 0, enrich: 90 });
  w.advance(60);
  assert.ok(a.need.enrich > 90, "nothing to play with");
  assert.equal(w.place("log", ex - 8, 30), "");
  assert.equal(w.derived.ex.get(e.id).props.length, 1, "the pen counts the log");
  w.advance(120);   // time to walk over (animals amble) and play
  assert.ok(a.need.enrich < 60, "played with the log");
  assert.equal(w.placeProblem("log", 5, 5), "Enrichment Logs go inside an exhibit.");
});

test("a neglected animal gets stressed, sickly, and dies; a cared-for one stays healthy", () => {
  const { w, e } = buildPark();
  w.setBiome(e.id, "desert");
  const a = w.spawn("lyst", e.id);
  w.advance(DAY_MIN * 2);
  assert.ok(a.need.hunger < 90 && w.state.animals.length === 1, "two days without food: hungry, not starving yet");
  w.advance(DAY_MIN * 2);
  assert.ok(a.stress > 30, "hunger piles up into stress");
  assert.ok(a.health < 100, "starving costs health");
  for (let d = 0; d < 10 && w.state.animals.length; d++) w.advance(DAY_MIN);
  assert.ok(w.state.bell.some(n => /Lystrosaurus is sickly/.test(n.text)), "the bell warns first");
  assert.ok(w.state.bell.some(n => /Lystrosaurus has died/.test(n.text)));
  assert.equal(w.state.animals.length, 0);

  const park = buildPark();
  park.w.setBiome(park.e.id, "desert");
  for (let k = 0; k < 4; k++) park.w.buyAnimal("lyst", park.e.id);
  park.w.hire("keeper");
  park.w.advance(DAY_MIN * 3);
  for (const b of park.w.state.animals) assert.ok(b.health > 80, "fed animals stay healthy");
});

test("version 1 saves get enrichment, stress and health", () => {
  const { w, e } = buildPark();
  w.spawn("lyst", e.id);
  w.state.version = 1;
  for (const a of w.state.animals) { delete a.need.enrich; delete a.stress; delete a.health; }
  const w2 = new World(deserialize(serialize(w.state)));
  const a = w2.state.animals[0];
  assert.equal(w2.state.version, 2);
  assert.equal(a.health, 100);
  assert.equal(a.stress, 0);
  assert.equal(typeof a.need.enrich, "number");
  w2.advance(60);
});

test("boredom: small animals get sick, slower than starving; big ones attack the fence but it holds", () => {
  const { w, e } = buildPark();
  w.setBiome(e.id, "desert");
  for (let k = 0; k < 4; k++) w.buyAnimal("lyst", e.id);
  w.hire("keeper");
  w.advance(DAY_MIN * 5);
  const lyst = w.state.animals;
  assert.ok(lyst.every(a => a.need.enrich > 90), "no props: bored");
  assert.ok(lyst.every(a => a.health < 100 && a.health > 50), "a little sick, nowhere near dead");
  assert.ok(lyst.every(a => a.stress < 70), "boredom alone doesn't stress a fed herd out");

  const big = buildPark("concrete");
  big.w.setBiome(big.e.id, "desert");
  big.w.paint("chute", [[big.ex - 9, 39]]);
  const d = big.w.spawn("dime", big.e.id);
  big.w.hire("keeper");
  big.w.hire("mechanic");
  const g = big.w.state.grid, fences = big.w.derived.ex.get(big.e.id).fences;
  let lowest = 100;
  for (let h = 0; h < 48; h++) { big.w.advance(60); lowest = Math.min(lowest, ...fences.map(f => g.cond[f])); }
  assert.ok(big.w.state.bell.some(n => /Dimetrodon is attacking the fence/.test(n.text)));
  assert.ok(lowest < 100 - 4 * 0.4 * 4, "mauled tiles wear faster than the nightly wear alone");
  assert.equal(d.health, 100, "a big bored animal doesn't get sick");
  assert.ok(!d.escaped, "concrete, kept up, still holds");
});
