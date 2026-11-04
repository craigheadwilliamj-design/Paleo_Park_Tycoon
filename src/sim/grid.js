// The tile grid: a few flat typed-array layers, saved as they are. Only commands (world.js) write to it.
import { S_NONE, S_PATH, S_FENCE, S_BUILDING, W_NONE, W_DEEP, F_GATE } from "./config.js";
import { FENCE_IDS } from "./data.js";

export function newGrid(w, h) {
  const n = w * h;
  return {
    w, h,
    water: new Uint8Array(n),     // W_NONE, W_SHALLOW, W_DEEP
    struct: new Uint8Array(n),    // S_NONE, S_PATH, S_FENCE, S_BUILDING
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

export function setFence(g, i, id) {
  g.struct[i] = S_FENCE; g.fence[i] = FENCE_IDS.indexOf(id) + 1; g.cond[i] = 100; g.flags[i] = 0; g.water[i] = W_NONE;
}
export function clearTile(g, i) {
  g.struct[i] = S_NONE; g.fence[i] = 0; g.cond[i] = 0; g.flags[i] = 0;
}

// Who may stand on a tile. Fences block everyone (staff pass gates); buildings block everyone.
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
export { S_NONE, S_PATH, S_FENCE, S_BUILDING };
