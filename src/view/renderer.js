// Draws the world onto a canvas. Reads the sim, never writes to it. Placeholder art: flat colors and blocks
// in the right sizes and places, to be swapped for sprites once the golden assets exist.
import { TILE, displayPx, personPx } from "./display.js";
import { S_PATH, S_FENCE, W_NONE, W_DEEP, F_GATE, F_CHUTE } from "../sim/config.js";
import { FENCES, BIOMES, BUILDINGS, SPECIES, PARK_GROUND, PARK_WATER } from "../sim/data.js";
import { fenceId } from "../sim/grid.js";
import { condition } from "../sim/exhibits.js";

// Shade a #rrggbb color: k > 0 lightens, k < 0 darkens (keeps the hue, like a ramp step).
const shades = new Map();
export function shade(hex, k) {
  const key = hex + k;
  if (shades.has(key)) return shades.get(key);
  const n = parseInt(hex.slice(1), 16), f = c => Math.max(0, Math.min(255, Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k))));
  const out = "#" + [n >> 16, (n >> 8) & 255, n & 255].map(f).map(c => c.toString(16).padStart(2, "0")).join("");
  shades.set(key, out);
  return out;
}
// A stable per-tile number, so ground detail never moves between frames or loads.
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function draw(ctx, world, cam, ui) {
  const { state, derived } = world, g = state.grid, z = cam.zoom, T = TILE * z;
  tickAnim(state);
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#26301f"; ctx.fillRect(0, 0, W, H);
  const x0 = Math.max(0, Math.floor(cam.x / TILE)), y0 = Math.max(0, Math.floor(cam.y / TILE));
  const x1 = Math.min(g.w, Math.ceil((cam.x + W / z) / TILE) + 1), y1 = Math.min(g.h, Math.ceil((cam.y + H / z) / TILE) + 1);
  const sx = x => Math.round((x * TILE - cam.x) * z), sy = y => Math.round((y * TILE - cam.y) * z);
  const biomeOf = i => { const id = derived.exOf[i]; const e = id && state.exhibits.find(e => e.id === id); return e ? BIOMES[e.biome] : null; };

  // Ground and water.
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * g.w + x, b = biomeOf(i), px = sx(x), py = sy(y);
    let base = b ? b.ground : PARK_GROUND;
    if (!b) base = (y >> 1) & 1 ? shade(PARK_GROUND, -0.035) : PARK_GROUND;   // faint mowed stripes, two tiles wide
    ctx.fillStyle = base; ctx.fillRect(px, py, T, T);
    const r = hash(x, y);
    if (r < 0.18) { ctx.fillStyle = shade(base, r < 0.09 ? -0.12 : 0.1); const s = Math.max(1, (z * 3) | 0); ctx.fillRect(px + ((r * 97) % 1) * (T - 2 * s), py + ((r * 53) % 1) * (T - 2 * s), 2 * s, s); }
    if (g.water[i] !== W_NONE) {
      const ramp = b ? b.water : PARK_WATER;
      ctx.fillStyle = g.water[i] === W_DEEP ? ramp[1] : ramp[0]; ctx.fillRect(px, py, T, T);
      if (r < 0.25) { ctx.fillStyle = shade(ctx.fillStyle, 0.18); ctx.fillRect(px + 3 * z, py + ((r * 61) % 1) * (T - 2 * z), 5 * z, z); }
    }
    if (g.struct[i] === S_PATH) {
      ctx.fillStyle = "#c8b48a"; ctx.fillRect(px, py, T, T);
      ctx.fillStyle = "#b3a079"; if (r < 0.3) ctx.fillRect(px + ((r * 41) % 1) * (T - 2 * z), py + ((r * 29) % 1) * (T - 2 * z), 2 * z, 2 * z);
    }
  }

  // Fences: a top and a short front face, both tinted by condition. Gates and chutes are marked.
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * g.w + x;
    if (g.struct[i] !== S_FENCE) continue;
    const f = FENCES[fenceId(g, i)], c = condition(g.cond[i]), px = sx(x), py = sy(y);
    let col = f.color;
    if (c === "worn") col = shade(col, -0.18); else if (c === "damaged") col = shade(col, -0.4);
    if (f.power && !state.power.on) col = shade(col, -0.3);
    const front = Math.round(T * 0.35);
    ctx.fillStyle = shade(col, 0.12); ctx.fillRect(px, py - front, T, T);                 // top
    ctx.fillStyle = shade(col, -0.28); ctx.fillRect(px, py + T - front, T, front);         // front face
    if (f.power) { ctx.fillStyle = shade(col, -0.45); for (let k = 0; k < 3; k++) ctx.fillRect(px, py - front + (k + 1) * (T / 4), T, z); }
    if (g.flags[i] & F_GATE) { ctx.fillStyle = "#e9e1c8"; ctx.fillRect(px + T * 0.25, py - front + T * 0.25, T * 0.5, T * 0.5); }
    if (g.flags[i] & F_CHUTE) { ctx.fillStyle = "#3b2a1a"; ctx.fillRect(px + T * 0.3, py - front + T * 0.35, T * 0.4, T * 0.3); }
  }

  // Buildings.
  // The one being moved draws only as the ghost.
  const movingId = ui.ghost && ui.ghost.id;
  for (const b of state.buildings) if (b.id !== movingId) drawBuilding(ctx, BUILDINGS[b.type], sx(b.x), sy(b.y), T, z);

  // Walkers, sorted by their feet so nearer ones draw on top.
  const walkers = [
    ...state.animals.filter(a => !a.crated).map(a => ({ k: "a", m: a })), ...state.staff.map(s => ({ k: "s", m: s })), ...state.guests.map(gst => ({ k: "g", m: gst })),
  ].sort((p, q) => p.m.y - q.m.y);
  for (const { k, m } of walkers) {
    const fx = Math.round((m.x * TILE - cam.x) * z), fy = Math.round((m.y * TILE - cam.y) * z);
    if (k === "a") drawAnimal(ctx, m, fx, fy, z, ui.selected === m);
    else drawPerson(ctx, fx, fy, z, k === "s" ? ({ keeper: "#3f6b3a", mechanic: "#4a5f86", guard: "#2f2f38" }[m.role] || "#555") : guestColor(m.id));
  }

  // Tool preview and hover.
  if (ui.preview) for (const [x, y] of ui.preview) { ctx.fillStyle = ui.previewOk ? "#ffffff55" : "#ff404055"; ctx.fillRect(sx(x), sy(y), T, T); }
  // Placement ghost: the footprint tinted (white fits, red doesn't) under a see-through copy of the building.
  if (ui.ghost) {
    const gh = ui.ghost, def = BUILDINGS[gh.type], px = sx(gh.x), py = sy(gh.y);
    ctx.fillStyle = gh.ok ? "#ffffff40" : "#ff404066"; ctx.fillRect(px, py, def.w * T, def.h * T);
    ctx.save(); ctx.globalAlpha = 0.55; drawBuilding(ctx, def, px, py, T, z); ctx.restore();
    ctx.strokeStyle = gh.ok ? "#ffffffcc" : "#ff4040"; ctx.lineWidth = Math.max(1, z / 2); ctx.strokeRect(px + 0.5, py + 0.5, def.w * T - 1, def.h * T - 1);
  }
  if (ui.hover && !ui.preview && !ui.ghost) { ctx.strokeStyle = "#ffffff88"; ctx.lineWidth = 1; ctx.strokeRect(sx(ui.hover[0]) + 0.5, sy(ui.hover[1]) + 0.5, T - 1, T - 1); }
  if (ui.selectedEx) {
    const t = derived.ex.get(ui.selectedEx);
    if (t) { ctx.fillStyle = "#ffffff22"; for (const i of t.tiles) ctx.fillRect(sx(i % g.w), sy((i / g.w) | 0), T, T);
      const danger = Math.max(0, ...state.animals.filter(a => a.ex === ui.selectedEx).map(a => SPECIES[a.sp].danger));
      if (t.weakest >= 0 && danger > t.security) {   // mark the tile that will give way
        ctx.strokeStyle = "#ff5a3a"; ctx.lineWidth = 2; ctx.strokeRect(sx(t.weakest % g.w) + 1, sy((t.weakest / g.w) | 0) + 1, T - 2, T - 2); } }
  }
}

