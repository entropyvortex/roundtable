// ─────────────────────────────────────────────────────────────
// RoundTable — Per-engine round rules
// ─────────────────────────────────────────────────────────────
// One place for "how many rounds does this engine actually run", so
// the Setup stepper, the pre-run estimate, the request the page sends
// (including each leg of the engine sweep) and the run header's
// "round X of Y" never disagree.

import type { ConsensusOptions, EngineType } from "./types";

/** Round bounds (`setRoundCount` clamps to 1–10; the route caps at 10). */
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 10;

/** Red team needs opening positions, at least one attack round and a final synthesis. */
export const MIN_RED_TEAM_ROUNDS = 3;

/** Lowest round count an engine can run with. */
export function minRoundsFor(engine: EngineType): number {
  return engine === "adversarial" ? MIN_RED_TEAM_ROUNDS : MIN_ROUNDS;
}

/**
 * Rounds `engine` actually runs for a configured count: Blind jury is
 * always one round; Debate and Red team use the count, clamped to the
 * engine's minimum and `MAX_ROUNDS`. (Debate may still stop early.)
 */
export function effectiveRounds(engine: EngineType, rounds: number): number {
  if (engine === "blind-jury") return 1;
  const n = Number.isFinite(rounds) ? Math.round(rounds) : MIN_ROUNDS;
  return Math.min(MAX_ROUNDS, Math.max(minRoundsFor(engine), n));
}

/**
 * The options a run of `engine` is sent with: `engine` set and `rounds`
 * raised to the engine's minimum (Red team at 1–2 rounds runs 3). Blind
 * jury keeps the configured count — it ignores it anyway. Returns the
 * same object when nothing changes.
 */
export function optionsForEngine(options: ConsensusOptions, engine: EngineType): ConsensusOptions {
  const rounds = engine === "blind-jury" ? options.rounds : effectiveRounds(engine, options.rounds);
  if (options.engine === engine && options.rounds === rounds) return options;
  return { ...options, engine, rounds };
}
