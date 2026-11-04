// The three lab panels, shown in the side panel when a lab building is selected. Names, numbers, meters, chips and
// buttons; every button is a world command. labAction returns the command's reason when it's refused.
import { SPECIES, PERIODS, TRACKS, BUILDINGS } from "../sim/data.js";
import { SCIENCE, DAY_MIN } from "../sim/config.js";
import { trackStep, trackWhy, stepMinutes, onTrack, crewOf, sitesShown, scoutProblem, expeditionProblem, scoutCost, expeditionCost,
         tripOdds, nextDronePrice, genomeOf, cloneProblem, incubators, nowMin, siteById } from "../sim/science.js";

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => "$" + Math.round(n).toLocaleString("en-US");
const meter = (share, cls = "") => `<span class="meter ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, share)) * 100)}%"></i></span>`;
const chip = (text, k = "") => `<span class="chip ${k}">${esc(text)}</span>`;
const btn = (label, data, why = "") => `<button ${data}${why ? ` disabled title="${esc(why)}"` : ""}>${esc(label)}</button>`;
const daysLeft = (state, end) => { const d = (end - nowMin(state)) / DAY_MIN; return d < 1 ? `${Math.max(1, Math.round(d * 12))} h left` : `${d.toFixed(1)} days left`; };
const mya = y => y >= 1e6 ? +(y / 1e6).toFixed(y >= 1e7 ? 0 : 1) : y;
const ago = s => `${mya(s.from)}–${mya(s.to)} million years ago`;
const head = (name, wide) => `<div class="row"><h3>${esc(name)}</h3><button data-close>✕</button></div>`;
const crewRow = (state, role, label) => {
  const c = SCIENCE.crew[role], n = crewOf(state, role).length;
  return `<div class="row"><span>${label} <b>${n}</b></span><span class="muted">${money(c.wage)}/day each</span></div>
    <div class="row btns">${btn("Let go", `data-fire="${role}"`, n ? "" : "Nobody to let go.")}${btn(`Hire ${money(c.hire)}`, `data-hire-crew="${role}"`, state.money < c.hire ? "Not enough money." : "")}</div>`;
};

function researchHtml(ui, state) {
  const idle = crewOf(state, "researcher").filter(c => !c.track).length;
  const tracks = Object.entries(TRACKS).map(([id, t]) => {
    const at = trackStep(state, id), why = trackWhy(state, id), n = onTrack(state, id);
    if (!at) return `<h4>${esc(t.name)}</h4><div class="row"><span class="muted">All ${t.steps.length} steps done.</span>${chip("Done", "good")}</div>`;
    const prog = (state.science.tracks[id]?.prog || 0) / stepMinutes(at.i), left = (stepMinutes(at.i) - (state.science.tracks[id]?.prog || 0)) / Math.max(1, n) / DAY_MIN;
    return `<h4>${esc(t.name)}</h4>
      <div class="row"><span><b>${esc(at.step.name)}</b> <span class="muted">${at.i + 1} of ${t.steps.length}</span></span><span>${why ? chip(why, "bad") : `<span class="muted">${left.toFixed(1)} days</span>`}</span></div>
      <div class="row">${meter(prog)}<span>${btn("−", `data-assign="${id}" data-d="-1"`, n ? "" : " ")} <b>${n}</b> ${btn("+", `data-assign="${id}" data-d="1"`, idle ? "" : "No idle researchers.")}</span></div>
      <div class="muted small">${t.steps.slice(0, at.i).map(st => "✓ " + esc(st.name)).join(" · ")}</div>`;
  }).join("");
  return head("Research Lab") + crewRow(state, "researcher", "Researchers") + `<div class="row"><span>Idle</span><b>${idle}</b></div>` + tracks;
}

