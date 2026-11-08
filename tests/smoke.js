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
// Turning: with Move a tap turns a building where it stands; placing, R and the Turn button turn the ghost. Then the Staff Path tool paints.
const turned = await page.evaluate(() => {
  const { world: w, ui, cam } = window.__ppt, g = w.state.grid, c = document.getElementById("view"), r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const at = (x, y) => ({ clientX: r.left + ((x + 0.5) * 16 - cam.x) * cam.zoom / dpr, clientY: r.top + ((y + 0.5) * 16 - cam.y) * cam.zoom / dpr, pointerId: 1, button: 0, bubbles: true });
  const key = (k, shiftKey = false) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey }));
  const out = {}, snack = w.state.buildings.find(b => b.type === "snack"), rot0 = snack.rot;
  document.querySelector('[data-tool="move"]').click();
  const tap = () => { c.dispatchEvent(new PointerEvent("pointerdown", at(snack.x, snack.y))); c.dispatchEvent(new PointerEvent("pointerup", at(snack.x, snack.y))); };
  tap(); out.tapTurned = snack.rot === ((rot0 + 1) & 3);
  tap(); tap(); tap(); out.back = snack.rot === rot0;
  const right = (x, y, extra = {}) => c.dispatchEvent(new PointerEvent("pointerdown", { ...at(x, y), button: 2, buttons: 2, ...extra }));
  right(snack.x, snack.y); c.dispatchEvent(new PointerEvent("pointerup", { ...at(snack.x, snack.y), button: 2 }));
  out.rightMove = snack.rot === ((rot0 + 1) & 3);
  right(snack.x, snack.y, { shiftKey: true }); c.dispatchEvent(new PointerEvent("pointerup", { ...at(snack.x, snack.y), button: 2 }));
  out.rightBack = snack.rot === rot0;
  const camX = cam.x; right(2, 2); c.dispatchEvent(new PointerEvent("pointermove", { ...at(8, 2), buttons: 2 })); c.dispatchEvent(new PointerEvent("pointerup", { ...at(8, 2), button: 2 }));
  out.rightPans = cam.x !== camX; cam.x = camX;
  // Carrying with the left button held, a right press (a chord) turns it; letting go puts it down turned.
  c.dispatchEvent(new PointerEvent("pointerdown", { ...at(snack.x, snack.y), button: 0, buttons: 1 }));
  c.dispatchEvent(new PointerEvent("pointermove", { ...at(snack.x, snack.y), button: 2, buttons: 3 }));
  c.dispatchEvent(new PointerEvent("pointerup", { ...at(snack.x, snack.y), button: 0 }));
  out.rightCarry = snack.rot === ((rot0 + 1) & 3);
  w.moveBuilding(snack.id, snack.x, snack.y, rot0);
  document.querySelector('[data-tool="move"]').click();
  ui.setTool("place:bench");
  c.dispatchEvent(new PointerEvent("pointermove", at(5, 5)));
  const r0 = ui.ghost && ui.ghost.rot;
  key("r"); out.keyTurned = ui.ghost.rot === ((r0 + 1) & 3);
  key("r", true); out.shiftBack = ui.ghost.rot === r0;
  document.querySelector("#turn [data-turn]").click(); out.buttonTurned = ui.ghost.rot === ((r0 + 1) & 3);
  c.dispatchEvent(new PointerEvent("pointerdown", { ...at(5, 5), button: 2, buttons: 2 })); c.dispatchEvent(new PointerEvent("pointerup", { ...at(5, 5), button: 2 }));
  out.rightPlace = ui.ghost.rot === ((r0 + 2) & 3) && !w.state.buildings.some(b => b.x === 5 && b.y === 5);
  ui.setTool("select"); out.buttonGone = !document.querySelector("#turn [data-turn]");
  document.querySelector('[data-cat="paths"]').click();
  document.querySelector('[data-tool="staffpath"]').click(); out.staffTool = ui.tool === "staffpath";
  c.dispatchEvent(new PointerEvent("pointerdown", at(4, 8))); c.dispatchEvent(new PointerEvent("pointermove", at(6, 8))); c.dispatchEvent(new PointerEvent("pointerup", at(6, 8)));
  out.painted = [4, 5, 6].filter(x => g.struct[8 * g.w + x] === 4).length;
  document.querySelector('[data-tray="paths"] [data-close="a"]').click();
  return out;
});
if (!turned.tapTurned || !turned.back || !turned.rightMove || !turned.rightBack || !turned.rightPans || !turned.rightCarry || !turned.rightPlace || !turned.keyTurned || !turned.shiftBack || !turned.buttonTurned || !turned.buttonGone || !turned.staffTool || turned.painted !== 3)
  fails.push("turning / staff path: " + JSON.stringify(turned));