// Placeholder building: a flat roof and a front face, with a short label.
function drawBuilding(ctx, def, px, py, T, z) {
  const w = def.w * T, h = def.h * T, front = Math.round(h * 0.4);
  ctx.fillStyle = shade(def.color, -0.3); ctx.fillRect(px, py + h - front, w, front);
  ctx.fillStyle = def.color; ctx.fillRect(px, py - front * 0.3, w, h - front * 0.7);
  if (z >= 2 && def.w > 1) { ctx.fillStyle = "#fff8"; ctx.font = `${6 * z}px sans-serif`; ctx.fillText(def.name, px + 2 * z, py + 7 * z); }
}

const GUEST_COLORS = ["#c0504d", "#4f81bd", "#9bbb59", "#8064a2", "#f79646", "#d9a441", "#4bacc6"];
const guestColor = id => GUEST_COLORS[id % GUEST_COLORS.length];

// Animal sprites: art/animals/<name>-walk-<facing>.png (a strip of `frames` frames, each `frame` px
// square or [w, h]) and <name>-stand-<facing>.png, with the animal's feet at `anchor`. Facings follow the
// step (fx, fy): east and west in profile, the four diagonals, and straight up or down the map north or
// south. A sprite may instead have up/down views turned a little to one side (north_r/north_l,
// south_r/south_l); that side alternates with each new run up or down. Views the sprite lacks (its box
// lists the ones it has) fall back to the profile.
const spriteImgs = new Map();
function spriteImg(path) {
  let im = spriteImgs.get(path);
  if (!im) { im = new Image(); im.src = path; spriteImgs.set(path, im); }
  return im.complete && im.naturalWidth ? im : null;
}
function facingOf(m, sp, w) {
  const side = (m.face || 1) > 0 ? "east" : "west", ns = m.fy < 0 ? "north" : "south";
  let v = side;
  if (m.fy && m.fx) { w.fy = 0; v = ns + (m.fx > 0 ? "east" : "west"); }
  else if (m.fy) {
    if (m.fy !== w.fy) { w.fy = m.fy; w.lean = -w.lean; }   // a new run up or down: lean the other way
    v = sp.box[ns] ? ns : ns + (w.lean > 0 ? "_r" : "_l");
  } else w.fy = 0;
  return sp.box[v] ? v : side;
}
// Where the head points on screen (for the shadow, which sits under the trunk, a little ahead of the feet).
const AHEAD = { east: [1, 0], west: [-1, 0], northeast: [0.7, -0.7], northwest: [-0.7, -0.7], southeast: [0.7, 0.7], southwest: [-0.7, 0.7],
                north: [0, -1], south: [0, 1], north_r: [0.35, -0.95], north_l: [-0.35, -0.95], south_r: [0.35, 0.95], south_l: [-0.35, 0.95] };