function timeTravelHtml(ui, state) {
  const sc = state.science, shown = sitesShown();
  if (!ui.ttPeriod || !PERIODS.some(p => p.id === ui.ttPeriod)) ui.ttPeriod = (shown[0] || {}).period || PERIODS[0].id;
  const price = nextDronePrice(state), full = sc.drones >= SCIENCE.drones.max;
  const trips = sc.trips.map(t => { const site = siteById(t.site), what = t.kind === "scout" ? `Scouting ${sc.seen[site.id] ? site.name : "a " + site.period + " site"}` : `${SPECIES[t.sp].name} at ${site.name}`;
    return `<div class="row"><span>${esc(what)}</span><span class="muted">${daysLeft(state, t.end)}</span></div><div class="row">${meter((nowMin(state) - t.start) / (t.end - t.start))}</div>`; }).join("");
  const bar = PERIODS.map(p => { const n = shown.filter(s => s.period === p.id).length;
    return `<button class="per${n ? " has" : ""}" data-period="${p.id}" aria-pressed="${p.id === ui.ttPeriod}" title="${esc(p.id + ", " + p.ago)}">${esc(p.id.slice(0, 3))}${n ? `<i>${"•".repeat(n)}</i>` : ""}</button>`; }).join("");
  const per = PERIODS.find(p => p.id === ui.ttPeriod);
  const sites = shown.filter(s => s.period === per.id).map(s => {
    const seen = !!sc.seen[s.id], why = scoutProblem(state, s);
    const fauna = s.fauna.filter(sp => SPECIES[sp]).map(sp => {
      if (!seen || !sc.found[sp]) return seen ? `<div class="row"><span class="muted">Undiscovered species</span></div>` : "";
      const g = genomeOf(state, sp), w = expeditionProblem(state, s, sp);
      return `<div class="row"><span><b>${esc(SPECIES[sp].name)}</b> <span class="muted">${g >= 100 ? "" : Math.round(tripOdds(state, s, sp) * 100) + "% success"}</span></span><span>${Math.floor(g)}%</span></div>
        <div class="row">${meter(g / 100)}${g >= 100 ? chip("Genome complete", "good") : w && !/money|drone|already/i.test(w) ? chip(w, "bad") : btn(`Expedition ${money(expeditionCost(s, sp))}`, `data-dig="${s.id}" data-sp="${sp}"`, w)}</div>`;
    }).join("");
    const complete = why === "Site complete.";
    return `<div class="card"><div class="row"><b>${esc(seen ? s.name : "Unscouted site")}</b>${complete ? chip("Site complete", "good") : btn(`Scout ${money(scoutCost(s))}`, `data-scout="${s.id}"`, why)}</div>
      <div class="muted">${seen ? esc(s.where) + " · " : ""}${esc(ago(s))}</div>${fauna}</div>`;
  }).join("") || `<p class="muted">No sites.</p>`;
  return head("Time Travel Lab") + `<div class="row"><span>Drones <b>${sc.drones}</b> <span class="muted">${sc.trips.length} out</span></span>${full ? chip("Bay full") : btn(`Buy drone ${money(price)}`, "data-drone", state.money < price ? "Not enough money." : "")}</div>
    ${trips}<h4>Timeline</h4><div class="perbar">${bar}</div><div class="row"><b>${esc(per.id)}</b><span class="muted">${esc(per.ago)}</span></div>${sites}`;
}

function geneticsHtml(ui, state) {
  const sc = state.science, inc = incubators(state);
  const growing = sc.clones.map(c => `<div class="row"><span>${esc(SPECIES[c.sp].name)}</span><span class="muted">${daysLeft(state, c.end)}</span></div><div class="row">${meter((nowMin(state) - c.start) / (c.end - c.start))}</div>`).join("");
  const lib = Object.keys(SPECIES).filter(sp => sc.found[sp] || genomeOf(state, sp) > 0).map(sp => {
    const g = genomeOf(state, sp), why = cloneProblem(state, sp);
    return `<div class="row"><span><b>${esc(SPECIES[sp].name)}</b> <span class="muted">${esc(SPECIES[sp].period)}</span></span><span>${Math.floor(g)}%</span></div>
      <div class="row">${meter(g / 100)}${g < 100 ? chip("Genome incomplete") : btn(`Clone ${money(SPECIES[sp].price)}`, `data-clone="${sp}"`, why)}</div>`;
  }).join("") || `<p class="muted">No genomes yet.</p>`;
  return head("Genetics Lab") + crewRow(state, "geneticist", "Geneticists") + `<div class="row"><span>Incubators</span><b>${sc.clones.length} of ${inc} busy</b></div>`
    + (growing ? `<h4>Growing</h4>${growing}` : "") + `<h4>Genomes</h4>${lib}`;
}

export function labHtml(ui, b) {
  const lab = BUILDINGS[b.type].lab, state = ui.world.state;
  return lab === "research" ? researchHtml(ui, state) : lab === "timetravel" ? timeTravelHtml(ui, state) : geneticsHtml(ui, state);
}
// A click in a lab panel. Returns the refusal, or "" (also for clicks that aren't lab buttons).
export function labAction(ui, b) {
  const w = ui.world, d = b.dataset;
  if (d.period) { ui.ttPeriod = d.period; return ""; }
  if (d.hireCrew) return w.hireCrew(d.hireCrew);
  if (d.fire) return w.fireCrew(d.fire);
  if (d.assign) return w.assign(d.assign, Number(d.d));
  if (d.drone !== undefined) return w.buyDrone();
  if (d.scout) return w.scout(d.scout);
  if (d.dig) return w.expedition(d.dig, d.sp);
  if (d.clone) return w.clone(d.clone);
  return "";
}
