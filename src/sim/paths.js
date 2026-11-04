// Routing. Breadth-first search over the tiles a mover may stand on, to the nearest of a set of goal tiles.
// Maps are small (a few thousand tiles), so plain BFS is fast enough and finds the nearest goal for free.
import { walkable, neighbours } from "./grid.js";

// Returns the tile list from start (exclusive) to the nearest goal (inclusive), [] if already there, or null.
// Goals must be tiles the mover can stand on (the tile beside a feeder, not the feeder).
// allow(i) can narrow the walkable tiles further (an animal stays in its exhibit, a keeper keeps out of a dangerous pen).
export function route(g, start, goals, who, allow) {
  const goal = goals instanceof Set ? goals : new Set(goals);
  if (!goal.size) return null;
  if (goal.has(start)) return [];
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
