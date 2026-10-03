// ─────────────────────────────────────────────────────────────
// RoundTable — The engine sweep ("Run all three engines")
// ─────────────────────────────────────────────────────────────

import { optionsForEngine } from "./engine-rules";
import { estimateRun, type EstimateParticipant, type RunEstimate } from "./estimate";
import type { ConsensusOptions, EngineType } from "./types";

/** The engines a sweep runs, in order. */
export const SWEEP_ENGINES: readonly EngineType[] = ["cvp", "blind-jury", "adversarial"];

/** Sum several estimates (the sweep runs its engines back to back). */
export function combineEstimates(list: readonly RunEstimate[]): RunEstimate {
  const unpriced = new Set<string>();
  const total: RunEstimate = {
    calls: 0,
    minCalls: 0,
    minRounds: 0,
    maxRounds: 0,
    estCostUSD: { low: 0, high: 0 },
    estMinutes: 0,
    unpricedModels: [],
    exceedsCostCap: false,
  };
  for (const e of list) {
    total.calls += e.calls;
    total.minCalls += e.minCalls;
    total.minRounds += e.minRounds;
    total.maxRounds += e.maxRounds;
    total.estCostUSD.low += e.estCostUSD.low;
    total.estCostUSD.high += e.estCostUSD.high;
    total.estMinutes += e.estMinutes;
    total.exceedsCostCap ||= e.exceedsCostCap;
    e.unpricedModels.forEach((m) => unpriced.add(m));
  }
  total.unpricedModels = [...unpriced];
  return total;
}

/**
 * Estimate for the whole sweep: each engine with the options the sweep
 * actually sends it (`optionsForEngine`, so Red team runs ≥ 3 rounds).
 */
export function estimateSweep(
  participants: readonly EstimateParticipant[],
  options: ConsensusOptions,
  promptLength = 0,
): RunEstimate {
  return combineEstimates(
    SWEEP_ENGINES.map((engine) =>
      estimateRun(participants, optionsForEngine(options, engine), promptLength),
    ),
  );
}
