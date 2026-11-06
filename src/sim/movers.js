// Shared walking for animals, staff and guests: each has x, y (tile units, the tile's center at +0.5) and a path of tile indexes.
import { xy } from "./grid.js";

export const tileOf = (g, m) => Math.floor(m.y) * g.w + Math.floor(m.x);

export function placeAt(g, m, i) { const [x, y] = xy(g, i); m.x = x + 0.5; m.y = y + 0.5; }

// Moves m along its path by speed * dt tiles. Returns true when it has arrived (no path left).
// Facing: face is -1 west or 1 east (kept through steps straight up or down); fx and fy are the current step's
// direction, -1, 0 or 1 each (a diagonal step has both).
export function walk(g, m, speed, dt) {
  let left = speed * dt;
  while (left > 0 && m.path && m.path.length) {
    const [tx, ty] = xy(g, m.path[0]), gx = tx + 0.5, gy = ty + 0.5;
    const dx = gx - m.x, dy = gy - m.y, d = Math.hypot(dx, dy);
    if (d <= left) { m.x = gx; m.y = gy; m.path.shift(); left -= d; }
    else {
      m.x += (dx / d) * left; m.y += (dy / d) * left; left = 0;
      const e = 1e-6;
      m.fx = dx < -e ? -1 : dx > e ? 1 : 0; m.fy = dy < -e ? -1 : dy > e ? 1 : 0;
      if (m.fx) m.face = m.fx;
    }
  }
  return !m.path || !m.path.length;
}