// The walk frame follows the distance walked (one cycle every `cycle` tiles), so the feet don't
// slide whatever the game speed. View-only bookkeeping, never saved; ids offset the start so a
// group doesn't step in time.
const walked = new WeakMap();
function walkState(a, sp) {
  let w = walked.get(a);
  if (!w) { w = { x: a.x, y: a.y, d: ((a.id * 0.37) % 1) * sp.cycle, fy: 0, lean: a.id % 2 ? 1 : -1, fresh: true }; walked.set(a, w); }
  return w;
}
// Standing and resting loops run on a view clock: real seconds, but only while the park clock moves, so
// they freeze on pause and don't race at 4x. Lying down and getting up follow the park clock instead
// (the rest action's minutes), so the animal is up before it walks off at any speed.
let animT = 0, lastNow = 0, lastClock = -1;
function tickAnim(state) {
  const now = performance.now(), key = state.day * 1e4 + state.clock;
  if (key !== lastClock && lastNow) animT += Math.min(0.25, (now - lastNow) / 1000);
  lastNow = now; lastClock = key;
}
// Which strip and frame a still animal shows: [strip, frame].
function stillFrame(a, sp, w) {
  const loop = (k, off) => Math.floor(((animT / sp[k].s + off) % 1) * sp[k].frames);
  const off = (a.id * 0.618) % 1;
  if (a.act === "rest" && sp.rest) {
    if (w.restFrom === undefined) w.restFrom = w.fresh ? Infinity : a.t;   // a park loaded mid-nap is already down
    const p = Math.min(1, (w.restFrom - a.t) / sp.lie.min, a.t / sp.lie.min);
    return p < 1 ? ["lie", Math.max(0, Math.round(p * (sp.lie.frames - 1)))] : ["rest", loop("rest", off)];
  }
  w.restFrom = undefined;
  const feed = a.act === "drink" && !sp.drink ? "eat" : a.act;   // drinking borrows the eating loop unless it has its own
  if ((feed === "eat" || feed === "drink") && sp[feed]) return [feed, loop(feed, off)];
  if (a.act === "maul" && sp.attack) return ["attack", loop("attack", off)];   // at the fence, biting it
  return sp.idle ? ["idle", loop("idle", off)] : ["stand", 0];
}
function walkFrame(a, sp, w) {
  w.d += Math.hypot(a.x - w.x, a.y - w.y); w.x = a.x; w.y = a.y;
  return Math.floor((w.d / sp.cycle) * sp.frames) % sp.frames;
}

