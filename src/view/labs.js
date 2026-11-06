// The three lab panels, after v1's: they open full size over the map (#side.full) with their sections in two columns
// (fullCols), one under the other on narrow screens. Names, numbers, meters, chips and buttons; every button is a world
// command, and labAction returns the command's reason when it's refused. Bars that move with the clock (research, trips,
// clones) are filled in place by labLive, so the panel's HTML only changes when something happens.
import { SPECIES, PERIODS, TRACKS, BUILDINGS, FENCES, PERIOD_COLOR, TIMELINE_MAP_SIZE } from "../sim/data.js";
import { SCIENCE, DAY_MIN } from "../sim/config.js";
import { trackStep, trackWhy, stepMinutes, onTrack, crewOf, sitesShown, scoutProblem, expeditionProblem, scoutCost, expeditionCost,
         tripOdds, nextDronePrice, genomeOf, cloneProblem, cloneMinutes, incubators, nowMin, siteById, sitesIn, siteComplete, siteTripDays,
         EPOCHS, epochOf, yearsAt, uAt } from "../sim/science.js";

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => "$" + Math.round(n).toLocaleString("en-US");
const meter = (share, live = "") => `<span class="meter"${live ? ` data-p="${live}"` : ""}><i style="width:${Math.round(Math.max(0, Math.min(1, share)) * 100)}%"></i></span>`;
const chip = (text, k = "") => `<span class="chip ${k}">${esc(text)}</span>`;
const btn = (label, data, why = "", cls = "buy") => `<button class="${cls}" ${data}${why ? ` disabled title="${esc(why)}"` : ""}>${esc(label)}</button>`;
const span = days => days < 1 ? `${Math.max(1, Math.round(days * DAY_MIN / 60))} h` : `${+days.toFixed(1)} day${+days.toFixed(1) === 1 ? "" : "s"}`;
const LOCK = `<svg width="10" height="11" viewBox="0 0 10 11" aria-label="locked"><rect x="1" y="5" width="8" height="6" rx="1" fill="currentColor"/><path d="M3 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>`;
const tabBar = (key, items, cur) => `<div class="ptabs" role="tablist">${items.map(t =>
  `<button role="tab" class="ptab" data-tab="${key}" data-k="${esc(t.key)}" aria-selected="${t.key === cur}" style="--pc:${t.color || "#4B3A8C"}"${t.lock ? ` title="Locked"` : ""}>${t.lock ? LOCK : ""}${esc(t.label)}</button>`).join("")}</div>`;
// Two columns side by side when the panel is full size, one under the other on narrow screens.
const fullCols = (left, right, wide) => `<div class="fcols${wide ? " wide" : ""}"><div class="fcol">${left}</div><div class="fcol">${right}</div></div>`;
const head = (state, type) => `<div class="row"><h2>${esc(BUILDINGS[type].name)}</h2><button class="xclose" data-close aria-label="Close">×</button></div>
  <div class="row"><span class="muted">${money(BUILDINGS[type].upkeep || 0)} a day</span></div>`;
const staffHtml = (state, role, plural) => {
  const c = SCIENCE.crew[role], n = crewOf(state, role).length;
  return `<section><h3>${plural} (${n})</h3><div class="row"><span class="muted">${money(c.wage)} a day each</span>
    <span class="btns">${btn("Let go", `data-fire="${role}"`, n ? "" : "Nobody to let go.", "")}${btn(`Hire ${money(c.hire)}`, `data-hire-crew="${role}"`, state.money < c.hire ? "Not enough money." : "")}</span></div></section>`;
};
// A bay card: its number, what's in it, a bar and the time left (both filled by labLive from `live`).
const bayCard = (label, title, sub, live, extra = "") => `<div class="card bay"><div class="bn">${esc(label)}</div><b>${title}</b>${sub ? ` <span class="muted">${sub}</span>` : ""}
  <div class="barline">${meter(0, live)}</div><div class="muted" data-left="${live}"></div>${extra}</div>`;
const emptyBay = (label, text) => `<div class="card bay empty"><span class="bn">${esc(label)}</span><span class="muted">${esc(text)}</span></div>`;