// Animals: select a Lystrosaurus, crate it and uncrate it, then Move it with the crate ghost into the other pen; a keeper carries it.
const herd = await page.evaluate(() => {
  const { world: w, ui, cam } = window.__ppt, c = document.getElementById("view"), r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const at = (x, y) => ({ clientX: r.left + ((x + 0.5) * 16 - cam.x) * cam.zoom / dpr, clientY: r.top + ((y + 0.5) * 16 - cam.y) * cam.zoom / dpr, pointerId: 1, button: 0, bubbles: true });
  const press = sel => { const b = document.querySelector("#side " + sel); if (!b) return false; b.click(); return true; };
  const [pa, pb] = w.state.exhibits, a = w.state.animals.find(x => x.sp === "lyst"), out = {};
  ui.click([Math.floor(a.x), Math.floor(a.y)], "click"); ui.lastPanel = ""; ui.refresh();
  out.panel = ui.selected === a && /Sell \$1,750/.test(document.getElementById("side").textContent);
  out.crated = press("[data-crate]") && a.crated; ui.refresh();
  out.uncrated = press("[data-uncrate]") && !a.crated; ui.refresh();
  press("[data-drop]");
  out.tool = ui.tool;
  const spot = w.derived.ex.get(pa.id).tiles.find(i => !w.state.grid.struct[i] && !w.state.grid.water[i] && !w.state.animals.some(m => Math.floor(m.x) + Math.floor(m.y) * w.state.grid.w === i));
  const sx = spot % w.state.grid.w, sy = (spot / w.state.grid.w) | 0;
  c.dispatchEvent(new PointerEvent("pointermove", at(sx, sy)));
  out.ghost = !!(ui.ghost && ui.ghost.crate === a.id && ui.ghost.ok);
  c.dispatchEvent(new PointerEvent("pointerdown", at(sx, sy))); c.dispatchEvent(new PointerEvent("pointerup", at(sx, sy)));
  out.ordered = w.state.jobs.some(j => j.kind === "haul" && j.animal === a.id) && ui.tool === "select";
  for (let k = 0; k < 200 && (a.crated || a.ex !== pa.id); k++) w.advance(2);
  out.moved = !a.crated && a.ex === pa.id && pb.id !== pa.id;
  ui.selected = null; ui.selectedEx = pa.id; ui.lastPanel = ""; ui.refresh();
  return out;
});
if (!herd.panel || !herd.crated || !herd.uncrated || herd.tool !== "crate" || !herd.ghost || !herd.ordered || !herd.moved) fails.push("moving an animal: " + JSON.stringify(herd));
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
  esc(); const closed = !shown(q('[data-tray="exhibits"]'));
  // Select is the default: a tray tool lasts only while its menu is open; closing the tray (or switching category) drops it.
  q('[data-cat="exhibits"]').click(); q('[data-tool="gate"]').click(); const gateOn = ui.tool === "gate", crossCursor = q("#view").style.cursor === "crosshair";
  q('[data-tray="exhibits"] [data-close="a"]').click(); const dropOnClose = ui.tool === "select" && q("#view").style.cursor === "default";
  q('[data-cat="exhibits"]').click(); q('[data-tool="gate"]').click(); q('[data-cat="paths"]').click(); const dropOnSwitch = ui.tool === "select";
  q('[data-cat="paths"]').click();
  q('[data-cat="build"]').click(); const shopPrice = q('[data-tray="build"]').textContent.includes("$1,500");
  q('[data-cat="build"]').click();
  return { tray, barBefore, bar, picked, pressed, afterEsc1, trayStill, closed, shopPrice, gateOn, crossCursor, dropOnClose, dropOnSwitch };
});
// The labs: each opens its panel when tapped, full size; the Time Travel Lab's slider, chips and buttons work through the page.
const labs = await page.evaluate(async () => {
  const { world: w, ui } = window.__ppt, out = {};
  out.keep = ui.selectedEx;
  w.state.money += 100000;
  const spots = { research: [4, 4], timetravel: [10, 4], genetics: [16, 4] };
  for (const [type, [x, y]] of Object.entries(spots)) {
    out[type + "Placed"] = w.place(type, x, y);
    ui.click([x + 1, y + 1], "click"); ui.lastPanel = ""; ui.refresh();
    out[type] = document.getElementById("side").textContent;
    out[type + "Full"] = document.getElementById("side").classList.contains("full");
  }
  // Research: hire one and start the Exhibits track's next step from its row.
  ui.click([5, 5], "click"); ui.lastPanel = ""; ui.refresh();
  document.querySelector('#side [data-hire-crew="researcher"]').click();
  document.querySelector('#side [data-assign="exhibits"]').click();
  out.onTrack = w.state.science.crew.filter(c => c.track === "exhibits").length;
  out.bay = /Research bays \(1 of 1 busy\)/.test(document.getElementById("side").textContent);
  ui.click([11, 5], "click"); ui.lastPanel = ""; ui.refresh();
  const { uAt, EPOCHS } = await import("/src/sim/science.js");
  const cis = EPOCHS.find(e => e.name === "Cisuralian"), r = document.querySelector("#side .gt-track").getBoundingClientRect();
  out.dragX = r.left + r.width * uAt(Math.sqrt(cis.from * cis.to)); out.dragY = r.top + r.height / 2;
  return out;
});
// Drag the slider from the far left to the Cisuralian with the real mouse.
await page.mouse.move(labs.dragX - 200, labs.dragY); await page.mouse.down();
await page.mouse.move(labs.dragX - 100, labs.dragY, { steps: 4 });
const midDrag = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains("gt-track"));
await page.mouse.move(labs.dragX, labs.dragY, { steps: 4 }); await page.mouse.up();
await page.waitForTimeout(400);   // a refresh or two: the panel must not throw the slider away
Object.assign(labs, await page.evaluate(async (keep) => {
  const { world: w, ui } = window.__ppt, out = {}, side = document.getElementById("side");
  out.epoch = side.querySelector(".gt-epoch").textContent;
  out.stillFocused = document.activeElement && document.activeElement.classList.contains("gt-track");
  const href = side.querySelector(".gt-map image").getAttribute("href");
  out.mapOk = await new Promise(r => { const img = new Image(); img.onload = () => r(img.naturalWidth === 260); img.onerror = () => r(false); img.src = href; });
  out.marks = side.querySelectorAll(".gt-map .gt-site").length;
  side.querySelector('.gt-chip[data-site="texasred"]').click();
  side.querySelector('[data-scout="texasred"]').click();
  out.out = w.state.science.trips.length;
  out.droneCard = /Scouting for animals/.test(side.textContent);
  w.advance(720 * 2); ui.refresh();
  out.reports = w.state.science.reports.length;
  side.querySelector('[data-tab="tt"][data-k="reports"]').click();
  out.reportShown = /Scouting report/.test(side.textContent);
  side.querySelector("[data-report]").click();
  out.reportsAfter = w.state.science.reports.length;
  out.stoneLocked = document.querySelector('[data-tool="fence:hedge"]').classList.contains("locked") === false && document.querySelector('[data-tool="fence:aquarium"]').classList.contains("locked");
  side.querySelector("[data-close]").click(); ui.refresh();   // the × closes it
  out.closed = side.innerHTML === "" && !ui.selectedBld;
  ui.ttTab = "lab"; ui.selectedBld = 0; ui.selectedEx = keep; ui.lastPanel = ""; ui.refresh();
  return out;
}, labs.keep));
if (labs.researchPlaced || labs.timetravelPlaced || labs.geneticsPlaced) fails.push("labs not placed: " + JSON.stringify(labs));
if (!labs.researchFull || !labs.timetravelFull || !labs.geneticsFull) fails.push("lab panels not full size");
if (!/Researchers/.test(labs.research) || !/Exhibits/.test(labs.research) || !/Research bays/.test(labs.research)) fails.push("research panel: " + labs.research.slice(0, 120));
if (labs.onTrack !== 1 || !labs.bay) fails.push(`research row: ${labs.onTrack} on the track, bay shown ${labs.bay}`);
if (!/Timeline/.test(labs.timetravel) || !/Drones/.test(labs.timetravel)) fails.push("time travel panel: " + labs.timetravel.slice(0, 120));
if (!/Geneticists/.test(labs.genetics) || !/Genome library/.test(labs.genetics)) fails.push("genetics panel: " + labs.genetics.slice(0, 120));
if (labs.epoch !== "Cisuralian" || !midDrag || !labs.stillFocused) fails.push(`timeline slider: at ${labs.epoch}, focused mid-drag ${midDrag}, after ${labs.stillFocused}`);
if (!labs.mapOk || labs.marks !== 2) fails.push(`time travel map: loaded ${labs.mapOk}, ${labs.marks} markers in the Cisuralian (Texas Red Beds, Hennessey)`);
if (labs.out !== 1 || !labs.droneCard) fails.push(`scout button sent ${labs.out} drones, drone card ${labs.droneCard}`);
if (labs.reports !== 1 || !labs.reportShown || labs.reportsAfter !== 0) fails.push(`trip reports: ${labs.reports} made, shown ${labs.reportShown}, ${labs.reportsAfter} after Done`);
if (!labs.closed) fails.push("the lab panel's close button left it open");
if (!labs.stoneLocked) fails.push("locked fences not greyed out in the menu");
const okMenu = menu.tray && !menu.barBefore && menu.bar && menu.picked === "fence:stone" && menu.pressed === "true" && menu.afterEsc1 === "select" && menu.trayStill && menu.closed && menu.shopPrice && menu.gateOn && menu.crossCursor && menu.dropOnClose && menu.dropOnSwitch;
if (!okMenu) fails.push("build menu: " + JSON.stringify(menu));
const panel = await page.textContent("#side");
if (!/Exhibit/.test(panel || "")) fails.push("exhibit panel did not open: " + (panel || "").slice(0, 200));


