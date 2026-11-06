// Routing. Breadth-first search over the tiles a mover may stand on, to the nearest of a set of goal tiles.
// Maps are small (a few thousand tiles), so plain BFS is fast enough and finds the nearest goal for free.
// Animals (diag) also step diagonally: a Dijkstra search with diagonal steps costing about 1.4, so routes
// run straight and only go diagonal where it's shorter.
import { walkable, neighbours } from "./grid.js";

// Returns the tile list from start (exclusive) to the nearest goal (inclusive), [] if already there, or null.
// Goals must be tiles the mover can stand on (the tile beside a feeder, not the feeder).
// allow(i) can narrow the walkable tiles further (an animal stays in its exhibit, a keeper keeps out of a dangerous pen).
export function route(g, start, goals, who, allow, diag = false) {
  const goal = goals instanceof Set ? goals : new Set(goals);
  if (!goal.size) return null;
  if (goal.has(start)) return [];
  if (diag) return route8(g, start, goal, who, allow);
  const from = new Int32Array(g.w * g.h).fill(-1), queue = [start];
  from[start] = start;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    for (const j of neighbours(g, i)) {
      if (from[j] !== -1) continue;
      if (!walkable(g, j, who) || (allow && !allow(j))) continue;
      from[j] = i;
      if (goal.has(j)) {
        const path = [j];
        for (let k = i; k !== start; k = from[k]) path.push(k);
        return path.reverse();
      }
      queue.push(j);
    }
  }
  return null;
}

// Eight-way routing for animals. A diagonal step needs both tiles it passes between to be open too, so
// nothing cuts a fence corner or squeezes between two blocked tiles. Costs: 10 straight, 14 diagonal.
const STEPS = [[-1, 0, 10], [1, 0, 10], [0, -1, 10], [0, 1, 10], [-1, -1, 14], [1, -1, 14], [-1, 1, 14], [1, 1, 14]];
function route8(g, start, goal, who, allow) {
  const n = g.w * g.h, cost = new Int32Array(n).fill(-1), from = new Int32Array(n).fill(-1);
  const ok = i => walkable(g, i, who) && (!allow || allow(i));
  const heap = [[0, start]];   // binary min-heap on cost
  const push = e => { heap.push(e); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k;
    if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  cost[start] = 0; from[start] = start;
  while (heap.length) {
    const [c, i] = pop();
    if (c > cost[i]) continue;
    if (goal.has(i)) {
      const path = [];
      for (let k = i; k !== start; k = from[k]) path.push(k);
      return path.reverse();
    }
    const x = i % g.w, y = (i / g.w) | 0;
    for (const [dx, dy, step] of STEPS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
      const j = ny * g.w + nx, nc = c + step;
      if (cost[j] !== -1 && cost[j] <= nc) continue;
      if (!ok(j)) continue;
      if (dx && dy && (!ok(y * g.w + nx) || !ok(ny * g.w + x))) continue;
      cost[j] = nc; from[j] = i; push([nc, j]);
    }
  }
  return null;
}
