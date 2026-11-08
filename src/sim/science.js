// The three labs. The Research Lab's researchers work down research tracks; the Time Travel Lab's drones scout fossil
// sites (discovering their animals) and fly expeditions that fill genomes; the Genetics Lab's geneticists clone an animal
// once its genome is complete, and the clone arrives in a crate. Everything is timed in park minutes and finishes the
// minute it's due. No DOM; world.js wraps the commands.
import { DAY_MIN, SCIENCE } from "./config.js";
import { SPECIES, SITES, PERIODS, TRACKS, BUILDINGS, TIMELINE_FLOOR, TIMELINE_MAPS } from "./data.js";
import { newAnimal, crateBeside } from "./animals.js";
import { rand, chance } from "./rng.js";
import { afford } from "./money.js";

export const newScience = () => ({
  done: [], tracks: {}, crew: [], drones: 0, seen: {}, found: {}, genome: {}, trips: [], clones: [], reports: [],
});
const REPORTS_KEPT = 12;

// Park minutes since day 1 began: the clock every job is stamped with.
export const nowMin = state => (state.day - 1) * DAY_MIN + state.clock;
const lerp = (a, b, t) => a + (b - a) * t;
const period = id => PERIODS.find(p => p.id === id);
export const siteById = id => SITES.find(s => s.id === id);
export const sitesShown = () => SITES.filter(s => s.fauna.some(sp => SPECIES[sp]));
// Every epoch, oldest first: {name, from, to (years ago), period, pi (period index), ej (epoch index in its period), map}.
// Each ends where the next begins, the last at TIMELINE_FLOOR.
export const EPOCHS = PERIODS.flatMap((p, pi) => p.epochs.map(([name, from], ej) => ({ name, from, period: p.id, pi, ej })))
  .map((e, i, all) => ({ ...e, to: i + 1 < all.length ? all[i + 1].from : TIMELINE_FLOOR, map: TIMELINE_MAPS[e.name] || TIMELINE_MAPS[e.period] }));
export const epochsOf = periodId => EPOCHS.filter(e => e.period === periodId);
export const epochOf = years => EPOCHS.find(e => years <= e.from && years > e.to) || EPOCHS[EPOCHS.length - 1];
// The timeline slider: u from 0 (the oldest) to 1 (today). One equal bar a period, split equally into its epochs,
// a log scale of years inside each epoch.
export function yearsAt(u) {
  u = Math.max(0, Math.min(1 - 1e-9, u));
  const n = PERIODS.length, pi = Math.floor(u * n), k = PERIODS[pi].epochs.length, f = (u * n - pi) * k, ej = Math.floor(f);
  const e = EPOCHS.find(x => x.pi === pi && x.ej === ej);
  return { years: e.from * Math.pow(e.to / e.from, f - ej), epoch: e };
}
export function uAt(years) {
  const e = epochOf(years), t = Math.log(years / e.from) / Math.log(e.to / e.from);
  return (e.pi + (e.ej + t) / PERIODS[e.pi].epochs.length) / PERIODS.length;
}
// The sites that show in an epoch: their window touches it, and the epoch's map has a marker for them.
export const sitesIn = ep => sitesShown().filter(s => s.from > ep.to && s.to < ep.from && s.at && s.at[ep.map]);

// ---- research ----
// The park has the stars for something (always, in sandbox mode).
export const hasStars = (state, n) => !!state.sandbox || state.rating + 1e-9 >= (n || 0);
export const hasTech = (state, id) => !id || state.science.done.includes(id);
// The sum of an effect over every finished step.
export function effect(state, key) {
  let n = 0;
  for (const t of Object.values(TRACKS)) for (const st of t.steps) if (st.effect && st.effect[key] && state.science.done.includes(st.id)) n += st.effect[key];
  return n;
}
// The step a track is on (null when it's finished), with its index.
export function trackStep(state, id) {
  const steps = TRACKS[id].steps, i = steps.findIndex(st => !state.science.done.includes(st.id));
  return i < 0 ? null : { step: steps[i], i };
}
// Park minutes the i-th step of a track takes with one researcher.
export const stepMinutes = i => SCIENCE.research.first * Math.pow(SCIENCE.research.growth, i) * DAY_MIN;
export const crewOf = (state, role) => state.science.crew.filter(c => c.role === role);
export const onTrack = (state, id) => state.science.crew.filter(c => c.role === "researcher" && c.track === id).length;
const labBuilt = (state, lab) => state.buildings.some(b => BUILDINGS[b.type].lab === lab);
// Why a track isn't moving, or "".
export function trackWhy(state, id) {
  const at = trackStep(state, id);
  if (!at) return "";
  if (!labBuilt(state, "research")) return "No Research Lab.";
  if (!hasStars(state, at.step.stars)) return `Needs ${at.step.stars} stars.`;
  if (!onTrack(state, id)) return "No researchers.";
  return "";
}