// Rotated building art: exercise the real renderer and image loading for all guest types.
const buildingArt = await page.evaluate(async () => {
  const { draw } = await import("./src/view/renderer.js");
  const { newPark } = await import("./src/sim/world.js");
  const { BUILDINGS } = await import("./src/sim/data.js");
  const w = newPark(7); w.setSandbox(true);
  const types = ["restroom", "snack", "gift", "bench", "bin"];
  for (let row = 0; row < types.length; row++) for (let rot = 0; rot < 4; rot++) w.place(types[row], 10 + rot * 5, 10 + row * 4, rot);
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext("2d"), original = ctx.drawImage, cam = { x: 0, y: 0, zoom: 2 };
  let calls = [];
  ctx.drawImage = function(im, ...args) {
    calls.push({ path: new URL(im.src).pathname, mirrored: this.getTransform().a < 0, alpha: this.globalAlpha });
    return original.call(this, im, ...args);
  };
  const render = view => { calls = []; draw(ctx, w, cam, view || {}); return calls; };
  // The renderer loads its images lazily; wait for all twenty placed instances to draw sprites.
  for (let n = 0; n < 100 && render().length !== 20; n++) await new Promise(r => setTimeout(r, 10));
  const placed = render(), out = [];
  for (let row = 0; row < types.length; row++) {
    const type = types[row], def = BUILDINGS[type];
    const expected = [def.sprite, def.spriteSide, def.spriteBack, def.spriteSide];
    for (let rot = 0; rot < 4; rot++) {
      const actual = placed[row * 4 + rot];
      if (!actual || actual.path !== "/" + expected[rot] || actual.mirrored !== (rot === 3)) out.push(type + " facing " + rot);
      const b = w.state.buildings.find(b => b.type === type && b.rot === rot);
      const ghost = render({ ghost: { id: b.id, type, x: 35, y: 10, rot, ok: true } }).filter(c => c.alpha < 1);
      if (ghost.length !== 1 || ghost[0].path !== "/" + expected[rot] || ghost[0].mirrored !== (rot === 3)) out.push(type + " ghost " + rot);
      if (!ctx.getTransform().isIdentity || ctx.globalAlpha !== 1) out.push("canvas state leaked");
    }
  }
  return out;
});
if (buildingArt.length) fails.push("building art: " + buildingArt.join(", "));

const shot = process.argv.indexOf("--shot");
if (shot > 0) await page.screenshot({ path: process.argv[shot + 1] });
await browser.close(); server.close();
if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
console.log("smoke ok", JSON.stringify(result));
