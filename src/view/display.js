// The display size curve: sprite size grows slower than real size, so small animals read and big ones fit,
// but the order never flips. Only drawing uses it; the sim keeps real sizes.
export const TILE = 16;
const PERSON_M = 1.75, PERSON_PX = 28, POWER = 0.6, FLOOR_PX = 7;

// Length in pixels for a real length in meters.
export const displayPx = m => Math.max(FLOOR_PX, Math.round(PERSON_PX * Math.pow(m / PERSON_M, POWER)));
export const personPx = () => PERSON_PX;