// ---- the Time Travel Lab ----
// 0 for the smallest animal, 1 for the largest, on a log scale of body length.
export function sizeOf(sp) {
  const [a, b] = SCIENCE.sizeLen, l = SPECIES[sp].len;
  return Math.max(0, Math.min(1, Math.log(l / a) / Math.log(b / a)));
}
// In sandbox mode (state.sandbox) trips, clones and research steps finish at once.
const tripDays = (state, p) => state.sandbox ? 0 : p.days * (1 - effect(state, "tripTime"));
export const siteTripDays = (state, site) => tripDays(state, period(site.period));
export const siteComplete = (state, site) => !!state.science.seen[site.id] && site.fauna.every(sp => !SPECIES[sp] || state.science.found[sp]);
export const scoutCost = site => period(site.period).trip;
export const expeditionCost = (site, sp) => Math.round(period(site.period).trip * lerp(...SCIENCE.costMul, sizeOf(sp)) / 10) * 10;
// Chance an expedition for sp at this site brings back genome.
export function tripOdds(state, site, sp) {
  const fail = (lerp(...SCIENCE.fail, sizeOf(sp)) + period(site.period).risk) * (1 - effect(state, "droneCut"));
  return Math.max(0, Math.min(1, 1 - fail));
}
export const freeDrones = state => state.science.drones - state.science.trips.length;
export const nextDronePrice = state => Math.round(SCIENCE.drones.price * Math.pow(SCIENCE.drones.growth, Math.max(0, state.science.drones - 1)));
export const isFound = (state, sp) => !!(state.science.found[sp] || SPECIES[sp].starter);
export const genomeOf = (state, sp) => state.science.genome[sp] || 0;

function tripProblem(state) {
  if (!labBuilt(state, "timetravel")) return "No Time Travel Lab.";
  if (freeDrones(state) < 1) return "No free drone.";
  return "";
}
export function scoutProblem(state, site) {
  if (!site) return "No such site.";
  const why = tripProblem(state); if (why) return why;
  if (state.science.trips.some(t => t.kind === "scout" && t.site === site.id)) return "A drone is already scouting it.";
  if (siteComplete(state, site)) return "Site complete.";
  if (!afford(state, scoutCost(site))) return "Not enough money.";
  return "";
}
export function expeditionProblem(state, site, sp) {
  if (!site || !site.fauna.includes(sp) || !SPECIES[sp]) return "No such animal there.";
  const why = tripProblem(state); if (why) return why;
  if (!state.science.seen[site.id] || !state.science.found[sp]) return "Not discovered here.";
  if (genomeOf(state, sp) >= 100) return "Genome complete.";
  if (!hasStars(state, SPECIES[sp].stars)) return `Needs ${SPECIES[sp].stars} stars.`;
  if (state.science.trips.some(t => t.kind === "dig" && t.sp === sp)) return "A drone is already on it.";
  if (!afford(state, expeditionCost(site, sp))) return "Not enough money.";
  return "";
}
// The lowest number (from 0) not in use: which drone flies a trip, which incubator grows a clone.
export const freeSlot = list => { let i = 0; while (list.some(x => x.slot === i)) i++; return i; };
export function sendTrip(state, kind, site, sp) {
  const p = period(site.period), start = nowMin(state), trips = state.science.trips;
  trips.push({ id: state.nextId++, kind, site: site.id, sp: sp || "", slot: freeSlot(trips), start, end: start + tripDays(state, p) * DAY_MIN });
}
// A trip's report waits in the Time Travel Lab until dismissed: lines are [text, big].
function report(state, t, lines) {
  const sc = state.science;
  sc.reports.unshift({ id: state.nextId++, kind: t.kind, site: t.site, slot: t.slot || 0, day: state.day, lines });
  sc.reports.length = Math.min(sc.reports.length, REPORTS_KEPT);
}

