// The HUD, the tool bar, the side panel and mouse/keyboard input. Every change goes through a world command;
// a refused command shows its reason in the tool bar.
import { TILE } from "./display.js";
import { FENCES, BIOMES, BUILDINGS, SPECIES } from "../sim/data.js";
import { DAY_MIN, STAFF } from "../sim/config.js";
import { habitatScore } from "../sim/habitat.js";
import { animalsIn } from "../sim/animals.js";
import { condition } from "../sim/exhibits.js";

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = id => document.getElementById(id);
const fmtMoney = n => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const fmtClock = c => { const h = Math.floor(c / 60) + 4, m = Math.floor(c % 60); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h % 24 < 12 ? "AM" : "PM"}`; };

// Tools: [id, label, kind]. kind: "rect" fills the dragged box, "ring" outlines it, "tile" is one tile, "place" a building.
const TOOLS = [
  ["select", "Select", "click"],
  ["path", "Path", "rect"],
  ...Object.entries(FENCES).map(([id, f]) => [`fence:${id}`, f.name, "ring"]),
  ["gate", "Gate", "tile"], ["chute", "Chute", "tile"],
  ["water:shallow", "Shallow", "rect"], ["water:deep", "Deep", "rect"],
  ["place:feeder", "Feeder", "place"], ["place:shed", "Food Shed", "place"], ["place:snack", "Snack Stand", "place"],
  ["erase", "Erase", "rect"], ["demolish", "Demolish", "click"],
];

export class UI {
  constructor(world, canvas, cam, hooks) {
    this.world = world; this.canvas = canvas; this.cam = cam; this.hooks = hooks;
    this.tool = "select"; this.drag = null; this.hover = null; this.preview = null; this.previewOk = true;
    this.selected = null; this.selectedEx = 0; this.speed = 1; this.lastPanel = "";
    this.buildTools(); this.bindInput();
  }
  get view() { return { preview: this.preview, previewOk: this.previewOk, hover: this.hover, selected: this.selected, selectedEx: this.selectedEx }; }

  say(why) { $("why").textContent = why || ""; clearTimeout(this.whyT); if (why) this.whyT = setTimeout(() => ($("why").textContent = ""), 2500); }

  buildTools() {
    const bar = $("tools");
    bar.innerHTML = TOOLS.map(([id, label]) => `<button data-tool="${id}" aria-pressed="${id === this.tool}">${esc(label)}</button>`).join("")
      + `<span class="sep"></span><button data-hire="keeper">Hire Keeper</button><button data-hire="mechanic">Hire Mechanic</button><button data-hire="guard">Hire Guard</button><span id="why"></span>`;
    bar.onclick = e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.tool) { this.tool = b.dataset.tool; bar.querySelectorAll("[data-tool]").forEach(x => x.setAttribute("aria-pressed", x === b)); }
      if (b.dataset.hire) this.say(this.world.hire(b.dataset.hire));
    };
  }

  tileAt(ev) {
    const r = this.canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const px = (ev.clientX - r.left) * dpr, py = (ev.clientY - r.top) * dpr;
    return [Math.floor((px / this.cam.zoom + this.cam.x) / TILE), Math.floor((py / this.cam.zoom + this.cam.y) / TILE)];
  }
  dragTiles(a, b, kind) {
    const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])], [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])], out = [];
    if (kind === "tile") return [b];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
      if (kind === "rect" || x === x0 || x === x1 || y === y0 || y === y1) out.push([x, y]);
    return out;
  }

  bindInput() {
    const c = this.canvas;
    c.addEventListener("contextmenu", e => e.preventDefault());
    c.addEventListener("pointerdown", e => {
      c.setPointerCapture(e.pointerId);
      if (e.button === 2 || e.button === 1 || this.tool === "select" && e.shiftKey) { this.pan = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y }; return; }
      const t = this.tileAt(e), kind = TOOLS.find(x => x[0] === this.tool)[2];
      if (kind === "click" || kind === "place") { this.click(t, kind); this.pan = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y, click: true }; return; }
      this.drag = { from: t, kind };
      this.preview = this.dragTiles(t, t, kind);
    });
    c.addEventListener("pointermove", e => {
      this.hover = this.tileAt(e);
      if (this.pan) {
        const dpr = window.devicePixelRatio || 1, dx = e.clientX - this.pan.x, dy = e.clientY - this.pan.y;
        if (this.pan.click && Math.hypot(dx, dy) < 6) return;
        this.cam.x = this.pan.cx - (dx * dpr) / this.cam.zoom; this.cam.y = this.pan.cy - (dy * dpr) / this.cam.zoom; this.hooks.clamp();
      } else if (this.drag) this.preview = this.dragTiles(this.drag.from, this.hover, this.drag.kind);
    });
    c.addEventListener("pointerup", () => {
      if (this.drag) { this.say(this.world.paint(this.tool, this.preview)); this.drag = null; this.preview = null; }
      this.pan = null;
    });
    c.addEventListener("pointerleave", () => { this.hover = null; });
    c.addEventListener("wheel", e => { e.preventDefault(); this.hooks.zoom(e.deltaY < 0 ? 1 : -1, e); }, { passive: false });
    window.addEventListener("keydown", e => {
      if (e.target.closest && e.target.closest("input,select")) return;
      const step = 48 / this.cam.zoom;
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") this.cam.x -= step; else if (k === "arrowright" || k === "d") this.cam.x += step;
      else if (k === "arrowup" || k === "w") this.cam.y -= step; else if (k === "arrowdown" || k === "s") this.cam.y += step;
      else if (k === " ") { this.speed = this.speed ? 0 : 1; e.preventDefault(); }
      else if (k === "escape") { this.tool = "select"; this.buildTools(); this.selected = null; this.selectedEx = 0; }
      else return;
      this.hooks.clamp();
    });
  }

  click([x, y], kind) {
    const w = this.world, g = w.state.grid;
    if (kind === "place") { const type = this.tool.slice(6), def = BUILDINGS[type]; this.say(w.place(type, x - Math.floor((def.w - 1) / 2), y - Math.floor((def.h - 1) / 2))); return; }
    if (this.tool === "demolish") { this.say(w.demolish(x, y)); return; }
    // Select: the nearest animal under the cursor, else the exhibit.
    const a = w.state.animals.find(a => Math.abs(a.x - (x + 0.5)) < 1.2 && Math.abs(a.y - (y + 0.5)) < 1.2);
    this.selected = a || null;
    this.selectedEx = a ? a.ex : (x >= 0 && y >= 0 && x < g.w && y < g.h ? w.derived.exOf[y * g.w + x] : 0);
  }

  // ---- HUD, bell and panel, refreshed a few times a second ----
  // The HUD is built once; refresh() only updates its numbers, so buttons never get replaced mid-click.
  buildHud() {
    $("hud").innerHTML = `<span><b id="h-money"></b></span><span>Day <b id="h-day"></b> · <span id="h-clock"></span></span>
      <span id="h-stars"></span><span>Guests <b id="h-guests"></b></span>
      <span>Ticket <button data-t="-5">−</button> <b id="h-ticket"></b> <button data-t="5">+</button></span>
      <span>${[0, 1, 2, 4].map(v => `<button data-speed="${v}">${v ? v + "×" : "❚❚"}</button>`).join("")}</span>
      <span>Staff <b id="h-staff"></b></span><span class="muted">Today <span id="h-in"></span> in</span>
      <button data-bell id="h-bell">Messages</button><button data-power id="h-power">Power</button><button data-new>New Park</button>`;
    $("hud").onclick = e => {
      const t = e.target.closest("button"), s = this.world.state; if (!t) return;
      if (t.dataset.t) this.world.setTicket(s.ticket + Number(t.dataset.t));
      if (t.dataset.speed) this.speed = Number(t.dataset.speed);
      if (t.dataset.bell !== undefined) $("bell").hidden = !$("bell").hidden;
      if (t.dataset.power !== undefined) this.world.setPower(!s.power.on);
      if (t.dataset.new !== undefined) {   // two clicks: the viewer has no confirm() dialog
        if (this.newArmed) { this.newArmed = false; t.textContent = "New Park"; this.hooks.newPark(); }
        else { this.newArmed = true; t.textContent = "Start over?"; setTimeout(() => { this.newArmed = false; t.textContent = "New Park"; }, 3000); }
      }
      this.refresh();
    };
  }
  refresh() {
    if (!$("h-money")) this.buildHud();
    const s = this.world.state, b = s.books.today, r = Math.round(s.rating);
    $("h-money").textContent = fmtMoney(s.money); $("h-day").textContent = s.day; $("h-clock").textContent = fmtClock(s.clock);
    $("h-stars").textContent = "★".repeat(r) + "☆".repeat(5 - r); $("h-stars").title = "Rating " + s.rating.toFixed(2);
    $("h-guests").textContent = s.guests.length; $("h-ticket").textContent = fmtMoney(s.ticket); $("h-staff").textContent = s.staff.length;
    $("h-in").textContent = fmtMoney(b.tickets + b.shops);
    $("h-bell").textContent = "Messages" + (s.bell.some(n => n.urgent && n.day === s.day) ? " ●" : "");
    $("h-power").setAttribute("aria-pressed", s.power.on);
    document.querySelectorAll("#hud [data-speed]").forEach(x => x.setAttribute("aria-pressed", Number(x.dataset.speed) === this.speed));
    const bell = s.bell.slice(0, 20).map(n => `<div class="${n.urgent ? "urgent" : ""}">Day ${n.day} · ${esc(n.text)}</div>`).join("");
    if (bell !== this.lastBell) { $("bell").innerHTML = bell; this.lastBell = bell; }
    this.panel();
  }

  panel() {
    const w = this.world, s = w.state, side = $("side");
    let html = "";
    const e = this.selectedEx && s.exhibits.find(e => e.id === this.selectedEx);
    if (e) html = this.exhibitPanel(e);
    else if (this.selected) html = this.animalPanel(this.selected);
    if (html === this.lastPanel) return;
    this.lastPanel = html; side.innerHTML = html;
    side.onclick = ev => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.buy) this.say(w.buyAnimal(b.dataset.buy, Number(b.dataset.ex)));
      if (b.dataset.release) this.say(w.release(Number(b.dataset.release), Number(b.dataset.ex)));
      if (b.dataset.close !== undefined) { this.selected = null; this.selectedEx = 0; }
      this.lastPanel = ""; this.panel();
    };
    side.onchange = ev => { if (ev.target.dataset.biome) { this.say(w.setBiome(Number(ev.target.dataset.biome), ev.target.value)); this.lastPanel = ""; this.panel(); } };
  }

  exhibitPanel(e) {
    const w = this.world, s = w.state, t = w.derived.ex.get(e.id), here = animalsIn(s, e.id);
    if (!t) return "";
    const chips = [];
    if (e.biome === "none") chips.push(["No biome.", "bad"]);
    if (!t.gates.length) chips.push(["No keeper gate.", "bad"]);
    if (here.length && !t.feeders.length) chips.push(["No feeder.", "bad"]);
    if (!t.viewing.length) chips.push(["No viewing.", "bad"]);
    const danger = Math.max(0, ...here.map(a => SPECIES[a.sp].danger));
    if (danger > t.security) chips.push(["Fence too weak.", "bad"]);
    else if (here.length) chips.push(["Secure", "good"]);
    for (const j of s.jobs.filter(j => j.ex === e.id && j.why)) chips.push([j.why, "bad"]);
    const weak = t.weakest >= 0 ? condition(s.grid.cond[t.weakest]) : "";
    const species = [...new Set(here.map(a => a.sp))];
    const meters = species.map(sp => {
      const h = habitatScore(s, sp, t, here.filter(a => a.sp === sp).length);
      return `<h4>${esc(SPECIES[sp].name)} · ${here.filter(a => a.sp === sp).length}</h4>` +
        ["biome", "space", "water", "group"].map(k => `<div class="row"><span>${k[0].toUpperCase() + k.slice(1)}</span><span class="meter"><i style="width:${Math.round(h[k] * 100)}%"></i></span></div>`).join("");
    }).join("");
    const food = Object.entries(e.food || {}).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${Math.round(n)}`).join(", ") || "none";
    return `<div class="row"><h3>${esc(e.name)}</h3><button data-close>✕</button></div>
      <div class="row"><span>Biome</span><select data-biome="${e.id}">${Object.entries(BIOMES).map(([id, b]) => `<option value="${id}" ${id === e.biome ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select></div>
      <div class="row"><span>Size</span><b>${t.tiles.length} tiles · ${Math.round(100 * (t.shallow + t.deep) / Math.max(1, t.tiles.length))}% water</b></div>
      <div class="row"><span>Security</span><b>Tier ${t.security}${weak && weak !== "good" ? " · " + weak : ""}</b></div>
      <div class="row"><span>Food</span><b>${esc(food)}</b></div>
      <div>${chips.map(([c, k]) => `<span class="chip ${k}">${esc(c)}</span>`).join("")}</div>
      ${here.length ? `<h4>Animals</h4>` + here.map(a => `<div class="row"><span>${esc(SPECIES[a.sp].name)}</span><span class="meter"><i style="width:${a.happy}%"></i></span></div>`).join("") : ""}
      ${meters}
      ${s.animals.some(a => a.crated) ? `<h4>Crates</h4>` + s.animals.filter(a => a.crated).map(a => `<div class="row"><span>${esc(SPECIES[a.sp].name)}</span><button data-release="${a.id}" data-ex="${e.id}">Release here</button></div>`).join("") : ""}
      <h4>Buy</h4>${Object.entries(SPECIES).map(([id, sp]) => `<div class="row"><span>${esc(sp.name)} <span class="muted">D${sp.danger}</span></span><button data-buy="${id}" data-ex="${e.id}" ${s.money < sp.price ? "disabled" : ""}>${fmtMoney(sp.price)}</button></div>`).join("")}`;
  }
  animalPanel(a) {
    const sp = SPECIES[a.sp];
    return `<div class="row"><h3>${esc(sp.name)}</h3><button data-close>✕</button></div>
      <div>${a.escaped ? `<span class="chip bad">Escaped</span>` : ""}<span class="chip">${esc(a.act)}</span></div>
      ${["hunger", "thirst", "rest"].map(k => `<div class="row"><span>${k}</span><span class="meter"><i style="width:${Math.round(100 - a.need[k])}%"></i></span></div>`).join("")}
      <div class="row"><span>Happiness</span><span class="meter"><i style="width:${a.happy}%"></i></span></div>`;
  }
}
