// Regions and exhibits. A region is a 4-connected patch of tiles that aren't fence; one that never reaches
// the map edge is an exhibit. Exhibits are rebuilt after every grid change, keeping their id (and so their name,
// biome and animals) by matching the most overlap with their old tiles.
import { W_SHALLOW, W_DEEP, S_PATH, S_BUILDING, COND } from "./config.js";
import { FENCES, BIOMES, BUILDINGS } from "./data.js";
import { neighbours, fenceId, isFence } from "./grid.js";

export function findRegions(g) {
  const n = g.w * g.h, region = new Int32Array(n).fill(-1), list = [];
  for (let s = 0; s < n; s++) {
    if (region[s] !== -1 || isFence(g, s)) continue;
    const r = { id: list.length, tiles: [], edge: false };
    const stack = [s]; region[s] = r.id;
    while (stack.length) {
      const i = stack.pop(); r.tiles.push(i);
      const x = i % g.w, y = (i / g.w) | 0;
      if (x === 0 || y === 0 || x === g.w - 1 || y === g.h - 1) r.edge = true;
      for (const j of neighbours(g, i)) if (region[j] === -1 && !isFence(g, j)) { region[j] = r.id; stack.push(j); }
    }
    list.push(r);
  }
  return { region, list };
}

// Rebuild state.exhibits and derived.exOf from the grid. The grid's ex layer remembers which exhibit each tile
// last belonged to, so a pen opened for a moment (a wall being replaced) keeps its exhibit when it closes again:
// until then the exhibit waits in state.openPens.
export function rebuildExhibits(state, derived) {
  const g = state.grid, { region, list } = findRegions(g), prev = g.ex, n = g.w * g.h;
  const old = new Map([...state.exhibits, ...(state.openPens || [])].map(e => [e.id, e])), claimed = new Set(), next = [];
  const exOf = new Int32Array(n);
  // Biggest regions pick first, so on a merge the bigger pen's exhibit (and biome) wins.
  const pens = list.filter(r => !r.edge).sort((a, b) => b.tiles.length - a.tiles.length);
  for (const r of pens) {
    const votes = new Map();
    if (prev) for (const i of r.tiles) if (prev[i]) votes.set(prev[i], (votes.get(prev[i]) || 0) + 1);
    const ranked = [...votes].sort((a, b) => b[1] - a[1]).map(v => v[0]);
    const keep = ranked.find(id => !claimed.has(id) && old.has(id));
    let e;
    if (keep) { e = old.get(keep); claimed.add(keep); }
    else {
      const from = ranked.length ? old.get(ranked[0]) : null;   // a split half keeps the biome
      e = { id: state.nextId++, name: "Exhibit " + (state.exhibitSeq = (state.exhibitSeq || 0) + 1), biome: from ? from.biome : "none", food: {} };
    }
    for (const i of r.tiles) { exOf[i] = e.id; prev[i] = e.id; }
    next.push(e);
  }
  const remembered = new Set(prev);
  state.openPens = [...old.values()].filter(e => !claimed.has(e.id) && !next.includes(e) && remembered.has(e.id));
  state.exhibits = next;
  derived.exOf = exOf;
  derived.regionOf = region;
  derived.regions = list;
  derived.ex = new Map();
  for (const e of next) derived.ex.set(e.id, tally(state, derived, e));
}

// What an exhibit holds, for habitat scores, security and viewing. Never saved.
export function tally(state, derived, e) {
  const g = state.grid, t = { tiles: [], land: 0, shallow: 0, deep: 0, fences: [], gates: [], chutes: [], viewing: [], feeders: [], props: [] };
  const fenceSet = new Set(), viewSet = new Set();
  for (let i = 0; i < derived.exOf.length; i++) if (derived.exOf[i] === e.id) {
    t.tiles.push(i);
    if (g.water[i] === W_SHALLOW) t.shallow++; else if (g.water[i] === W_DEEP) t.deep++; else t.land++;
    if (g.struct[i] === S_BUILDING) { const b = state.buildings.find(b => b.id === g.bld[i]); if (b) { const list = b.type === "feeder" ? t.feeders : BUILDINGS[b.type].enrich ? t.props : null; if (list && !list.includes(b.id)) list.push(b.id); } }
    for (const j of neighbours(g, i)) if (isFence(g, j)) fenceSet.add(j);
  }
  for (const f of fenceSet) {
    t.fences.push(f);
    if (g.flags[f] & 1) t.gates.push(f);
    if (g.flags[f] & 2) t.chutes.push(f);
    for (const j of neighbours(g, f)) if (g.struct[j] === S_PATH && derived.exOf[j] !== e.id) viewSet.add(j);
  }
  t.viewing = [...viewSet];
  t.security = t.fences.length ? Math.min(...t.fences.map(f => tileTier(state, f))) : 0;
  t.weakest = t.fences.length ? t.fences.reduce((a, b) => (tileTier(state, b) < tileTier(state, a) ? b : a)) : -1;
  t.biome = BIOMES[e.biome] ? e.biome : "none";
  return t;
}

export const condition = c => (c < COND.damaged ? "damaged" : c < COND.worn ? "worn" : "good");

// A fence tile's security tier right now. Worn keeps the full tier; Damaged drops one.
// Electric: 6 with power, 2 without, 1 without and Worn. A Damaged electric tile has lost its power.
export function tileTier(state, i) {
  const g = state.grid, f = FENCES[fenceId(g, i)];
  if (!f) return 0;
  const c = condition(g.cond[i]);
  if (f.power) {
    if (c === "damaged" || !state.power.on) return c === "good" ? 2 : 1;
    return f.tier;
  }
  return c === "damaged" ? Math.max(1, f.tier - 1) : f.tier;
}
