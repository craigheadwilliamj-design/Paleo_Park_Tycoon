// The build menu: Bulldoze and Move, then four big category buttons, down from the top left. Each opens a tray along the bottom (menu A);
// a list in the tray (fence types, water, a building group) opens as a bar above it (menu B), one at a time.
// Built from data, so names and prices follow data.js and config.js. Select is always on underneath: a tool from a tray or list stays
// picked while its tray and list are open, and closing them (×, Esc, another category or list) goes back to Select.
import { FENCES, BUILDINGS, PARK_WATER, TRACKS } from "../sim/data.js";
import { PRICE, REFUND } from "../sim/config.js";
import { hasTech } from "../sim/science.js";

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => "$" + Math.round(n).toLocaleString("en-US");

// Every tool and how it takes the pointer: "rect" fills the dragged box, "ring" outlines it, "tile" is one tile,
// "place" puts a building down, "click" picks, "move" drags a building.
export const TOOL_KIND = {
  select: "click", bulldoze: "rect", move: "move", crate: "drop", path: "rect", staffpath: "rect", gate: "tile", chute: "tile", "water:shallow": "rect", "water:deep": "rect",
  ...Object.fromEntries(Object.keys(FENCES).map(id => [`fence:${id}`, "ring"])),
  ...Object.fromEntries(Object.keys(BUILDINGS).filter(id => !BUILDINGS[id].fixed).map(id => [`place:${id}`, "place"])),
};

// Placeholder icons (24 x 24) until the menu art lands.
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = c => Math.max(0, Math.min(255, Math.round(c + (k > 0 ? 255 - c : c) * k)));
  return "#" + [n >> 16, (n >> 8) & 255, n & 255].map(c => f(c).toString(16).padStart(2, "0")).join(""); };