// ---- Research Lab ----
// What a step does, from its data.
const EFFECT_TEXT = {
  droneCut: v => `Expeditions come back empty ${Math.round(v * 100)}% less often.`,
  tripTime: v => `Trips take ${Math.round(v * 100)}% less time.`,
  cloneTime: v => `Clones grow ${Math.round(v * 100)}% faster.`,
  wearCut: v => `Fences wear ${Math.round(v * 100)}% slower.`,
};
function stepText(step) {
  const fence = Object.values(FENCES).find(f => f.tech === step.id);
  return [fence ? `Unlocks the ${fence.name} fence.` : "", ...Object.entries(step.effect || {}).map(([k, v]) => EFFECT_TEXT[k] ? EFFECT_TEXT[k](v) : "")].filter(Boolean).join(" ");
}
function researchHtml(ui, state) {
  const crew = crewOf(state, "researcher"), idle = crew.filter(c => !c.track).length, all = Object.values(TRACKS).flatMap(t => t.steps);
  const done = all.filter(st => state.science.done.includes(st.id)).length;
  let l = `<section><h3>Research</h3><div class="card"><b class="big">${done}</b> <span class="muted">of ${all.length} researched</span></div></section>`;
  l += staffHtml(state, "researcher", "Researchers");
  l += `<section><h3>Research bays (${crew.length - idle} of ${crew.length} busy)</h3>${crew.length ? crew.map((c, i) => {
    if (!c.track) return emptyBay(`Bay ${i + 1}`, "Idle");
    const at = trackStep(state, c.track);
    return bayCard(`Bay ${i + 1}`, esc(at ? at.step.name : TRACKS[c.track].name), esc(TRACKS[c.track].name), `track:${c.track}`,
      `<button class="small" data-unassign="${c.track}" data-id="${c.id}">Stop</button>`);
  }).join("") : `<div class="muted">No bays.</div>`}</section>`;
  if (!ui.rsTrack || !TRACKS[ui.rsTrack]) ui.rsTrack = Object.keys(TRACKS)[0];
  const id = ui.rsTrack, t = TRACKS[id], at = trackStep(state, id), n = onTrack(state, id);
  const rows = t.steps.map((st, i) => {
    const isDone = state.science.done.includes(st.id), now = at && at.i === i, later = at && i > at.i, why = now ? trackWhy(state, id) : "";
    let right;
    if (isDone) right = chip("Researched", "good");
    else if (now) right = btn(n ? "Add researcher" : "Research", `data-assign="${id}" data-d="1"`, idle ? "" : "No idle researchers.");
    else right = `<span class="muted">${span(stepMinutes(i) / DAY_MIN)}</span>`;
    const need = [esc(stepText(st)), later ? `Needs ${esc(t.steps[i - 1].name)} first.` : "", !isDone && st.stars ? `Needs ${st.stars}★.` : ""].filter(Boolean).join(" ");
    const prog = now ? `<span class="need">${meter(0, `track:${id}`)} <span data-left="track:${id}"></span>${why && why !== "No researchers." ? " " + chip(why, "bad") : ""}</span>` : "";
    return `<li class="${later ? "locked" : ""}"><span class="nm">${esc(st.name)}${now ? ` <span class="per">${i + 1} of ${t.steps.length}</span>` : ""}</span>${right}<span class="need">${need}</span>${prog}</li>`;
  }).join("");
  const r = `<section>${tabBar("track", Object.entries(TRACKS).map(([k, x]) => ({ key: k, label: x.name })), id)}
    <div class="ptab-body"><h3>${esc(t.name)}</h3><ul class="shop">${rows}</ul></div></section>`;
  return head(state, "research") + fullCols(l, r, true);
}

