// The tile grid: a few flat typed-array layers, saved as they are. Only commands (world.js) write to it.
import { S_NONE, S_PATH, S_FENCE, S_BUILDING, S_STAFF, W_NONE, W_DEEP, F_GATE } from "./config.js";
import { FENCE_IDS } from "./data.js";

export function newGrid(w, h) {
  const n = w * h;
  return {
    w, h,
    water: new Uint8Array(n),     // W_NONE, W_SHALLOW, W_DEEP
    struct: new Uint8Array(n),    // S_NONE, S_PATH, S_FENCE, S_BUILDING, S_STAFF
    fence: new Uint8Array(n),     // fence type: index into FENCE_IDS, plus 1 (0 = none)
    cond: new Uint8Array(n),      // fence condition 0 to 100
    flags: new Uint8Array(n),     // F_GATE, F_CHUTE
    bld: new Int32Array(n),       // building id standing on the tile (0 = none)
    ex: new Int32Array(n),        // the exhibit the tile last belonged to (exhibits.js keeps it)
  };
}

export const inside = (g, x, y) => x >= 0 && y >= 0 && x < g.w && y < g.h;
export const idx = (g, x, y) => y * g.w + x;
export const xy = (g, i) => [i % g.w, (i / g.w) | 0];
export const fenceId = (g, i) => (g.fence[i] ? FENCE_IDS[g.fence[i] - 1] : null);
export const isFence = (g, i) => g.struct[i] === S_FENCE;
export const isPath = (g, i) => g.struct[i] === S_PATH;
export const isGate = (g, i) => g.struct[i] === S_FENCE && (g.flags[i] & F_GATE) !== 0;

// The four neighbours of tile i, as tile indexes.
export function neighbours(g, i) {
  const x = i % g.w, y = (i / g.w) | 0, out = [];
  if (x > 0) out.push(i - 1);
  if (x < g.w - 1) out.push(i + 1);
  if (y > 0) out.push(i - g.w);
  if (y < g.h - 1) out.push(i + g.w);
  return out;
}

// Buildings turn in quarter turns, clockwise: rot 0 has its front on the south edge (the way the art is drawn), 1 west, 2 north, 3 east.
// A turned building swaps its width and height. People use it only from the tiles just past its front edge, unless its type has anySide.
export const FACING = ["south", "west", "north", "east"];
export const bldSize = (def, rot = 0) => (rot & 1 ? [def.h, def.w] : [def.w, def.h]);
export function bldTiles(g, x, y, def, rot = 0) {
  const [w, h] = bldSize(def, rot), out = [];
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (inside(g, xx, yy)) out.push(idx(g, xx, yy));
  return out;
}
export function frontTiles(g, x, y, def, rot = 0) {
  const [w, h] = bldSize(def, rot), out = [];
  if (def.anySide) {
    const own = new Set(bldTiles(g, x, y, def, rot));
    for (const i of own) for (const j of neighbours(g, i)) if (!own.has(j) && !out.includes(j)) out.push(j);
    return out;
  }
  const r = rot & 3;
  if (r === 0 || r === 2) { const yy = r === 0 ? y + h : y - 1; for (let xx = x; xx < x + w; xx++) if (inside(g, xx, yy)) out.push(idx(g, xx, yy)); }
  else { const xx = r === 3 ? x + w : x - 1; for (let yy = y; yy < y + h; yy++) if (inside(g, xx, yy)) out.push(idx(g, xx, yy)); }
  return out;
}
// The way a building at x, y should face when nobody chose: toward a guest path for a building guests use (or the entrance),
// else toward any tile staff can stand on. Only turns that keep its footprint; south first, then the sides, north last.
export function autoRot(g, x, y, def) {
  const turns = (def.w === def.h ? [0, 1, 3, 2] : [0, 2]);
  const wants = def.serves || def.fixed ? (i => g.struct[i] === S_PATH) : (i => walkable(g, i, "staff"));
  return turns.find(r => frontTiles(g, x, y, def, r).some(wants)) ?? 0;
}

export function setFence(g, i, id) {
  g.struct[i] = S_FENCE; g.fence[i] = FENCE_IDS.indexOf(id) + 1; g.cond[i] = 100; g.flags[i] = 0; g.water[i] = W_NONE;
}
export function clearTile(g, i) {
  g.struct[i] = S_NONE; g.fence[i] = 0; g.cond[i] = 0; g.flags[i] = 0;
}

// Who may stand on a tile. Fences block everyone (staff pass gates); buildings block everyone. Guests keep to guest paths;
// staff walk staff paths, guest paths and open ground.
export function walkable(g, i, who) {
  const s = g.struct[i];
  if (s === S_BUILDING) return false;
  if (s === S_FENCE) return who === "staff" && isGate(g, i);
  if (who === "guest") return s === S_PATH;
  if (who === "staff") return g.water[i] !== W_DEEP;
  if (who === "swim") return g.water[i] !== W_NONE;
  if (who === "both") return true;
  return g.water[i] === W_NONE;   // "land"
}
export { S_NONE, S_PATH, S_FENCE, S_BUILDING, S_STAFF };