const ICON = {
  bulldoze: '<g transform="matrix(-1 0 0 1 24 0)"><path d="M2 9h2.5v11H2z" fill="currentColor"/><path d="M4.5 13l4-1M4.5 17h4" stroke="currentColor" stroke-width="1.6"/><path d="M8 11h4V5h6l2 6h1v6H8z" fill="currentColor"/><rect x="7.5" y="17.5" width="15" height="5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/></g>',
  move: '<path d="M12 2v20M2 12h20" stroke="currentColor" stroke-width="2"/><path d="M12 2l-3.5 3.5h7zM12 22l-3.5-3.5h7zM2 12l3.5-3.5v7zM22 12l-3.5-3.5v7z" fill="currentColor"/>',
  path: '<path d="M5 21c1-6 5-6 7-10s2-6 6-8" fill="none" stroke="#c8b48a" stroke-width="5" stroke-linecap="round"/><path d="M5 21c1-6 5-6 7-10s2-6 6-8" fill="none" stroke="#8a7a58" stroke-width="1.2" stroke-dasharray="2 3"/>',
  gate: '<path d="M2 12h6M16 12h6" stroke="#8b8a82" stroke-width="4"/><rect x="8" y="7" width="8" height="10" rx="1" fill="#e9e1c8" stroke="#5a5446" stroke-width="1.4"/>',
  chute: '<path d="M2 12h20" stroke="#8b8a82" stroke-width="7"/><rect x="9" y="9.5" width="6" height="5" fill="#3b2a1a"/>',
  water: (c) => `<path d="M4 9l6-4 9 2 2 7-5 6-9-1-3-5z" fill="${c[0]}" stroke="${c[1]}" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 12c2-1.5 4 1.5 6 0" fill="none" stroke="${shade(c[0], 0.35)}" stroke-width="1.4" stroke-linecap="round"/>`,
  fence: (c) => `<rect x="2" y="7" width="20" height="5" fill="${shade(c, 0.15)}"/><rect x="2" y="12" width="20" height="7" fill="${shade(c, -0.25)}"/>`,
  building: (c) => `<rect x="3" y="11" width="18" height="9" fill="${shade(c, -0.3)}"/><rect x="3" y="5" width="18" height="8" fill="${c}"/>`,
  // the four categories
  build: '<path d="M3 11l9-7 9 7M5 10v10h14V10" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><rect x="10" y="14" width="4" height="6" fill="currentColor"/>',
  land: '<g transform="translate(12 12) rotate(40) scale(1.2) translate(-12 -12)"><path d="M9 1.5h6v3.5H9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M11 5h2v9h-2z" fill="currentColor"/><path d="M7.5 13.5h9v4.5c0 2.5-2 4-4.5 5-2.5-1-4.5-2.5-4.5-5z" fill="currentColor"/></g>',
  exhibits: '<path d="M5 3v18M19 3v18M5 7h14M5 12h14M5 17h14" stroke="currentColor" stroke-width="2"/>',
  staffpath: '<path d="M5 21c1-6 5-6 7-10s2-6 6-8" fill="none" stroke="#9c9a90" stroke-width="5" stroke-linecap="round"/><path d="M5 21c1-6 5-6 7-10s2-6 6-8" fill="none" stroke="#d9b84a" stroke-width="1.2" stroke-dasharray="3 2"/>',
  paths: '<path d="M8 21c0-5 6-5 6-9s-5-5-5-9M15 21c0-5 6-5 6-9s-5-5-5-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};
const svg = inner => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;

// Menu entries. A tool: {tool, label, cost, unit, icon, tip}. A list: {label, icon, list: [tools]}; its price is the range of theirs.
const range = ps => { const lo = Math.min(...ps), hi = Math.max(...ps); return lo === hi ? money(lo) : `${money(lo)}–${money(hi)}`; };
const priceOf = it => it.list ? range(it.list.map(t => t.cost)) + (it.list[0].unit || "") : money(it.cost) + (it.unit || "");
const fenceTools = () => Object.entries(FENCES).map(([id, f]) => ({ tool: `fence:${id}`, label: f.name, cost: f.price, unit: "/tile", icon: ICON.fence(f.color),
  tip: `Security tier ${f.tier}${f.power ? ", needs power" : ""}${f.holds ? `, holds ${f.holds === "deep" ? "deep sea" : "sea"} water` : ""}.` }));
const buildingTools = group => Object.entries(BUILDINGS).filter(([, b]) => b.menu === group && !b.fixed)
  .map(([id, b]) => ({ tool: `place:${id}`, label: b.name, cost: b.price, icon: ICON.building(b.color), tip: b.tip }));
const asList = (label, list, icon) => ({ label, list, icon: icon || list[0].icon });
const GROUPS = [["guest", "Guest"], ["staff", "Staff"], ["science", "Science"]];
// Steps by id, for the "Research: ..." tooltip on a locked tool.
const stepName = id => Object.values(TRACKS).flatMap(t => t.steps).find(s => s.id === id)?.name || id;

function categories() {
  return [
    { id: "build", label: "Buildings", items: GROUPS.map(([g, label]) => buildingTools(g).length && asList(label, buildingTools(g))).filter(Boolean) },
    { id: "land", label: "Landscaping", items: [asList("Water", [
      { tool: "water:shallow", label: "Shallow", cost: PRICE.water, unit: "/tile", icon: ICON.water(PARK_WATER), tip: "Animals wade and drink." },
      { tool: "water:deep", label: "Deep", cost: PRICE.water, unit: "/tile", icon: ICON.water([PARK_WATER[1], shade(PARK_WATER[1], -0.3)]), tip: "Swimmers only. Staff can't cross it." },
    ])] },
    { id: "exhibits", label: "Exhibits", items: [
      asList("Fence Types", fenceTools(), ICON.fence(FENCES.palisade.color)),
      { tool: "gate", label: "Gate", cost: PRICE.gate, icon: ICON.gate, tip: "Keepers walk in through it. Goes on a fence." },
      { tool: "chute", label: "Feeding Chute", cost: PRICE.chute, icon: ICON.chute, tip: "Keepers feed dangerous animals through it from outside. Goes on a fence." },
      ...buildingTools("exhibits"),
    ] },
    { id: "paths", label: "Paths", items: [
      { tool: "path", label: "Guest Path", cost: PRICE.path, unit: "/tile", icon: ICON.path, tip: "Guests only walk on paths." },
      { tool: "staffpath", label: "Staff Path", cost: PRICE.staffpath, unit: "/tile", icon: ICON.staffpath, tip: "Staff only. Guests never walk on it." },
    ] },
  ];
}

const toolBtn = t => `<button class="srow" data-tool="${esc(t.tool)}" aria-pressed="false"${t.tip ? ` title="${esc(t.tip)}" data-tip="${esc(t.tip)}"` : ""}>${svg(t.icon)}<b>${esc(t.label)}</b><span class="price">${esc(priceOf(t))}</span></button>`;
const entry = (it, k) => it.list
  ? `<div class="sitem" data-list="${k}"><button class="srow head" aria-expanded="false">${svg(it.icon)}<b>${esc(it.label)}</b><span class="price">${esc(priceOf(it))}</span><i class="chev"></i></button>
     <div class="ssub"><button class="xclose" data-close="b" aria-label="Close list">×</button>${it.list.map(toolBtn).join("")}</div></div>`
  : toolBtn(it);

export class BuildMenu {
  // el: the element to fill. pick(tool) is called when a tool button is pressed.
  constructor(el, pick) {
    this.el = el; this.pick = pick; this.cat = null; this.tool = "select";
    this.render();
    el.addEventListener("click", e => this.onClick(e));
    el.addEventListener("wheel", e => { const bar = e.target.closest(".traya, .ssub"); if (bar && !e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { bar.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  }
  render() {
    const cats = categories();
    this.el.innerHTML = `<div class="lefttools">
        <div class="smallrow"><button class="tbtn sm" data-tool="bulldoze" aria-pressed="false" title="Bulldoze: ${Math.round(REFUND * 100)}% back" aria-label="Bulldoze">${svg(ICON.bulldoze)}</button>
        <button class="tbtn sm" data-tool="move" aria-pressed="false" title="Move: drag a building to a new spot, tap it to turn it" aria-label="Move">${svg(ICON.move)}</button></div>
        ${cats.map(c => `<button class="tbtn big" data-cat="${c.id}" aria-expanded="false" title="${esc(c.label)}" aria-label="${esc(c.label)}">${svg(ICON[c.id])}</button>`).join("")}
      </div>
      ${cats.map(c => `<section class="tray" data-tray="${c.id}" hidden><div class="tray-tab">${esc(c.label)}</div><button class="xclose a" data-close="a" aria-label="Close menu">×</button>
        <div class="traya">${c.items.map((it, k) => entry(it, `${c.id}-${k}`)).join("")}</div></section>`).join("")}`;
  }
  onClick(e) {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.cat) { if (this.el.querySelector(`.lefttools [data-tool="${CSS.escape(this.tool)}"]`)) this.pick("select"); this.open(this.cat === b.dataset.cat ? null : b.dataset.cat); }
    else if (b.dataset.close === "a") this.open(null);
    else if (b.dataset.close === "b") this.openList(null);
    else if (b.classList.contains("head")) { const it = b.parentNode; this.openList(it.classList.contains("open") ? null : it); }
    else if (b.dataset.tool) this.pick(b.dataset.tool);
  }
  open(cat) {
    this.cat = cat;
    this.el.querySelectorAll("[data-cat]").forEach(x => x.setAttribute("aria-expanded", x.dataset.cat === cat));
    this.el.querySelectorAll(".tray").forEach(t => { t.hidden = t.dataset.tray !== cat; });
    this.openList(null);
  }
  openList(item) {
    this.el.querySelectorAll(".sitem").forEach(x => { x.classList.toggle("open", x === item); x.firstElementChild.setAttribute("aria-expanded", x === item); });
    if (!this.showing(this.tool)) this.pick("select");
  }
  // Is this tool's button on screen: in the left column, or in the open tray (and its list open, if it sits in one)?
  showing(tool) {
    const b = tool !== "select" && this.el.querySelector(`[data-tool="${CSS.escape(tool)}"]`); if (!b) return true;
    const tray = b.closest(".tray"), item = b.closest(".sitem");
    return !tray || tray.dataset.tray === this.cat && (!item || item.classList.contains("open"));
  }
  // Show the picked tool pressed, and open the tray and list it lives in.
  setTool(tool) {
    this.tool = tool;
    this.el.querySelectorAll("[data-tool]").forEach(x => x.setAttribute("aria-pressed", x.dataset.tool === tool));
    this.el.querySelectorAll(".sitem").forEach(x => x.classList.toggle("picked", !!x.querySelector(`[data-tool="${CSS.escape(tool)}"]`)));
  }
  // Grey out tools that need research, and one-a-park buildings already built. Cheap enough to run on every HUD refresh.
  refresh(state) {
    const key = state.science.done.join() + "|" + state.buildings.map(b => b.type).join();
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.el.querySelectorAll("[data-tool]").forEach(x => {
      const t = x.dataset.tool, f = t.startsWith("fence:") && FENCES[t.slice(6)], d = t.startsWith("place:") && BUILDINGS[t.slice(6)];
      const locked = f && !hasTech(state, f.tech), built = d && d.unique && state.buildings.some(b => b.type === t.slice(6));
      x.classList.toggle("locked", !!(locked || built));
      x.title = locked ? `Research: ${stepName(f.tech)}.` : built ? "Already built." : x.dataset.tip || "";
    });
  }
  // Esc: close the open list first, then the tray. Returns false when nothing was open.
  back() {
    const it = this.el.querySelector(".sitem.open");
    if (it) { this.openList(null); return true; }
    if (this.cat) { this.open(null); return true; }
    return false;
  }
}
