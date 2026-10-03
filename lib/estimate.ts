// ─────────────────────────────────────────────────────────────
// RoundTable — Pre-run size / cost / time estimate
// ─────────────────────────────────────────────────────────────
// Pure: no store, no network. Mirrors the call pattern of each engine
// in `lib/consensus-engine.ts` and prices it with `lib/pricing.ts`.
//
// ASSUMPTIONS (all deliberately simple; the UI labels the result "≈"):
//
// • Tokens: ~4 characters per token for the question text.
// • Every participant / judge / claims call writes ~1,200 output tokens
//   ("typical"). The engine caps output at 1,500 tokens per call
//   (MAX_OUTPUT_TOKENS), which we use as the pessimistic figure.
// • Each call's input = ~350 tokens of system prompt (persona + round
//   instructions + format rules) + the question + every prior response
//   the engine puts in context. A prior response costs its output size
//   plus ~20 tokens of "[Participant … | Confidence …]" framing. So later
//   rounds are more expensive than earlier ones.
// • Engines:
//   – Blind jury: 1 round, every participant answers once, in parallel,
//     with no shared context.
//   – Debate (CVP): participants × rounds. Round 1 is parallel with no
//     context when "blind round 1" is on; every other round is
//     sequential, so a speaker sees all earlier rounds plus, on average,
//     half of the current round ((N−1)/2 responses). Early stop can end
//     the run after round 2 at the earliest (only when rounds ≥ 3), so
//     minRounds = 2 with early stop, else the configured rounds.
//   – Red team: rounds × participants. Round 1 parallel, rounds 2…R−1
//     are one attacker (sees all prior rounds) then the defenders in
//     parallel (prior rounds + the attack), final round parallel. The
//     attacker rotates, so each participant is charged the average.
//   – Judge (if enabled with a model): +1 call reading the question and
//     every final-round response. Claim extraction (if enabled): +1 call
//     reading the final-round responses, on the judge model when the
//     judge is on, else on the first participant's model.
// • Cost range: low = minRounds at 1,200 output tokens per call;
//   high = maxRounds at the 1,500-token cap. Models with no entry in the
//   pricing table count as $0 and are listed in `unpricedModels`.
// • Time: ~25 s per call (≈1,200 tokens at ~60 tok/s plus first-token
//   latency). Parallel groups cost one call-time; sequential calls add
//   up. `estMinutes` is for maxRounds.

import { MAX_ROUNDS, MIN_ROUNDS } from "./engine-rules";
import { estimateCost, getModelPricing } from "./pricing";
import type { ConsensusOptions, ModelInfo } from "./types";

export const ESTIMATE_ASSUMPTIONS = {
  charsPerToken: 4,
  typicalOutputTokens: 1200,
  maxOutputTokens: 1500,
  systemPromptTokens: 350,
  contextFramingTokens: 20,
  secondsPerCall: 25,
} as const;

export interface RunEstimate {
  /** Calls at `maxRounds`, including judge + claim extraction. */
  calls: number;
  /** Calls at `minRounds` (differs from `calls` only when early stop can fire). */
  minCalls: number;
  minRounds: number;
  maxRounds: number;
  estCostUSD: { low: number; high: number };
  /** Wall-clock minutes at `maxRounds`, one decimal. */
  estMinutes: number;
  /** Model ids with no pricing entry — they are counted as $0. */
  unpricedModels: string[];
  /** True when a cost cap is set and the high estimate is above it. */
  exceedsCostCap: boolean;
}

export type EstimateParticipant = { modelInfo: Pick<ModelInfo, "modelId"> };
export type EstimateOptions = Pick<
  ConsensusOptions,
  "engine" | "rounds" | "blindFirstRound" | "earlyStop" | "judgeEnabled"
> &
  Partial<Pick<ConsensusOptions, "judgeModelId" | "extractClaimsEnabled" | "costCapUSD">>;

interface PlannedCall {
  /** Id passed to the pricing lookup (may be a composite `provider:model`). */
  modelId: string;
  /** Id shown to the user in `unpricedModels`. */
  displayId: string;
  input: number;
  output: number;
}

interface Plan {
  calls: PlannedCall[];
  /** Sequential call-times (a parallel group counts once). */
  steps: number;
}

function clampRounds(n: number): number {
  if (!Number.isFinite(n)) return MIN_ROUNDS;
  return Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS, Math.round(n)));
}

/** Strip the `provider:` prefix from a composite judge id (`ModelInfo.id`) for display. */
function bareModelId(id: string): string {
  const i = id.indexOf(":");
  return i >= 0 ? id.slice(i + 1) : id;
}

function roundBounds(options: EstimateOptions): { minRounds: number; maxRounds: number } {
  if (options.engine === "blind-jury") return { minRounds: 1, maxRounds: 1 };
  const rounds = clampRounds(options.rounds);
  if (options.engine === "cvp" && options.earlyStop && rounds >= 3) {
    return { minRounds: 2, maxRounds: rounds };
  }
  return { minRounds: rounds, maxRounds: rounds };
}

