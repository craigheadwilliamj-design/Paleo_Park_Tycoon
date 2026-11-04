// Browser smoke test: serves the repo, opens it in headless Chromium, builds a small park through the page's world
// commands, runs it, and checks there were no errors. `node tests/smoke.js [--shot out.png]`.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = fileURLToPath(new URL("..", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };

const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  try { const body = await readFile(join(root, p || "index.html")); res.writeHead(200, { "content-type": TYPES[extname(p || ".html")] || "application/octet-stream" }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const url = `http://localhost:${server.address().port}/index.html`;

const fails = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", e => fails.push("page error: " + e.message));
page.on("console", m => { if (m.type() === "error") fails.push("console: " + m.text()); });
await page.goto(url);
try { await page.waitForFunction(() => window.__ppt && window.__ppt.world, null, { timeout: 15000 }); }
catch { console.log(["the game never started", ...fails].join("\n")); await browser.close(); server.close(); process.exit(1); }

const result = await page.evaluate(() => {
  const w = window.__ppt.world, g = w.state.grid, ex = Math.floor(g.w / 2);
  const line = (x0, y0, x1, y1) => { const o = []; for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) o.push([x, y]); return o; };
  const ring = (x0, y0, x1, y1) => line(x0, y0, x1, y1).filter(([x, y]) => x === x0 || x === x1 || y === y0 || y === y1);
  const why = [
    w.paint("path", line(ex, 40, ex, g.h - 3)), w.paint("path", line(ex - 20, 40, ex + 20, 40)),
    w.paint("fence:stone", ring(ex - 18, 28, ex - 6, 39)), w.paint("gate", [[ex - 12, 39]]), w.paint("chute", [[ex - 9, 39]]),
    w.paint("water:shallow", line(ex - 16, 30, ex - 14, 32)),
    w.paint("fence:palisade", ring(ex + 4, 28, ex + 16, 39)), w.paint("gate", [[ex + 10, 39]]),
    w.place("shed", ex + 2, 42), w.paint("path", line(ex + 1, 41, ex + 1, 44)), w.place("snack", ex - 4, 41),
  ];
  const [a, b] = w.state.exhibits;
  why.push(w.setBiome(a.id, "desert"), w.setBiome(b.id, "grassland"), w.place("feeder", ex - 10, 35), w.place("feeder", ex + 10, 35),
    w.buyAnimal("dime", a.id), w.buyAnimal("dime", a.id), w.buyAnimal("lyst", b.id), w.buyAnimal("lyst", b.id), w.buyAnimal("lyst", b.id),
    w.hire("keeper"), w.hire("mechanic"));
  w.advance(720 * 3);
  const sold = w.state.money; why.push(w.bulldoze([[ex - 20, 40]]));   // the far end of the path
  const refunded = w.state.money > sold;
  window.__ppt.ui.selectedEx = a.id;
  const cam = window.__ppt.cam; cam.zoom = 2; cam.x = (ex - 22) * 16; cam.y = 24 * 16;   // frame both pens for the screenshot
  return { why: why.filter(Boolean), day: w.state.day, guests: w.state.books.last.visitors, escaped: w.state.animals.filter(x => x.escaped).length,
           hungry: w.state.animals.filter(x => x.need.hunger > 90).length, refunded };
});
await page.waitForTimeout(800);
if (result.why.length) fails.push("refused commands: " + result.why.join(" | "));
if (result.day !== 4) fails.push("day is " + result.day);
if (!result.guests) fails.push("no guests visited");
if (result.escaped) fails.push(result.escaped + " animals escaped from stone/palisade");
if (result.hungry) fails.push(result.hungry + " animals starving");
if (!result.refunded) fails.push("bulldozing gave nothing back");
// Bulldoze through the page: drag over a path tile, check it went.
const gone = await page.evaluate(async () => {
  const { ui, world: w, cam } = window.__ppt, g = w.state.grid, ex = Math.floor(g.w / 2), c = document.getElementById("view");
  document.querySelector('[data-tool="bulldoze"]').click();
  const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const at = (x, y) => ({ clientX: r.left + ((x + 0.5) * 16 - cam.x) * cam.zoom / dpr, clientY: r.top + ((y + 0.5) * 16 - cam.y) * cam.zoom / dpr, pointerId: 1, button: 0, bubbles: true });
  c.dispatchEvent(new PointerEvent("pointerdown", at(ex + 18, 40))); c.dispatchEvent(new PointerEvent("pointermove", at(ex + 20, 40)));
  const marked = (ui.preview || []).length;
  c.dispatchEvent(new PointerEvent("pointerup", at(ex + 20, 40)));
  document.querySelector('[data-tool="bulldoze"]').click();   // pressing it again goes back to Select
  return { tool: ui.tool, marked, left: [18, 19, 20].filter(d => g.struct[40 * g.w + ex + d]).length };
});
if (gone.marked !== 3 || gone.left || gone.tool !== "select") fails.push("bulldoze tool: " + JSON.stringify(gone));
// Move: drag the snack stand two tiles right.
const moved = await page.evaluate(() => {
  const { world: w, cam } = window.__ppt, c = document.getElementById("view"), r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const at = (x, y) => ({ clientX: r.left + ((x + 0.5) * 16 - cam.x) * cam.zoom / dpr, clientY: r.top + ((y + 0.5) * 16 - cam.y) * cam.zoom / dpr, pointerId: 1, button: 0, bubbles: true });
  const snack = w.state.buildings.find(b => b.type === "snack"), x0 = snack.x;
  document.querySelector('[data-tool="move"]').click();
  c.dispatchEvent(new PointerEvent("pointerdown", at(snack.x, snack.y + 1))); c.dispatchEvent(new PointerEvent("pointermove", at(snack.x - 2, snack.y + 1)));
  c.dispatchEvent(new PointerEvent("pointerup", at(snack.x - 2, snack.y + 1)));
  document.querySelector('[data-tool="move"]').click();
  return snack.x - x0;
});
if (moved !== -2) fails.push("move tool moved the stand by " + moved);
// The build menu: a category opens its tray, a list head opens its bar above, a tool in it picks that tool; Esc backs out.
const menu = await page.evaluate(() => {
  const { ui } = window.__ppt, q = s => document.querySelector(s), shown = el => !!el && el.getClientRects().length > 0;
  const esc = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  q('[data-cat="exhibits"]').click();
  const tray = shown(q('[data-tray="exhibits"]')), barBefore = shown(q('[data-tool="fence:stone"]'));
  q('[data-tray="exhibits"] .srow.head').click();
  const bar = shown(q('[data-tool="fence:stone"]'));
  q('[data-tool="fence:stone"]').click();
  const picked = ui.tool, pressed = q('[data-tool="fence:stone"]').getAttribute("aria-pressed");
  esc(); const afterEsc1 = ui.tool, trayStill = shown(q('[data-tray="exhibits"]'));
  esc(); esc(); const closed = !shown(q('[data-tray="exhibits"]'));
  q('[data-cat="build"]').click(); const shopPrice = q('[data-tray="build"]').textContent.includes("$1,500");
  q('[data-cat="build"]').click();
  return { tray, barBefore, bar, picked, pressed, afterEsc1, trayStill, closed, shopPrice };
});
const okMenu = menu.tray && !menu.barBefore && menu.bar && menu.picked === "fence:stone" && menu.pressed === "true" && menu.afterEsc1 === "select" && menu.trayStill && menu.closed && menu.shopPrice;
if (!okMenu) fails.push("build menu: " + JSON.stringify(menu));
const panel = await page.textContent("#side");
if (!/Exhibit/.test(panel || "")) fails.push("exhibit panel did not open");

const shot = process.argv.indexOf("--shot");
if (shot > 0) await page.screenshot({ path: process.argv[shot + 1] });
await browser.close(); server.close();
if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
console.log("smoke ok", JSON.stringify(result));
