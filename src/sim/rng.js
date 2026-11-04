// Seeded random numbers (mulberry32), so a run can be replayed and tests are stable. The seed lives in state.

export function rand(state) {
  let t = (state.seed = (state.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const range = (state, a, b) => a + rand(state) * (b - a);
export const pick = (state, list) => list[Math.floor(rand(state) * list.length)];
export const chance = (state, p) => rand(state) < p;