function planRun(
  participants: readonly EstimateParticipant[],
  options: EstimateOptions,
  rounds: number,
  outputTokens: number,
  promptTokens: number,
): Plan {
  const A = ESTIMATE_ASSUMPTIONS;
  const n = participants.length;
  const base = A.systemPromptTokens + promptTokens;
  const perResponse = outputTokens + A.contextFramingTokens;
  const calls: PlannedCall[] = [];
  let steps = 0;

  const everyone = (contextResponses: number) => {
    for (const p of participants) {
      calls.push({
        modelId: p.modelInfo.modelId,
        displayId: p.modelInfo.modelId,
        input: Math.round(base + contextResponses * perResponse),
        output: outputTokens,
      });
    }
  };

  if (options.engine === "blind-jury") {
    everyone(0);
    steps += 1;
  } else if (options.engine === "adversarial") {
    everyone(0); // round 1, parallel
    steps += 1;
    for (let r = 2; r < rounds; r++) {
      const prior = (r - 1) * n;
      // Attacker sees `prior`; each defender sees `prior + 1`. The attacker
      // rotates, so charge each participant the average.
      everyone(prior + (n - 1) / n);
      steps += n > 1 ? 2 : 1;
    }
    if (rounds >= 2) {
      everyone((rounds - 1) * n); // final synthesis, parallel
      steps += 1;
    }
  } else {
    for (let r = 1; r <= rounds; r++) {
      if (r === 1 && options.blindFirstRound) {
        everyone(0);
        steps += 1;
      } else {
        everyone((r - 1) * n + (n - 1) / 2);
        steps += n;
      }
    }
  }

  const judgeId = options.judgeEnabled && options.judgeModelId ? options.judgeModelId : null;
  if (judgeId) {
    calls.push({
      modelId: judgeId,
      displayId: bareModelId(judgeId),
      input: Math.round(base + n * perResponse),
      output: outputTokens,
    });
    steps += 1;
  }
  if (options.extractClaimsEnabled) {
    const first = participants[0].modelInfo.modelId;
    calls.push({
      modelId: judgeId ?? first,
      displayId: judgeId ? bareModelId(judgeId) : first,
      input: Math.round(A.systemPromptTokens + n * perResponse),
      output: outputTokens,
    });
    steps += 1;
  }

  return { calls, steps };
}

function planCost(plan: Plan): number {
  return plan.calls.reduce((sum, c) => sum + estimateCost(c.modelId, c.input, c.output), 0);
}

/**
 * Estimate how many calls a run will make, what it will cost and how long
 * it will take. See the assumptions at the top of this file.
 *
 * @param participants  the panel (only `modelInfo.modelId` is read)
 * @param options       the run options from the store
 * @param promptLength  length of the question in characters (default 0)
 */
export function estimateRun(
  participants: readonly EstimateParticipant[],
  options: EstimateOptions,
  promptLength = 0,
): RunEstimate {
  const { minRounds, maxRounds } = roundBounds(options);
  if (participants.length === 0) {
    return {
      calls: 0,
      minCalls: 0,
      minRounds,
      maxRounds,
      estCostUSD: { low: 0, high: 0 },
      estMinutes: 0,
      unpricedModels: [],
      exceedsCostCap: false,
    };
  }

  const A = ESTIMATE_ASSUMPTIONS;
  const promptTokens = Math.ceil(Math.max(0, promptLength) / A.charsPerToken);
  const low = planRun(participants, options, minRounds, A.typicalOutputTokens, promptTokens);
  const high = planRun(participants, options, maxRounds, A.maxOutputTokens, promptTokens);
  const typical = planRun(participants, options, maxRounds, A.typicalOutputTokens, promptTokens);

  const unpriced = new Set<string>();
  for (const c of high.calls) {
    const p = getModelPricing(c.modelId);
    if (p.input === 0 && p.output === 0) unpriced.add(c.displayId);
  }

  const lowCost = planCost(low);
  const highCost = planCost(high);
  const cap = options.costCapUSD ?? 0;

  return {
    calls: high.calls.length,
    minCalls: low.calls.length,
    minRounds,
    maxRounds,
    estCostUSD: { low: lowCost, high: highCost },
    estMinutes: Math.round(((typical.steps * A.secondsPerCall) / 60) * 10) / 10,
    unpricedModels: [...unpriced],
    exceedsCostCap: cap > 0 && highCost > cap,
  };
}

function formatCost(est: RunEstimate): string {
  const { low, high } = est.estCostUSD;
  const partial = est.unpricedModels.length > 0;
  if (high === 0 && partial) return "cost n/a";
  if (high < 0.01) return partial ? "<$0.01+" : "<$0.01";
  const lo = low.toFixed(2);
  const hi = high.toFixed(2);
  const range = lo === hi ? `~$${hi}` : `~$${lo}–${hi}`;
  return partial ? `${range}+` : range;
}

/**
 * One-line summary, e.g. `"≈ 12 calls · ~$0.40–0.90 · ~3 min"`.
 * - Calls show a range (`≈ 8–12 calls`) when early stop could end the run sooner.
 * - Cost: `<$0.01` for tiny runs; `cost n/a` when no model in the run is priced;
 *   a trailing `+` when some (but not all) models are unpriced, i.e. a lower bound.
 * - Time: `<1 min` below one minute, else rounded minutes.
 */
export function formatEstimate(est: RunEstimate): string {
  const callWord = (n: number) => (n === 1 ? "call" : "calls");
  const calls =
    est.minCalls === est.calls
      ? `≈ ${est.calls} ${callWord(est.calls)}`
      : `≈ ${est.minCalls}–${est.calls} ${callWord(est.calls)}`;
  const minutes = est.estMinutes < 1 ? "<1 min" : `~${Math.round(est.estMinutes)} min`;
  return `${calls} · ${formatCost(est)} · ${minutes}`;
}