// ---- Time Travel Lab ----
const GT_LIT = "#D9FF00", GT_MARK = "#454646";
// "375 million years ago", "12,000 years ago": two significant figures under a million years, then millions.
function yearsAgo(y) {
  if (y >= 1e7) return `${Math.round(y / 1e6)} million years ago`;
  if (y >= 1e6) return `${+(y / 1e6).toFixed(1)} million years ago`;
  const step = Math.pow(10, Math.max(1, Math.floor(Math.log10(y)) - 1)), r = Math.round(y / step) * step;
  return r >= 1e6 ? "1 million years ago" : `${r.toLocaleString("en-US")} years ago`;
}
const siteWindow = s => s.to >= 1e6 ? `${+(s.from / 1e6).toFixed(1)} to ${+(s.to / 1e6).toFixed(1)} million years ago` : `${yearsAgo(s.from).replace(" ago", "")} to ${yearsAgo(s.to)}`;
const siteName = (state, s) => state.science.seen[s.id] ? s.name : "Unscouted site";
const markColor = (state, s) => state.science.seen[s.id] ? GT_LIT : GT_MARK;
// Where the slider opens: on the newest scouted site, else the newest one the park's rating can dig at, else the first.
function ttStart(state) {
  const shown = sitesShown(), sc = state.science;
  const s = shown.filter(x => sc.seen[x.id]).pop() || shown.filter(x => x.fauna.some(sp => SPECIES[sp] && SPECIES[sp].stars <= state.rating)).pop() || shown[0];
  return s ? uAt(Math.sqrt(s.from * s.to)) : 0.5;
}
function ttHeadHtml(now) {
  return `<b class="gt-epoch">${esc(now.epoch.name)}</b><div class="gt-ago">${yearsAgo(now.years)}</div>
    <div class="muted gt-period"><span class="dot" style="background:${PERIOD_COLOR[now.epoch.period]}"></span>${esc(now.epoch.period)}</div>`;
}
function ttMapHtml(ui, state, now) {
  const e = now.epoch, [W, H] = TIMELINE_MAP_SIZE;
  return `<svg class="gt-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of the Earth, ${esc(e.name)}"><image href="art/timeline/${e.map}.png" x="0" y="0" width="${W}" height="${H}"/>`
    + sitesIn(e).map(s => { const [x, y] = s.at[e.map];
      return `<g class="gt-site${ui.ttSite === s.id ? " on" : ""}" data-site="${s.id}"><rect class="gt-frame" x="${x - 2}" y="${y - 2}" width="6" height="6"/><rect x="${x}" y="${y}" width="2" height="2" fill="${markColor(state, s)}"/></g>`; }).join("")
    + `</svg>`;
}
function ttTrackHtml(ui, now) {
  return `<div class="gt-track" role="slider" tabindex="0" aria-label="Time" aria-valuemin="0" aria-valuemax="1000" aria-valuenow="${Math.round(ui.ttU * 1000)}" aria-valuetext="${esc(now.epoch.name + ", " + yearsAgo(now.years))}">
    <div class="gt-bars">${PERIODS.map(p => `<div class="gt-bar" title="${esc(p.id)}">${p.epochs.map((e, j) => `<i style="background:${j % 2 ? `color-mix(in srgb, ${PERIOD_COLOR[p.id]} 80%, black)` : PERIOD_COLOR[p.id]}"></i>`).join("")}</div>`).join("")}</div>
    <div class="gt-thumb" style="left:${ui.ttU * 100}%"></div></div>
    <div class="gt-labels">${PERIODS.map(p => `<span>${esc(p.id.slice(0, 3))}</span>`).join("")}</div>`;
}
function ttChipsHtml(ui, state, now) {
  return sitesIn(now.epoch).map(s => `<button class="gt-chip" data-site="${s.id}" aria-pressed="${ui.ttSite === s.id}"><i style="background:${markColor(state, s)}"></i>${esc(state.science.seen[s.id] ? s.name : `Unscouted site, ${yearsAgo(s.from)}`)}${siteComplete(state, s) ? ` <span class="gt-done">Site Complete</span>` : ""}</button>`).join("")
    || `<span class="muted">No sites in the ${esc(now.epoch.name)}.</span>`;
}
// One expedition target on a site card: pick it, its genome so far, and its chance of a find.
function targetRow(ui, state, s, sp) {
  const g = genomeOf(state, sp), lock = state.rating + 1e-9 < SPECIES[sp].stars, done = g >= 100;
  return `<tr class="${lock || done ? "locked" : ""}"><td><label><input type="radio" name="ttpick" data-pick="${sp}"${ui.ttPick === sp ? " checked" : ""}${lock || done ? " disabled" : ""}> ${esc(SPECIES[sp].name)}${lock ? ` <span class="gt-tag">Needs ${SPECIES[sp].stars}★</span>` : ""}</label></td>`
    + `<td>${Math.floor(g)}%</td><td>${done ? "–" : Math.round(tripOdds(state, s, sp) * 100) + "%"}</td></tr>`;
}
function ttCardHtml(ui, state) {
  const s = siteById(ui.ttSite), sc = state.science;
  if (!s) return `<div class="muted">Pick a site.</div>`;
  const trip = `${money(scoutCost(s))} · ${span(siteTripDays(state, s))}`, swhy = scoutProblem(state, s);
  const note = why => why ? `<div class="warn">${esc(why)}</div>` : "";
  if (!sc.seen[s.id]) return `<b class="gt-name">Unscouted site</b><div class="muted">Somewhere in the ${esc(epochOf(s.from).name)}</div>
    <dl class="kv"><dt>When</dt><dd>${siteWindow(s)}</dd><dt>Animals</dt><dd>Scout site first</dd><dt>Trip</dt><dd>${trip}</dd></dl>
    <div class="row btns">${btn("Send scouting trip", `data-scout="${s.id}"`, swhy)}</div>${note(swhy)}`;
  const fauna = s.fauna.filter(sp => SPECIES[sp]), targets = fauna.filter(sp => sc.found[sp]), hidden = fauna.length - targets.length;
  if (ui.ttPick && !targets.includes(ui.ttPick)) ui.ttPick = "";
  const dwhy = ui.ttPick ? expeditionProblem(state, s, ui.ttPick) : "Pick a target first.";
  return `<b class="gt-name">${esc(s.name)}${hidden ? "" : ` <span class="gt-badge">Site Complete</span>`}</b><div class="muted">${esc(s.where)}</div>
    <dl class="kv"><dt>When</dt><dd>${siteWindow(s)}</dd><dt>Trip</dt><dd>${trip}</dd></dl>
    <table class="gt-targets"><thead><tr><th>Target</th><th>Genome</th><th>Survey Success</th></tr></thead><tbody>${targets.map(sp => targetRow(ui, state, s, sp)).join("")}
    ${Array.from({ length: hidden }, () => `<tr class="locked"><td>Undiscovered species</td><td>?</td><td>?</td></tr>`).join("")}</tbody></table>
    <div class="row btns">${btn(ui.ttPick ? `Send expedition ${money(expeditionCost(s, ui.ttPick))}` : "Send expedition", `data-dig="${s.id}"${ui.ttPick ? ` data-sp="${ui.ttPick}"` : ""}`, dwhy)}${hidden ? btn("Send scouting trip", `data-scout="${s.id}"`, swhy) : ""}</div>
    ${note(ui.ttPick ? dwhy : hidden ? swhy : "")}`;
}
function droneCard(state, i) {
  const t = state.science.trips.find(x => x.slot === i);
  if (!t) return `<div class="card bay gt-drone"><div class="bn">Drone ${i + 1}</div><span class="muted">Ready</span></div>`;
  const s = siteById(t.site), what = t.kind === "scout" ? "Scouting for animals" : `Looking for ${esc(SPECIES[t.sp].name)}`;
  return bayCard(`Drone ${i + 1}`, esc(siteName(state, s)), esc(epochOf(s.from).name), `trip:${t.id}`).replace(`<div class="barline">`, `<div class="muted">${what}</div><div class="barline">`);
}
function reportHtml(state, r) {
  const s = siteById(r.site);
  return `<div class="gt-report" role="status"><div class="gt-rh">${r.kind === "scout" ? "Scouting" : "Expedition"} report · ${esc(s ? s.name : r.site)} · Drone ${r.slot + 1} · Day ${r.day}</div>
    <ul>${r.lines.map(([t, big]) => `<li${big ? ` class="big"` : ""}>${esc(t)}</li>`).join("")}</ul><button class="small" data-report="${r.id}">Done</button></div>`;
}
// The timeline's moving parts, redrawn in place while the slider is dragged so it keeps the pointer.
export function ttRefresh(ui, side) {
  const state = ui.world.state, now = yearsAt(ui.ttU), q = s => side.querySelector(s);
  if (ui.ttSite && !sitesIn(now.epoch).some(s => s.id === ui.ttSite)) { ui.ttSite = ""; ui.ttPick = ""; }
  if (q("#ttHead")) q("#ttHead").innerHTML = ttHeadHtml(now);
  if (q("#ttMap")) q("#ttMap").innerHTML = ttMapHtml(ui, state, now);
  if (q("#ttChips")) q("#ttChips").innerHTML = ttChipsHtml(ui, state, now);
  if (q("#ttCard")) q("#ttCard").innerHTML = ttCardHtml(ui, state);
  const tr = q(".gt-track");
  if (tr) { tr.querySelector(".gt-thumb").style.left = ui.ttU * 100 + "%"; tr.setAttribute("aria-valuenow", Math.round(ui.ttU * 1000)); tr.setAttribute("aria-valuetext", `${now.epoch.name}, ${yearsAgo(now.years)}`); }
  // The panel now shows what labHtml would draw, so the refresh loop leaves it (and the slider's focus) alone.
  const b = state.buildings.find(b => b.id === ui.selectedBld);
  if (b) ui.lastPanel = labHtml(ui, b);
  labLive(ui, side);
}
function timeTravelHtml(ui, state) {
  const sc = state.science;
  if (ui.ttU === undefined) ui.ttU = ttStart(state);
  if (!["lab", "reports"].includes(ui.ttTab)) ui.ttTab = "lab";
  let h = head(state, "timetravel") + tabBar("tt", [{ key: "lab", label: "Lab" }, { key: "reports", label: `Reports${sc.reports.length ? ` (${sc.reports.length})` : ""}` }], ui.ttTab);
  if (ui.ttTab === "reports") return h + (sc.reports.length ? `<section>${sc.reports.map(r => reportHtml(state, r)).join("")}</section>` : `<div class="muted">No reports.</div>`);
  const price = nextDronePrice(state);
  const l = `<section class="gt-drones"><h3>Drones <span class="muted">${sc.drones} of ${SCIENCE.drones.max}</span></h3>${Array.from({ length: sc.drones }, (_, i) => droneCard(state, i)).join("")}
    <div class="row">${sc.drones < SCIENCE.drones.max ? btn(`Buy a drone ${money(price)}`, "data-drone", state.money < price ? "Not enough money." : "") : `<span class="muted">Drone bay full</span>`}</div></section>`;
  const now = yearsAt(ui.ttU);
  if (ui.ttSite && !sitesIn(now.epoch).some(s => s.id === ui.ttSite)) { ui.ttSite = ""; ui.ttPick = ""; }
  const r = `<section class="gt"><h3>Timeline</h3><div id="ttHead">${ttHeadHtml(now)}</div><div id="ttMap">${ttMapHtml(ui, state, now)}</div>${ttTrackHtml(ui, now)}
    <div id="ttChips" class="gt-chips">${ttChipsHtml(ui, state, now)}</div>
    <div class="muted small">Maps from the PALEOMAP PaleoDEMs: Scotese and Wright (2018), CC BY 4.0.</div></section>`;
  const c = `<section><div id="ttCard" class="card">${ttCardHtml(ui, state)}</div></section>`;
  return h + `<div class="fcols wide gt-cols"><div class="fcol">${l}</div><div class="fcol">${r}</div><div class="fcol">${c}</div></div>`;
}

