// The HUD, the status bar, the side panel and mouse/keyboard input (the build menu is menu.js). Every change goes through a world command;
// a refused command shows its reason in the tool bar.
import { TILE } from "./display.js";
import { BIOMES, BUILDINGS, SPECIES } from "../sim/data.js";
import { bldSize, FACING } from "../sim/grid.js";
import { DAY_MIN, STAFF, ANIMAL } from "../sim/config.js";
import { habitatScore, fitProblem } from "../sim/habitat.js";
import { animalsIn, needsOf, uncrateProblem } from "../sim/animals.js";
import { sellPrice } from "../sim/world.js";
import { condition } from "../sim/exhibits.js";
import { afford } from "../sim/money.js";
import { BuildMenu, TOOL_KIND } from "./menu.js";
import { labHtml, labAction, labLive, labBind, tabBar, sellSure, sellBtn } from "./labs.js";

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// A labelled meter, full = good: amber under half, red under a quarter.
const meter = (label, full) => `<div class="row"><span>${label}</span><span class="meter"><i class="${full < 25 ? "bad" : full < 50 ? "low" : ""}" style="width:${Math.round(full)}%"></i></span></div>`;
// What an animal is doing, by its action key (animals.js ACTIONS, plus the guards' "held").
const ACT_LABEL = { test: "Testing the fence.", eat: "Eating.", drink: "Drinking.", rest: "Resting.", play: "Playing.",
  maul: "Attacking the fence.", wander: "Wandering.", idle: "Standing.", held: "Held." };