function drawAnimal(ctx, a, fx, fy, z, sel) {
  const s = SPECIES[a.sp], sp = s.sprite;
  if (sp) {
    const moving = a.path && a.path.length > 0, w = walkState(a, sp), facing = facingOf(a, sp, w), f = walkFrame(a, sp, w);
    const [strip, sf] = moving ? ["walk", f] : stillFrame(a, sp, w);
    w.fresh = false;
    const im = spriteImg(`art/animals/${sp.name}-${strip}-${facing}.png`) || spriteImg(`art/animals/${sp.name}-stand-${facing}.png`);
    if (im) {
      // scale: the sprite drawn smaller than its pixels (a drawing too big for the size curve). Crisp from zoom 2;
      // at zoom 1 its pixels are under a screen pixel, so that one draw is smoothed instead of dropping every other one.
      const k = z * (sp.scale || 1);
      const [FW, FH] = Array.isArray(sp.frame) ? sp.frame : [sp.frame, sp.frame], x = fx - sp.anchor[0] * k, y = fy - sp.anchor[1] * k, [b0, b1, b2, b3] = sp.box[facing];
      // shadow: a stepped oval under the trunk
      const [ax, ay] = AHEAD[facing], hw = Math.round((b2 - b0) * 0.28 * (sp.scale || 1)), cx = fx + Math.round(ax * 3) * z, cy = fy + Math.round(ay * 3) * z;
      ctx.fillStyle = "#00000033";
      ctx.fillRect(cx - hw * z, cy - z, 2 * hw * z, 2 * z);
      ctx.fillRect(cx - Math.round(hw * 0.7) * z, cy - 2 * z, 2 * Math.round(hw * 0.7) * z, z);
      ctx.fillRect(cx - Math.round(hw * 0.7) * z, cy + z, 2 * Math.round(hw * 0.7) * z, z);
      if (k < 1) ctx.imageSmoothingEnabled = true;
      ctx.drawImage(im, im.naturalWidth > FW ? sf * FW : 0, 0, FW, FH, x, y, FW * k, FH * k);
      ctx.imageSmoothingEnabled = false;
      if (a.escaped || sel) { ctx.strokeStyle = a.escaped ? "#ff3a2a" : "#ffffff"; ctx.lineWidth = 1;
        ctx.strokeRect(x + b0 * k - 2, y + b1 * k - 2, (b2 - b0) * k + 4, (b3 - b1) * k + 4); }
      return;
    }
  }
  drawBlock(ctx, a, s, fx, fy, z, sel);
}

// Placeholder animal (no sprite yet, or still loading): a stepped side-on block body with a head,
// sized by the display curve, facing its way.
function drawBlock(ctx, a, s, fx, fy, z, sel) {
  const len = displayPx(s.len) * z, h = Math.max(3 * z, Math.round(len * 0.42)), dir = a.face || 1;
  const x = Math.round(fx - len / 2), y = Math.round(fy - h);
  ctx.fillStyle = "#00000033"; ctx.fillRect(x, fy - z, len, 2 * z);                         // shadow
  ctx.fillStyle = s.color; ctx.fillRect(x, y + h * 0.25, len, h * 0.55);                      // body
  ctx.fillStyle = shade(s.color, 0.2); ctx.fillRect(x, y + h * 0.25, len, Math.max(z, h * 0.12));   // lit back
  const hw = Math.max(2 * z, len * 0.22);
  ctx.fillStyle = shade(s.color, -0.1); ctx.fillRect(dir > 0 ? x + len - hw * 0.4 : x - hw * 0.6, y, hw, h * 0.45);   // head
  ctx.fillStyle = shade(s.color, -0.3);
  for (const lx of [0.15, 0.7]) ctx.fillRect(x + len * lx, y + h * 0.8, Math.max(z, len * 0.1), h * 0.2);  // legs
  if (a.escaped || sel) { ctx.strokeStyle = a.escaped ? "#ff3a2a" : "#ffffff"; ctx.lineWidth = 1; ctx.strokeRect(x - 2, y - 2, len + 4, h + 4); }
}
function drawPerson(ctx, fx, fy, z, color) {
  const h = personPx() * z, w = 8 * z;
  ctx.fillStyle = "#00000033"; ctx.fillRect(fx - w, fy - z / 2, w * 2, z);
  ctx.fillStyle = color; ctx.fillRect(fx - w / 2, fy - h * 0.7, w, h * 0.7);
  ctx.fillStyle = "#e8c39e"; ctx.fillRect(fx - w / 2, fy - h, w, h * 0.3);
}
