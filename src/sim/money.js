// Money checks shared by the sim and the view. In sandbox mode (state.sandbox) everything is affordable and nothing
// is taken out of the bank; the books still record what it would have cost.
export const afford = (state, n) => !!state.sandbox || state.money >= n;
export function charge(state, n) { if (!state.sandbox) state.money -= n; }
