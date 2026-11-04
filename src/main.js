// Boots the game: loads the saved park (or starts one), runs the frame loop, and autosaves.
import { World, newPark } from "./sim/world.js";
import { serialize, deserialize } from "./sim/save.js";
import { draw } from "./view/renderer.js";
import { UI } from "./view/ui.js";
import { TILE } from "./view/display.js";

const SAVE_KEY = "ppt2-save";
const MIN_PER_SEC = 2;   // park minutes a real second at 1x

function load() {
  try { const t = localStorage.getItem(SAVE_KEY); if (t) return new World(deserialize(t)); } catch (e) { console.warn("Save not loaded:", e); }
  return newPark(Date.now() | 0);
}
function save(world) { try { localStorage.setItem(SAVE_KEY, serialize(world.state)); } catch (e) { /* storage can be unavailable */ } }

const canvas = document.getElementById("view"), ctx = canvas.getContext("2d");
let world = load();
const cam = { x: 0, y: 0, zoom: 2 };

function fit() {
  const dpr = window.devicePixelRatio || 1, r = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
  clamp();
}
function clamp() {
  const g = world.state.grid, vw = canvas.width / cam.zoom, vh = canvas.height / cam.zoom;
  cam.x = Math.max(-vw / 2, Math.min(g.w * TILE - vw / 2, cam.x));
  cam.y = Math.max(-vh / 2, Math.min(g.h * TILE - vh / 2, cam.y));
}
function zoom(dir, ev) {
  const z0 = cam.zoom, z1 = Math.max(1, Math.min(4, z0 + dir));
  if (z1 === z0) return;
  const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const px = ev ? (ev.clientX - r.left) * dpr : canvas.width / 2, py = ev ? (ev.clientY - r.top) * dpr : canvas.height / 2;
  cam.x += px / z0 - px / z1; cam.y += py / z0 - py / z1; cam.zoom = z1; clamp();
}
function centerOnEntrance() {
  const ent = world.state.buildings.find(b => b.type === "entrance");
  if (ent) { cam.x = ent.x * TILE - canvas.width / cam.zoom / 2; cam.y = ent.y * TILE - canvas.height / cam.zoom * 0.7; }
  clamp();
}

const ui = new UI(world, canvas, cam, {
  clamp, zoom,
  newPark() { world = newPark(Date.now() | 0); ui.world = world; ui.selected = null; ui.selectedEx = 0; save(world); centerOnEntrance(); },
});
window.addEventListener("resize", fit);
fit(); centerOnEntrance(); ui.refresh();

let last = performance.now(), hudT = 0, saveT = 0;
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  if (ui.speed) world.advance(dt * MIN_PER_SEC * ui.speed);
  draw(ctx, world, cam, ui.view);
  if ((hudT += dt) > 0.25) { hudT = 0; ui.refresh(); }
  if ((saveT += dt) > 20) { saveT = 0; save(world); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener("pagehide", () => save(world));
window.__ppt = { get world() { return world; }, ui, cam, save: () => save(world) };   // for the smoke test