// ---- Genetics Lab ----
function geneticsHtml(ui, state) {
  const sc = state.science, crates = state.animals.filter(a => a.crated);
  if (!["clone", "crates"].includes(ui.gnTab)) ui.gnTab = "clone";
  const h = head(state, "genetics") + tabBar("gn", [{ key: "clone", label: "Cloning" }, { key: "crates", label: `Crates${crates.length ? ` (${crates.length})` : ""}` }], ui.gnTab);
  if (ui.gnTab === "crates") {
    const opts = state.exhibits.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join("");
    return h + `<section><h3>Crates <span class="muted">${crates.length}</span></h3>${crates.length ? `<ul class="shop">${crates.map(a => `<li><span class="nm"><span class="dot" style="background:${PERIOD_COLOR[SPECIES[a.sp].period]}"></span>${esc(SPECIES[a.sp].name)}</span>
      ${opts ? `<span class="btns"><select data-crate-ex="${a.id}">${opts}</select>${btn("Release", `data-release-crate="${a.id}"`)}</span>` : `<span class="muted">No exhibits.</span>`}</li>`).join("")}</ul>` : `<div class="muted">No crates waiting.</div>`}</section>`;
  }
  const inc = incubators(state);
  let l = staffHtml(state, "geneticist", "Geneticists");
  l += `<section><h3>Incubator bays (${sc.clones.length} of ${inc} busy)</h3>${inc ? Array.from({ length: inc }, (_, i) => {
    const c = sc.clones.find(x => x.slot === i);
    return c ? bayCard(`Bay ${i + 1}`, esc(SPECIES[c.sp].name), esc(SPECIES[c.sp].period), `clone:${c.id}`) : emptyBay(`Bay ${i + 1}`, "Empty");
  }).join("") : `<div class="muted">No bays.</div>`}</section>`;
  const lib = Object.keys(SPECIES).filter(sp => sc.found[sp] || genomeOf(state, sp) > 0);
  let r = `<section><h3>Genome library</h3>`;
  if (!lib.length) r += `<div class="muted">No genomes yet.</div>`;
  else {
    const has = p => lib.some(sp => SPECIES[sp].period === p);
    if (!ui.gnPeriod || !has(ui.gnPeriod)) ui.gnPeriod = PERIODS.map(p => p.id).find(has);
    r += tabBar("gnp", PERIODS.map(p => ({ key: p.id, label: p.id, color: PERIOD_COLOR[p.id], lock: !has(p.id) })), ui.gnPeriod);
    r += `<ul class="shop">${lib.filter(sp => SPECIES[sp].period === ui.gnPeriod).map(sp => {
      const g = genomeOf(state, sp), s = SPECIES[sp], why = cloneProblem(state, sp);
      return `<li><span class="nm"><span class="dot" style="background:${PERIOD_COLOR[s.period]}"></span>${esc(s.name)}</span>
        ${g >= 100 ? btn(`Clone ${money(s.price)}`, `data-clone="${sp}"`, why) : `<span class="muted">${Math.floor(g)}%</span>`}
        <span class="need">${meter(g / 100)} ${g >= 100 ? `Genome complete · ${span(cloneMinutes(state, sp) / DAY_MIN)}` : `${Math.floor(g)}% genome`}</span></li>`;
    }).join("")}</ul>`;
  }
  r += `</section>`;
  return h + fullCols(l, r, true);
}

