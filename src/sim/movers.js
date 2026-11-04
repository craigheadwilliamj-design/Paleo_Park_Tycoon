// Shared walking for animals, staff and guests: each has x, y (tile units, the tile's center at +0.5) and a path of tile indexes.
import { xy } from "./grid.js";

export const tileOf = (g, m) => Math.floor(m.y) * g.w + Math.floor(m.x);

export function placeAt(g, m, i) { const [x, y] = xy(g, i); m.x = x + 0.5; m.y = y + 0.5; }

// Moves m along its path by speed * dt tiles. Returns true when it has arrived (no path left).
export function walk(g, m, speed, dt) {
  let left = speed * dt;
  while (left > 0 && m.path && m.path.length) {
    const [tx, ty] = xy(g, m.path[0]), gx = tx + 0.5, gy = ty + 0.5;
    const dx = gx - m.x, dy = gy - m.y, d = Math.hypot(dx, dy);
    if (d <= left) { m.x = gx; m.y = gy; m.path.shift(); left -= d; }
    else { m.x += (dx / d) * left; m.y += (dy / d) * left; m.face = dx < 0 ? -1 : dx > 0 ? 1 : m.face; left = 0; }
  }
  return !m.path || !m.path.length;
}
