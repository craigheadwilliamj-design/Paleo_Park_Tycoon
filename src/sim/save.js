// Saving: the state as JSON, typed-array grid layers as base64. Derived data is rebuilt on load.
// Every save carries a version; migrate() brings older saves up to date one version at a time.
import { SAVE_VERSION } from "./config.js";
import { newGrid } from "./grid.js";
import { newScience } from "./science.js";
import { FENCES, FENCE_IDS } from "./data.js";

const LAYERS = { water: Uint8Array, struct: Uint8Array, fence: Uint8Array, cond: Uint8Array, flags: Uint8Array, bld: Int32Array, ex: Int32Array };

function toB64(arr) {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(str, Type) {
  const bytes = typeof Buffer !== "undefined" ? new Uint8Array(Buffer.from(str, "base64")) : Uint8Array.from(atob(str), c => c.charCodeAt(0));
  return new Type(bytes.buffer, bytes.byteOffset, bytes.byteLength / Type.BYTES_PER_ELEMENT);
}

export function serialize(state) {
  const g = state.grid, grid = { w: g.w, h: g.h };
  for (const k of Object.keys(LAYERS)) grid[k] = toB64(g[k]);
  return JSON.stringify({ ...state, grid });
}

export function deserialize(text) {
  const raw = JSON.parse(text);
  const g = newGrid(raw.grid.w, raw.grid.h);
  for (const [k, Type] of Object.entries(LAYERS)) if (raw.grid[k]) g[k].set(fromB64(raw.grid[k], Type));
  return migrate({ ...raw, grid: g });
}

// Older saves get their missing fields here. Add a step for each new SAVE_VERSION.
export function migrate(s) {
  if (!s.version || s.version > SAVE_VERSION) throw new Error("Unknown save version.");
  s.power = s.power || { on: true };
  s.testing = s.testing || {};
  s.bell = s.bell || [];
  s.openPens = s.openPens || [];
  for (const b of [s.books.today, s.books.last]) if (b) { b.sold = b.sold || 0; b.science = b.science || 0; }
  if (!s.science) {   // saves from before the labs keep the fences they already built
    s.science = newScience();
    for (const k of new Set(s.grid.fence)) { const f = k && FENCES[FENCE_IDS[k - 1]]; if (f && f.tech) s.science.done.push(f.tech); }
  }
  s.science = { ...newScience(), ...s.science };
  for (const list of [s.science.trips, s.science.clones]) list.forEach((x, i) => { if (x.slot === undefined) x.slot = i; });   // drone and incubator numbers
  s.version = SAVE_VERSION;
  return s;
}