export function labHtml(ui, b) {
  const lab = BUILDINGS[b.type].lab, state = ui.world.state;
  return lab === "research" ? researchHtml(ui, state) : lab === "timetravel" ? timeTravelHtml(ui, state) : geneticsHtml(ui, state);
}

// Fill the moving bars and times: data-p / data-left name "track:<id>", "trip:<id>" or "clone:<id>".
export function labLive(ui, side) {
  const state = ui.world.state, sc = state.science, now = nowMin(state);
  const timed = x => x && [(now - x.start) / (x.end - x.start), (x.end - now) / DAY_MIN];
  const of = key => {
    const [k, id] = key.split(":");
    if (k === "trip") { const t = timed(sc.trips.find(x => x.id === +id)); return t && [t[0], `Back in ${span(t[1])}`]; }
    if (k === "clone") { const t = timed(sc.clones.find(x => x.id === +id)); return t && [t[0], `${Math.round(t[0] * 100)}% · ${span(t[1])} left`]; }
    const at = trackStep(state, id); if (!at) return null;
    const prog = sc.tracks[id]?.prog || 0, n = onTrack(state, id), full = stepMinutes(at.i);
    return [prog / full, n ? `${n} on it · ${span((full - prog) / n / DAY_MIN)} left` : `${Math.round(prog / full * 100)}% done`];
  };
  for (const el of side.querySelectorAll("[data-p]")) { const v = of(el.dataset.p); if (v) el.firstElementChild.style.width = Math.round(Math.max(0, Math.min(1, v[0])) * 100) + "%"; }
  for (const el of side.querySelectorAll("[data-left]")) { const v = of(el.dataset.left); if (v && el.textContent !== v[1]) el.textContent = v[1]; }
}

