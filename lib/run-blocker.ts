// ─────────────────────────────────────────────────────────────
// RoundTable — Why a run cannot start yet
// ─────────────────────────────────────────────────────────────

import { MAX_PROMPT_LENGTH, MAX_SEATS, MIN_SEATS } from "./limits";
import { sanitizeCustomPersonaSpec } from "./personas";
import type { ConsensusOptions, ModelInfo, Participant } from "./types";

/** A seat as the blocker needs it: the model, and the persona when it may be custom. */
export type ReadinessSeat = Pick<Participant, "modelInfo"> &
  Partial<Pick<Participant, "persona" | "customPersonaSpec">>;

export interface RunReadinessInput {
  prompt: string;
  participants: readonly ReadinessSeat[];
  availableModels: readonly Pick<ModelInfo, "id">[];
  modelsLoading: boolean;
  options: Pick<ConsensusOptions, "judgeEnabled" | "judgeModelId">;
}

/**
 * The reason a run can't start right now, in plain words, or `null` when
 * it can. Covers every check the server route makes, so the Run button is
 * never enabled for a request the server would reject.
 */
export function getRunBlocker(s: RunReadinessInput): string | null {
  if (s.modelsLoading) return "Fetching providers…";
  if (s.availableModels.length === 0) return "No models available. Set AI_PROVIDERS first.";
  if (!s.prompt.trim()) return "Write a question";
  if (s.prompt.length > MAX_PROMPT_LENGTH)
    return `Shorten the question to ${MAX_PROMPT_LENGTH.toLocaleString("en-US")} characters`;
  if (s.participants.length < MIN_SEATS) return `Add at least ${MIN_SEATS} seats`;
  if (s.participants.length > MAX_SEATS) return `Remove seats: ${MAX_SEATS} is the maximum`;
  const known = new Set(s.availableModels.map((m) => m.id));
  if (s.participants.some((p) => !known.has(p.modelInfo.id)))
    return "Replace the models this server doesn't offer";
  if (
    s.participants.some(
      (p) => p.persona?.id === "custom" && !sanitizeCustomPersonaSpec(p.customPersonaSpec),
    )
  )
    return "Rebuild the custom persona";
  if (s.options.judgeEnabled) {
    if (!s.options.judgeModelId) return "Pick a judge model or turn the judge off";
    if (!known.has(s.options.judgeModelId)) return "Pick a judge model this server offers";
  }
  return null;
}
