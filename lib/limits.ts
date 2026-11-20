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

/** Compare attempts: candidates per run (`/api/adjudicate`). */
export const MIN_ATTEMPTS = 2;
export const MAX_ATTEMPTS = 6;

/** Compare attempts: characters per candidate and across all candidates. */
export const MAX_ATTEMPT_CHARS = 60_000;
export const MAX_ATTEMPTS_TOTAL_CHARS = 200_000;

/** Compare attempts: checks per candidate, and their field sizes. */
export const MAX_CHECKS_PER_ATTEMPT = 8;
export const MAX_CHECK_NAME_CHARS = 80;
export const MAX_CHECK_OUTPUT_CHARS = 4_000;
export const MAX_ATTEMPT_LABEL_CHARS = 60;