// A click in a lab panel. Returns the refusal, or "" (also for clicks that aren't lab controls).
export function labAction(ui, el) {
  const w = ui.world, d = el.dataset;
  if (d.tab) { ({ track: () => ui.rsTrack = d.k, tt: () => ui.ttTab = d.k, gn: () => ui.gnTab = d.k, gnp: () => ui.gnPeriod = d.k })[d.tab](); return ""; }
  if (d.site) { if (d.site !== ui.ttSite) ui.ttPick = ""; ui.ttSite = d.site; return ""; }
  if (d.pick) { ui.ttPick = d.pick; return ""; }
  if (d.hireCrew) return w.hireCrew(d.hireCrew);
  if (d.fire) return w.fireCrew(d.fire);
  if (d.assign) return w.assign(d.assign, Number(d.d));
  if (d.unassign) return w.assign(d.unassign, -1, Number(d.id));
  if (d.drone !== undefined) return w.buyDrone();
  if (d.scout) return w.scout(d.scout);
  if (d.dig) { const why = d.sp ? w.expedition(d.dig, d.sp) : "Pick a target first."; if (!why) ui.ttPick = ""; return why; }
  if (d.report) return w.dismissReport(Number(d.report));
  if (d.clone) return w.clone(d.clone);
  if (d.releaseCrate) { const sel = el.parentElement.querySelector("select"); return w.release(Number(d.releaseCrate), Number(sel && sel.value)); }
  return "";
}

