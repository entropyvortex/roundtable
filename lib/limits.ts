// ─────────────────────────────────────────────────────────────
// RoundTable — Input limits the Setup view enforces
// ─────────────────────────────────────────────────────────────
// The maxima mirror the guards in app/api/consensus/route.ts so the UI
// blocks a run the server would reject. MIN_SEATS is a UI rule: the
// route accepts one participant, but a consensus of one is not useful.

/** `MAX_PROMPT_LENGTH` in the consensus route. */
export const MAX_PROMPT_LENGTH = 10_000;

/** `MAX_PARTICIPANTS` in the consensus route. */
export const MAX_SEATS = 8;

/** A run needs at least this many seats. */
export const MIN_SEATS = 2;

/** The route clamps `costCapUSD` to this ceiling. */
export const MAX_COST_CAP_USD = 50;
