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
  w.state.science.done = ["stone", "glass", "concrete"];   // research the fences it builds with
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
    (w.spawn("dime", a.id), w.spawn("dime", a.id), ""), w.buyAnimal("lyst", b.id), w.buyAnimal("lyst", b.id), w.buyAnimal("lyst", b.id),
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
// The labs: each opens its panel when tapped; Time Travel Lab buttons work through the page.
const labs = await page.evaluate(async () => {
  const { world: w, ui } = window.__ppt, out = {}, keep = ui.selectedEx;
  w.state.money += 100000;
  const spots = { research: [4, 4], timetravel: [10, 4], genetics: [16, 4] };
  for (const [type, [x, y]] of Object.entries(spots)) {
    out[type + "Placed"] = w.place(type, x, y);
    ui.click([x + 1, y + 1], "click"); ui.lastPanel = ""; ui.refresh();
    out[type] = document.getElementById("side").textContent;
  }
  ui.click([11, 5], "click"); ui.lastPanel = ""; ui.refresh();
  document.querySelector('#side [data-period="Permian"]').click(); ui.refresh();
  out.mapOk = await new Promise(r => { const img = document.querySelector("#side .ttmap img"); if (!img) return r(false); if (img.complete) return r(img.naturalWidth === 260); img.onload = () => r(img.naturalWidth === 260); img.onerror = () => r(false); });
  out.marks = document.querySelectorAll("#side .ttmap .mark").length;
  document.querySelector('#side [data-scout="texasred"]').click();
  out.out = w.state.science.trips.length;
  out.stoneLocked = document.querySelector('[data-tool="fence:hedge"]').classList.contains("locked") === false && document.querySelector('[data-tool="fence:aquarium"]').classList.contains("locked");
  document.querySelector("#side [data-close]").click(); ui.refresh();   // the ✕ closes it, with a trip out ticking the panel
  out.closed = document.getElementById("side").innerHTML === "" && !ui.selectedBld;
  ui.selectedBld = 0; ui.selectedEx = keep; ui.lastPanel = ""; ui.refresh();
  return out;
});
if (labs.researchPlaced || labs.timetravelPlaced || labs.geneticsPlaced) fails.push("labs not placed: " + JSON.stringify(labs));
if (!/Researchers/.test(labs.research) || !/Exhibits/.test(labs.research)) fails.push("research panel: " + labs.research.slice(0, 120));
if (!/Timeline/.test(labs.timetravel) || !/Drones/.test(labs.timetravel)) fails.push("time travel panel: " + labs.timetravel.slice(0, 120));
if (!/Geneticists/.test(labs.genetics)) fails.push("genetics panel: " + labs.genetics.slice(0, 120));
if (!labs.mapOk || labs.marks !== 1) fails.push(`time travel map: loaded ${labs.mapOk}, ${labs.marks} markers in the Cisuralian`);
if (labs.out !== 1) fails.push("scout button sent " + labs.out + " drones");
if (!labs.closed) fails.push("the panel's close button left it open");
if (!labs.stoneLocked) fails.push("locked fences not greyed out in the menu");
const okMenu = menu.tray && !menu.barBefore && menu.bar && menu.picked === "fence:stone" && menu.pressed === "true" && menu.afterEsc1 === "select" && menu.trayStill && menu.closed && menu.shopPrice;
if (!okMenu) fails.push("build menu: " + JSON.stringify(menu));
const panel = await page.textContent("#side");
if (!/Exhibit/.test(panel || "")) fails.push("exhibit panel did not open: " + (panel || "").slice(0, 200));

const shot = process.argv.indexOf("--shot");
if (shot > 0) await page.screenshot({ path: process.argv[shot + 1] });
await browser.close(); server.close();
if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
console.log("smoke ok", JSON.stringify(result));