// The slider (drag, keys) and taps on the map (the nearest marker within 14 map pixels). Bound once on #side.
export function labBind(ui, side) {
  side.addEventListener("pointerdown", ev => {
    const tr = ev.target.closest(".gt-track"); if (!tr) return;
    const go = x => { const r = tr.getBoundingClientRect(); ui.ttU = Math.max(0, Math.min(1, (x - r.left) / r.width)); ttRefresh(ui, side); };
    try { tr.setPointerCapture(ev.pointerId); } catch { /* not a live pointer */ } tr.focus(); ui.holdPanel = true; go(ev.clientX);
    const mv = e => go(e.clientX), up = () => { tr.removeEventListener("pointermove", mv); tr.removeEventListener("pointerup", up); tr.removeEventListener("pointercancel", up); ui.holdPanel = false; };
    tr.addEventListener("pointermove", mv); tr.addEventListener("pointerup", up); tr.addEventListener("pointercancel", up);
  });
  side.addEventListener("keydown", ev => {
    const tr = ev.target.closest(".gt-track"); if (!tr) return;
    const e = yearsAt(ui.ttU).epoch, i = EPOCHS.indexOf(e), slice = 1 / PERIODS.length / PERIODS[e.pi].epochs.length;
    const jump = k => { const t = EPOCHS[Math.max(0, Math.min(EPOCHS.length - 1, i + k))]; return (t.pi + (t.ej + 0.5) / PERIODS[t.pi].epochs.length) / PERIODS.length; };
    const to = { ArrowLeft: ui.ttU - slice / 20, ArrowDown: ui.ttU - slice / 20, ArrowRight: ui.ttU + slice / 20, ArrowUp: ui.ttU + slice / 20, PageDown: jump(-1), PageUp: jump(1), Home: 0, End: 1 }[ev.key];
    if (to === undefined) return;
    ev.preventDefault(); ui.ttU = Math.max(0, Math.min(1, to)); ttRefresh(ui, side);
  });
  side.addEventListener("click", ev => {
    const svg = ev.target.closest(".gt-map"); if (!svg) return;
    const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(svg.getScreenCTM().inverse());
    let best = null, bd = 14;
    for (const g of svg.querySelectorAll(".gt-site")) { const r = g.querySelector(".gt-frame"), dd = Math.hypot(+r.getAttribute("x") + 3 - pt.x, +r.getAttribute("y") + 3 - pt.y); if (dd < bd) { bd = dd; best = g; } }
    if (best) { if (best.dataset.site !== ui.ttSite) ui.ttPick = ""; ui.ttSite = best.dataset.site; ttRefresh(ui, side); }
  });
}