// A drone lands: scouting lights the site and may spot its animals; an expedition may bring back genome.
function land(state, bus, t) {
  const site = siteById(t.site), sc = state.science;
  if (t.kind === "scout") {
    const first = !sc.seen[site.id];
    sc.seen[site.id] = true;
    const spotted = site.fauna.filter(sp => SPECIES[sp] && !sc.found[sp] && chance(state, lerp(...SCIENCE.scoutFind, sizeOf(sp))));
    for (const sp of spotted) sc.found[sp] = true;
    const names = spotted.map(sp => SPECIES[sp].name).join(", "), left = site.fauna.filter(sp => SPECIES[sp] && !sc.found[sp]).length;
    report(state, t, [...spotted.map(sp => [`${SPECIES[sp].name} Discovered`, true]), ...(spotted.length ? [] : [["No new animals found."]]),
      ...(left ? [[`${left} still undiscovered.`]] : [["Site Complete", true]])]);
    bus.emit("notify", { text: names ? `${site.name}: ${names} discovered.` : first ? `${site.name} scouted. Nothing found yet.` : `${site.name}: nothing new found.` });
    return;
  }
  const s = SPECIES[t.sp];
  if (!chance(state, tripOdds(state, site, t.sp))) { report(state, t, [["Came back empty handed."]]); bus.emit("notify", { text: `${site.name}: came back empty handed.` }); return; }
  const avg = 100 / lerp(...SCIENCE.trips, sizeOf(t.sp)), gain = avg * (1 + (rand(state) * 2 - 1) * SCIENCE.spread);
  const before = genomeOf(state, t.sp), after = Math.min(100, before + gain);
  sc.genome[t.sp] = Math.round(after * 10) / 10;
  report(state, t, [[`${s.name} Sample Found`, true], [`Genome ${Math.floor(before)}% to ${Math.floor(after)}%.`], ...(after >= 100 ? [[`${s.name} Genome Complete`, true]] : [])]);
  bus.emit("notify", { text: after >= 100 ? `${s.name} genome complete.` : `${site.name}: ${s.name} sample found (${Math.floor(after)}%).` });
}

// ---- the Genetics Lab ----
export const incubators = state => labBuilt(state, "genetics") ? crewOf(state, "geneticist").length : 0;
export const cloneMinutes = (state, sp) => state.sandbox ? 0 : lerp(...SCIENCE.cloneDays, sizeOf(sp)) * (1 - effect(state, "cloneTime")) * DAY_MIN;
export function cloneProblem(state, sp) {
  const s = SPECIES[sp];
  if (!s) return "No such animal.";
  if (!labBuilt(state, "genetics")) return "No Genetics Lab.";
  if (genomeOf(state, sp) < 100) return "Genome incomplete.";
  if (state.science.clones.length >= incubators(state)) return crewOf(state, "geneticist").length ? "No free incubator." : "No geneticists.";
  if (!afford(state, s.price)) return "Not enough money.";
  return "";
}

// ---- the tick ----
// Runs every sim step: research moves along, drones land, clones hatch into crates.
export function scienceTick(state, bus, dt) {
  const sc = state.science, now = nowMin(state);
  for (const id of Object.keys(TRACKS)) {
    const at = trackStep(state, id);
    if (!at || trackWhy(state, id)) continue;
    const tr = (sc.tracks[id] = sc.tracks[id] || { prog: 0 });
    tr.prog += dt * onTrack(state, id);
    if (state.sandbox || tr.prog >= stepMinutes(at.i)) {
      tr.prog = 0; sc.done.push(at.step.id);
      bus.emit("notify", { text: `Research done: ${at.step.name}.` });
    }
  }
  for (const t of sc.trips.filter(t => t.end <= now)) { sc.trips = sc.trips.filter(x => x !== t); land(state, bus, t); }
  for (const c of sc.clones.filter(c => c.end <= now)) {
    sc.clones = sc.clones.filter(x => x !== c);
    const a = newAnimal(state, c.sp, 0);
    a.crated = true; crateBeside(state, a); state.animals.push(a);
    bus.emit("notify", { text: `${SPECIES[c.sp].name} clone is ready in a crate.` });
  }
}

// Wages and lab upkeep, paid every night.
export const scienceBill = state => state.science.crew.reduce((n, c) => n + SCIENCE.crew[c.role].wage, 0)
  + state.buildings.reduce((n, b) => n + (BUILDINGS[b.type].upkeep || 0), 0);