const SIZE_NAME = ["", "Tiny", "Small", "Medium", "Large", "Huge"];
const $ = id => document.getElementById(id);
const fmtMoney = n => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const fmtClock = c => { const h = Math.floor(c / 60) + 4, m = Math.floor(c % 60); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h % 24 < 12 ? "AM" : "PM"}`; };

export class UI {
  constructor(world, canvas, cam, hooks) {
    this.world = world; this.canvas = canvas; this.cam = cam; this.hooks = hooks;
    this.tool = "select"; this.drag = null; this.hover = null; this.preview = null; this.previewOk = true; this.ghost = null;
    this.selected = null; this.selectedEx = 0; this.selectedBld = 0; this.speed = 1; this.lastPanel = null;
    this.buildTools(); this.bindInput();
  }
  get view() { return { preview: this.preview, previewOk: this.previewOk, ghost: this.ghost, hover: this.hover, selected: this.selected, selectedEx: this.selectedEx }; }

  say(why) { $("why").textContent = why || ""; clearTimeout(this.whyT); if (why) this.whyT = setTimeout(() => ($("why").textContent = ""), 2500); }

  // The status bar under the map: why a click was refused, the money back while bulldozing, a yes/cancel when it asks.
  buildTools() {
    const bar = $("tools");
    bar.innerHTML = `<span id="why"></span><span id="stat"></span><span id="turn"></span><span id="ask"></span>`;
    bar.onclick = e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.yes !== undefined) { const t = this.asking; this.cancelAsk(); if (t) this.say(this.world.bulldoze(t)); }
      if (b.dataset.no !== undefined) this.cancelAsk();
      if (b.dataset.turn !== undefined) this.turn(1);
    };
    this.menu = new BuildMenu($("build"), tool => this.setTool(tool));
  }
  // Pick a tool; picking the one already on goes back to Select. The cursor says which: an arrow for Select, a hand for Move, a crosshair to build.
  setTool(tool) {
    const next = tool === this.tool ? "select" : tool;
    if (next === this.tool && tool === "select") return;
    this.tool = next;
    this.cancelAsk(); this.preview = null; this.ghost = null; this.drag = null; this.moving = null; this.rot = null; $("stat").textContent = "";
    $("turn").innerHTML = TOOL_KIND[this.tool] === "place" && !BUILDINGS[this.tool.slice(6)].anySide ? `<button data-turn title="Turn it (R or right click)">Turn ⟳</button>` : "";
    if (this.tool !== "crate") this.dropId = 0;
    this.canvas.style.cursor = this.tool === "select" ? "default" : this.tool === "move" ? "grab" : "crosshair";
    this.menu.setTool(this.tool);
  }

  // Bulldoze: mark what would go and show the money back; a plan that asks first waits for Yes in the tool bar.
  doomed(tiles) {
    const plan = this.world.bulldozePlan(tiles);
    const doomed = this.world.planTiles(plan);
    this.preview = doomed.length ? doomed : null; this.previewOk = false;
    $("stat").textContent = doomed.length ? `${fmtMoney(plan.refund)} back` : "";
    return plan;
  }
  bulldoze(tiles) {
    const plan = this.world.bulldozePlan(tiles);
    if (!plan.ask) { this.say(this.world.bulldoze(tiles)); return; }
    this.asking = tiles;
    $("ask").innerHTML = `${esc(plan.ask)} <button data-yes>Bulldoze</button> <button data-no>Cancel</button>`;
  }
  cancelAsk() { if (this.asking) this.preview = null; this.asking = null; $("ask").innerHTML = ""; $("stat").textContent = ""; }

  // Move: press on a building to pick it up, drag it, let go to put it down. It turns red where it won't fit.
  buildingAt([x, y]) {
    const g = this.world.state.grid;
    if (x < 0 || y < 0 || x >= g.w || y >= g.h) return null;
    const id = g.bld[y * g.w + x], b = id && this.world.state.buildings.find(b => b.id === id);
    return b && !BUILDINGS[b.type].fixed ? b : null;
  }
  footprint(type, x, y, rot) { const [w, h] = bldSize(BUILDINGS[type], rot), out = []; for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) out.push([xx, yy]); return out; }
  grab(t) {
    const b = this.buildingAt(t);
    if (!b) { const g = this.world.state.grid, id = t[0] >= 0 && t[1] >= 0 && t[0] < g.w && t[1] < g.h && g.bld[t[1] * g.w + t[0]]; this.say(id ? "Can't move that." : "Nothing to move."); return; }
    this.moving = { id: b.id, type: b.type, dx: t[0] - b.x, dy: t[1] - b.y, x: b.x, y: b.y, rot: b.rot || 0, from: t, moved: false };
    this.moveGhost(t);
  }
  moveGhost(t) {
    const m = this.moving; if (!t) return;
    if (t[0] !== m.from[0] || t[1] !== m.from[1]) m.moved = true;
    m.x = t[0] - m.dx; m.y = t[1] - m.dy; this.preview = null; this.last = t;
    const why = this.world.spotProblem(m.type, m.x, m.y, m.id, m.rot);
    this.ghost = { id: m.id, type: m.type, x: m.x, y: m.y, rot: m.rot, ok: !why };
    $("stat").textContent = why || this.world.frontProblem(m.type, m.x, m.y, m.rot);
  }
  // Let go: a tap (no drag, no turn) turns the building a quarter turn where it stands; otherwise it goes down where the ghost is.
  putDown() {
    const m = this.moving; this.moving = null; this.ghost = null; $("stat").textContent = "";
    const b = this.world.state.buildings.find(b => b.id === m.id);
    this.say(!m.moved && b && m.rot === (b.rot || 0) ? this.world.rotateBuilding(m.id, 1) : this.world.moveBuilding(m.id, m.x, m.y, m.rot));
  }
  // R (Shift+R back), or the Turn button: turn the building being placed or carried a quarter turn. Placing, it faces a path on its own until turned.
  turn(dir) {
    if (this.moving) {
      const m = this.moving, [w, h] = bldSize(BUILDINGS[m.type], (m.rot = (m.rot + (dir < 0 ? 3 : 1)) & 3));
      m.dx = Math.min(m.dx, w - 1); m.dy = Math.min(m.dy, h - 1); m.moved = true; this.moveGhost(this.last || m.from); return;
    }
    if (TOOL_KIND[this.tool] !== "place") return;
    const t = this.hover || this.last;
    const now = this.rot ?? (this.ghost ? this.ghost.rot : 0);
    this.rot = (now + (dir < 0 ? 3 : 1)) & 3;
    if (t) this.placeGhost(t); else $("stat").textContent = `Faces ${FACING[this.rot]}.`;
  }
  // Right click turns whatever building is in hand: the placing ghost, the carried one, or (Move tool) the one under the cursor.
  // Anywhere else it still pans. Returns true when it turned something.
  rightTurn(t, back) {
    const dir = back ? -1 : 1;
    if (this.moving || TOOL_KIND[this.tool] === "place") { this.turn(dir); return true; }
    const b = this.tool === "move" && this.buildingAt(t);
    if (!b) return false;
    this.say(this.world.rotateBuilding(b.id, dir)); this.moveHover(t); return true;
  }
  // Place: the building follows the cursor, centred the way click() puts it down, red with the reason where it won't go.
  // Facing: the player's turn (this.rot) or, until they turn it, toward a path (World.facing).
  placeCorner(type, [x, y], rot = this.rot ?? 0) { const [w, h] = bldSize(BUILDINGS[type], rot); return [x - Math.floor((w - 1) / 2), y - Math.floor((h - 1) / 2)]; }
  placeRot() { return this.rot ?? undefined; }
  placeGhost(t) {
    if (!t) { this.ghost = null; $("stat").textContent = ""; return; }
    this.last = t;
    const type = this.tool.slice(6), [x, y] = this.placeCorner(type, t), rot = this.world.facing(type, x, y, this.placeRot());
    const why = this.world.placeProblem(type, x, y, rot);
    this.ghost = { type, x, y, rot, ok: !why };
    $("stat").textContent = why || this.world.frontProblem(type, x, y, rot);
  }
  // Move an animal: a crate follows the cursor, red with the reason where a keeper can't take it; a click sends one.
  startDrop(id) {
    if (this.selectedBld) this.closePanel();   // a lab panel covers the map
    this.tool = "select"; this.setTool("crate"); this.dropId = id;
    $("stat").textContent = "Pick a spot.";
  }
  dropGhost(t) {
    if (!t) { this.ghost = null; return; }
    const why = this.world.dropProblem(this.dropId, t[0], t[1]);
    this.ghost = { crate: this.dropId, x: t[0], y: t[1], ok: !why };
    $("stat").textContent = why;
  }
  moveHover(t) {
    const b = t && this.buildingAt(t);
    this.preview = b ? this.footprint(b.type, b.x, b.y, b.rot) : null; this.previewOk = true;
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
      if (e.button === 2 && this.rightTurn(this.tileAt(e), e.shiftKey)) return;
      if (e.button === 2 || e.button === 1 || this.tool === "select" && e.shiftKey) { this.pan = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y }; return; }
      const t = this.tileAt(e), kind = TOOL_KIND[this.tool];
      if (kind === "move") { this.grab(t); return; }
      if (kind === "drop") { this.drop(t); this.pan = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y, click: true }; return; }
      if (kind === "click" || kind === "place") { this.click(t, kind); this.pan = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y, click: true }; return; }
      this.cancelAsk();
      this.drag = { from: t, kind };
      if (this.tool === "bulldoze") this.doomed([t]); else { this.preview = this.dragTiles(t, t, kind); this.previewOk = true; }
    });
    c.addEventListener("pointermove", e => {
      this.hover = this.tileAt(e);
      if (e.button === 2 && (e.buttons & 2) && this.moving) { this.turn(e.shiftKey ? -1 : 1); return; }   // right pressed while carrying (a chord: no pointerdown)
      if (this.pan) {
        const dpr = window.devicePixelRatio || 1, dx = e.clientX - this.pan.x, dy = e.clientY - this.pan.y;
        if (this.pan.click && Math.hypot(dx, dy) < 6) return;
        this.cam.x = this.pan.cx - (dx * dpr) / this.cam.zoom; this.cam.y = this.pan.cy - (dy * dpr) / this.cam.zoom; this.hooks.clamp();
      } else if (this.moving) this.moveGhost(this.hover);
      else if (TOOL_KIND[this.tool] === "place") this.placeGhost(this.hover);
      else if (this.tool === "crate") this.dropGhost(this.hover);
      else if (this.tool === "move") this.moveHover(this.hover);
      else if (this.drag) {
        const tiles = this.dragTiles(this.drag.from, this.hover, this.drag.kind);
        if (this.tool === "bulldoze") this.doomed(tiles); else this.preview = tiles;
      } else if (this.tool === "bulldoze" && !this.asking) this.doomed([this.hover]);
      else if (this.preview && !this.asking) this.preview = null;
    });
    c.addEventListener("pointerup", () => {
      if (this.moving) this.putDown();
      if (this.drag) {
        const tiles = this.dragTiles(this.drag.from, this.hover || this.drag.from, this.drag.kind);
        if (this.tool === "bulldoze") this.bulldoze(tiles); else this.say(this.world.paint(this.tool, this.preview));
        this.drag = null; if (!this.asking) { this.preview = null; $("stat").textContent = ""; }
      }
      this.pan = null;
    });
    c.addEventListener("pointerleave", () => { this.hover = null; if (!this.moving) this.ghost = null; if (!this.drag && !this.asking && !this.moving) { this.preview = null; $("stat").textContent = ""; } });
    c.addEventListener("wheel", e => { e.preventDefault(); this.hooks.zoom(e.deltaY < 0 ? 1 : -1, e); }, { passive: false });
    window.addEventListener("keydown", e => {
      if (e.target.closest && e.target.closest("input,select,.gt-track")) return;
      const step = 48 / this.cam.zoom;
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") this.cam.x -= step; else if (k === "arrowright" || k === "d") this.cam.x += step;
      else if (k === "arrowup" || k === "w") this.cam.y -= step; else if (k === "arrowdown" || k === "s") this.cam.y += step;
      else if (k === " ") { this.speed = this.speed ? 0 : 1; e.preventDefault(); }
      else if (k === "r" && (this.moving || TOOL_KIND[this.tool] === "place")) this.turn(e.shiftKey ? -1 : 1);
      else if (k === "escape") {   // drop Bulldoze or Move first, then close the list, then the tray (a tool in them goes with it), then the panel
        if (["bulldoze", "move", "crate"].includes(this.tool)) this.setTool("select");
        else if (!this.menu.back()) { if (!$("bell").hidden) $("bell").hidden = true; else this.closePanel(); }
      }
      else return;
      this.hooks.clamp();
    });
  }

  drop([x, y]) {
    const why = this.world.moveAnimal(this.dropId, x, y);
    if (why) { this.say(why); this.dropGhost([x, y]); return; }
    this.setTool("select"); this.lastPanel = null;
  }
  click([x, y], kind) {
    const w = this.world, g = w.state.grid;
    if (kind === "place") { const type = this.tool.slice(6); this.say(w.place(type, ...this.placeCorner(type, [x, y]), this.placeRot())); this.placeGhost([x, y]); return; }
    // Select: the nearest animal or crate under the cursor, else a lab, else the exhibit.
    const a = w.state.animals.find(a => !a.carried && Math.abs(a.x - (x + 0.5)) < 1.2 && Math.abs(a.y - (y + 0.5)) < 1.2);
    const on = x >= 0 && y >= 0 && x < g.w && y < g.h, b = !a && on && w.state.buildings.find(b => b.id === g.bld[y * g.w + x] && BUILDINGS[b.type].lab);
    this.selected = a || null;
    this.selectedBld = b ? b.id : 0;
    this.selectedEx = a || b ? 0 : on ? w.derived.exOf[y * g.w + x] : 0;
  }

  // ---- HUD, bell and panel, refreshed a few times a second ----
  // The HUD is built once; refresh() only updates its numbers, so buttons never get replaced mid-click.
  buildHud() {
    $("hud").innerHTML = `<span><b id="h-money"></b></span><span>Day <b id="h-day"></b> · <span id="h-clock"></span></span>
      <span id="h-stars"></span><span>Guests <b id="h-guests"></b></span>
      <span>Ticket <button data-t="-5">−</button> <b id="h-ticket"></b> <button data-t="5">+</button></span>
      <span>${[0, 1, 2, 4].map(v => `<button data-speed="${v}">${v ? v + "×" : "❚❚"}</button>`).join("")}</span>
      <span>Staff <b id="h-staff"></b> <button data-hire="keeper" title="Hire a keeper">+Keeper</button><button data-hire="mechanic" title="Hire a mechanic">+Mechanic</button><button data-hire="guard" title="Hire a guard">+Guard</button></span><span class="muted">Today <span id="h-in"></span> in</span>
      <button data-bell id="h-bell">Messages</button><button data-power id="h-power">Power</button><button data-sandbox id="h-sandbox" title="Unlimited money, for testing">Sandbox</button><button data-new>New Park</button>`;
    $("hud").onclick = e => {
      const t = e.target.closest("button"), s = this.world.state; if (!t) return;
      if (t.dataset.t) this.world.setTicket(s.ticket + Number(t.dataset.t));
      if (t.dataset.hire) this.say(this.world.hire(t.dataset.hire));
      if (t.dataset.speed) this.speed = Number(t.dataset.speed);
      if (t.dataset.bell !== undefined) $("bell").hidden = !$("bell").hidden;
      if (t.dataset.power !== undefined) this.world.setPower(!s.power.on);
      if (t.dataset.sandbox !== undefined) this.world.setSandbox(!s.sandbox);
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
    $("h-money").textContent = s.sandbox ? "∞" : fmtMoney(s.money); $("h-money").title = s.sandbox ? "Sandbox: bank " + fmtMoney(s.money) : ""; $("h-day").textContent = s.day; $("h-clock").textContent = fmtClock(s.clock);
    $("h-stars").textContent = "★".repeat(r) + "☆".repeat(5 - r); $("h-stars").title = "Rating " + s.rating.toFixed(2);
    $("h-guests").textContent = s.guests.length; $("h-ticket").textContent = fmtMoney(s.ticket); $("h-staff").textContent = s.staff.length;
    $("h-in").textContent = fmtMoney(b.tickets + b.shops);
    $("h-bell").textContent = "Messages" + (s.bell.some(n => n.urgent && n.day === s.day) ? " ●" : "");
    $("h-power").setAttribute("aria-pressed", s.power.on);
    $("h-sandbox").setAttribute("aria-pressed", !!s.sandbox);
    document.querySelectorAll("#hud [data-speed]").forEach(x => x.setAttribute("aria-pressed", Number(x.dataset.speed) === this.speed));
    const bell = `<div class="row bellhead"><b>Messages</b><button class="xclose" data-bellclose aria-label="Close">×</button></div>`
      + (s.bell.slice(0, 20).map(n => `<div class="${n.urgent ? "urgent" : ""}">Day ${n.day} · ${esc(n.text)}</div>`).join("") || `<div class="muted">No messages.</div>`);
    if (bell !== this.lastBell) { $("bell").innerHTML = bell; this.lastBell = bell; }
    this.menu.refresh(s);
    this.panel();
  }

  // Close whatever panel is open (its ×, Esc, or a tap on empty ground).
  closePanel() { this.sellAsk = 0; this.selected = null; this.selectedEx = 0; this.selectedBld = 0; this.lastPanel = null; this.panel(); }

  // The panel is rebuilt when its HTML changes, never mid-press: a button replaced between pointerdown and pointerup
  // loses its click. lastPanel = null forces the next rebuild.
  panel() {
    const w = this.world, s = w.state, side = $("side");
    if (!this.labBound) { labBind(this, side); this.bindPanel(side); this.labBound = true; }
    if (this.holdPanel || this.pressing) { labLive(this, side); return; }   // the slider is being dragged, or a button pressed
    let html = "";
    const e = this.selectedEx && s.exhibits.find(e => e.id === this.selectedEx), lab = this.selectedBld && s.buildings.find(b => b.id === this.selectedBld);
    if (lab) html = labHtml(this, lab);
    else if (e) html = this.exhibitPanel(e);
    else if (this.selected) html = this.animalPanel(this.selected);
    side.classList.toggle("full", !!lab);   // the labs open full size over the map
    if (html !== this.lastPanel) {
      this.lastPanel = html; side.innerHTML = html;
      side.onclick = ev => {
        const b = ev.target.closest("button, input[data-pick]"); if (!b || b.disabled) return;
        if (b.dataset.buy) this.say(w.buyAnimal(b.dataset.buy, Number(b.dataset.ex)));
        const id = Number(b.dataset.id);
        if (b.dataset.pickAnimal) { this.selected = w.state.animals.find(a => a.id === Number(b.dataset.pickAnimal)) || null; this.selectedEx = 0; this.sellAsk = 0; }
        if (b.dataset.drop !== undefined) { this.startDrop(id); this.lastPanel = null; this.panel(); return; }
        if (b.dataset.crate !== undefined) this.say(w.crate(id));
        if (b.dataset.uncrate !== undefined) this.say(w.uncrate(id));
        if (b.dataset.cancelMove !== undefined) this.say(w.cancelMove(id));
        if (b.dataset.close !== undefined) { this.closePanel(); return; }
        if (b.dataset.tab === "an") this.anTab = b.dataset.k;   // the animal panel's tabs (labAction knows only the labs')
        else { const why = labAction(this, b); if (why) this.say(why); }
        if (this.selected && !w.state.animals.includes(this.selected)) this.selected = null;   // sold
        this.lastPanel = null; this.panel();
        if (this.pressing) setTimeout(() => this.panel(), 0);   // a real press holds rebuilds: go again once it clears
      };
      side.onchange = ev => { if (ev.target.dataset.biome) { this.say(w.setBiome(Number(ev.target.dataset.biome), ev.target.value)); this.lastPanel = null; this.panel(); } };
    }
    if (lab) labLive(this, side);
  }

  bindPanel(side) {
    side.addEventListener("pointerdown", () => { this.pressing = true; });
    const up = () => { if (this.pressing) setTimeout(() => { this.pressing = false; }, 0); };   // after the click lands
    window.addEventListener("pointerup", up, true); window.addEventListener("pointercancel", up, true);
    // A lab covers the map, so reaching for the build column closes it.
    $("build").addEventListener("click", ev => { if (this.selectedBld && ev.target.closest("[data-cat], [data-tool]")) this.closePanel(); }, true);
    $("bell").onclick = ev => { if (ev.target.closest("[data-bellclose]")) $("bell").hidden = true; };
  }

  exhibitPanel(e) {
    const w = this.world, s = w.state, t = w.derived.ex.get(e.id), here = animalsIn(s, e.id);
    const crates = s.animals.filter(a => a.crated && !a.carried && a.ex === e.id);
    if (!t) return "";
    const chips = [];
    if (e.biome === "none") chips.push(["No biome.", "bad"]);
    if (!t.gates.length) chips.push(["No keeper gate.", "bad"]);
    if (here.length && !t.feeders.length) chips.push(["No feeder.", "bad"]);
    if (!t.viewing.length) chips.push(["No viewing.", "bad"]);
    const danger = Math.max(0, ...here.map(a => SPECIES[a.sp].danger));
    if (danger > t.security) chips.push(["Fence too weak.", "bad"]);
    else if (here.length) chips.push(["Secure", "good"]);
    for (const sp of new Set(here.map(a => a.sp))) {
      const n = here.filter(a => a.sp === sp).length, [lo, hi] = SPECIES[sp].group;
      if (n < lo) chips.push([`Too few ${SPECIES[sp].name}.`, "bad"]); else if (n > hi) chips.push([`Too many ${SPECIES[sp].name}.`, "bad"]);
    }
    for (const j of s.jobs.filter(j => j.ex === e.id && j.why)) chips.push([j.why, "bad"]);
    const weak = t.weakest >= 0 ? condition(s.grid.cond[t.weakest]) : "";
    const species = [...new Set(here.map(a => a.sp))];
    const meters = species.map(sp => {
      const h = habitatScore(s, sp, t, here.filter(a => a.sp === sp).length);
      return `<h4>${esc(SPECIES[sp].name)} · ${here.filter(a => a.sp === sp).length}</h4>` +
        ["biome", "space", "water", "group"].map(k => meter(k[0].toUpperCase() + k.slice(1), h[k] * 100)).join("");
    }).join("");
    const food = Object.entries(e.food || {}).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${Math.round(n)}`).join(", ") || "none";
    return `<div class="row"><h3>${esc(e.name)}</h3><button class="xclose" data-close aria-label="Close">×</button></div>
      <div class="row"><span>Biome</span><select data-biome="${e.id}">${Object.entries(BIOMES).map(([id, b]) => `<option value="${id}" ${id === e.biome ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select></div>
      <div class="row"><span>Size</span><b>${t.tiles.length} tiles · ${Math.round(100 * (t.shallow + t.deep) / Math.max(1, t.tiles.length))}% water</b></div>
      <div class="row"><span>Security</span><b>Tier ${t.security}${weak && weak !== "good" ? " · " + weak : ""}</b></div>
      <div class="row"><span>Food</span><b>${esc(food)}</b></div>
      <div>${chips.map(([c, k]) => `<span class="chip ${k}">${esc(c)}</span>`).join("")}</div>
      ${here.length ? `<h4>Animals</h4>` + here.map(a => meter(`<button class="link" data-pick-animal="${a.id}">${esc(SPECIES[a.sp].name)}</button>`, a.happy)).join("") : ""}
      ${meters}
      ${crates.length ? `<h4>Crates</h4>` + crates.map(a => `<div class="row"><button class="link" data-pick-animal="${a.id}">${esc(SPECIES[a.sp].name)}</button>${sellSure(this, a) || `<span class="btns">${this.crateBtns(a)}</span>`}</div>`).join("") : ""}
      <h4>Buy</h4>${Object.entries(SPECIES).filter(([id, sp]) => sp.starter && !fitProblem(id, e.biome)).map(([id, sp]) => `<div class="row"><span>${esc(sp.name)} <span class="muted">D${sp.danger}</span></span><button data-buy="${id}" data-ex="${e.id}" ${!afford(s, sp.price) ? "disabled" : ""}>${fmtMoney(sp.price)}</button></div>`).join("")}`;
  }
  // An animal's or a crate's buttons: Move (or Cancel move once ordered), Crate or Uncrate, Sell.
  crateBtns(a, job = this.world.state.jobs.find(j => j.kind === "haul" && j.animal === a.id)) {
    const w = this.world, d = `data-id="${a.id}"`;
    const out = [job ? `<button data-cancel-move ${d}>Cancel move</button>` : `<button data-drop ${d}>Move</button>`];
    if (a.crated) out.push(`<button data-uncrate ${d} ${uncrateProblem(w.state, w.derived, a) ? "disabled" : ""}>Uncrate</button>`);
    else out.push(`<button data-crate ${d}>Crate</button>`);
    out.push(sellBtn(a, sellPrice(a.sp)));
    return out.join("");
  }
  // Status chips over two tabs: Info (where it is, what it's doing, its species) and Health (meters and needs).
  animalPanel(a) {
    const sp = SPECIES[a.sp], H = ANIMAL.health, s = this.world.state;
    const chips = [];
    if (a.escaped) chips.push("Escaped.");
    if (a.health < H.weak) chips.push("Sickly.");
    if (a.need.hunger >= H.starveFrom) chips.push("Starving."); else if (a.need.hunger >= 80) chips.push("Hungry.");
    if (sp.moves !== "swim") { if (a.need.thirst >= H.starveFrom) chips.push("Parched."); else if (a.need.thirst >= 80) chips.push("Thirsty."); }
    if (a.need.enrich >= 80) chips.push("Bored.");
    if (a.stress >= H.stressFrom) chips.push("Stressed.");
    const job = s.jobs.find(j => j.kind === "haul" && j.animal === a.id);
    if (job && job.why) chips.push(job.why);
    else if (job && !job.by && !s.staff.some(x => x.role === "keeper")) chips.push("No keeper.");
    if (!["info", "health"].includes(this.anTab)) this.anTab = "info";
    const ex = s.exhibits.find(e => e.id === a.ex);
    const where = a.carried ? "Being carried." : a.crated ? `In a crate${ex ? " in " + ex.name : ""}.` : a.escaped ? "Escaped." : ex ? ex.name : "Nowhere.";
    const to = job && (s.exhibits.find(e => e.id === job.ex)?.name || "Storage");
    const row = (k, v) => `<div class="row"><span>${k}</span><b>${esc(v)}</b></div>`;
    const names = { hunger: "Fed", thirst: "Water", enrich: "Enrichment" };
    const body = this.anTab === "info"
      ? row("Where", where) + (job ? row("Moving to", to) : "") + (a.crated ? "" : row("Doing", ACT_LABEL[a.act] || a.act)) + row("Period", sp.period) + row("Danger", sp.danger)
        + row("Size", SIZE_NAME[sp.size] || "?") + row("Eats", sp.foodType[0].toUpperCase() + sp.foodType.slice(1)) + row("Active", sp.active === "night" ? "Night" : "Day")
        + row("Group", sp.group[0] === sp.group[1] ? sp.group[0] : `${sp.group[0]}–${sp.group[1]}`)
      : meter("Health", a.health) + meter("Happiness", a.happy) + meter("Calm", 100 - a.stress)
        + `<h4>Needs</h4>` + needsOf(sp).map(k => meter(names[k], 100 - a.need[k])).join("");
    return `<div class="row"><h3>${esc(sp.name)}</h3><button class="xclose" data-close aria-label="Close">×</button></div>
      <div>${chips.map(c => `<span class="chip bad">${esc(c)}</span>`).join("")}</div>
      ${a.escaped || a.carried ? "" : `<div class="row">${sellSure(this, a) || `<span class="btns">${this.crateBtns(a, job)}</span>`}</div>`}
      ${tabBar("an", [{ key: "info", label: "Info" }, { key: "health", label: "Health" }], this.anTab)}
      <div class="ptab-body">${body}</div>`;
  }
}
