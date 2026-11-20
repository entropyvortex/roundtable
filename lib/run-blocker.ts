// ─────────────────────────────────────────────────────────────
// RoundTable — Why a run cannot start yet
// ─────────────────────────────────────────────────────────────

import {
  MAX_ATTEMPT_CHARS,
  MAX_ATTEMPTS,
  MAX_ATTEMPTS_TOTAL_CHARS,
  MAX_PROMPT_LENGTH,
  MAX_SEATS,
  MIN_ATTEMPTS,
  MIN_SEATS,
} from "./limits";
import { sanitizeCustomPersonaSpec } from "./personas";
import type { AttemptDraft, ConsensusOptions, ModelInfo, Participant } from "./types";

/** A seat as the blocker needs it: the model, and the persona when it may be custom. */
export type ReadinessSeat = Pick<Participant, "modelInfo"> &
  Partial<Pick<Participant, "persona" | "customPersonaSpec">>;

export interface RunReadinessInput {
  prompt: string;
  participants: readonly ReadinessSeat[];
  availableModels: readonly Pick<ModelInfo, "id">[];
  modelsLoading: boolean;
  options: Pick<ConsensusOptions, "judgeEnabled" | "judgeModelId"> &
    Partial<Pick<ConsensusOptions, "engine">>;
  /** Compare attempts only: the pasted attempts. */
  attempts?: readonly Pick<AttemptDraft, "content">[];
}

/** Why the Compare attempts inputs can't run yet, or null. */
function attemptsBlocker(attempts: readonly Pick<AttemptDraft, "content">[]): string | null {
  if (attempts.length < MIN_ATTEMPTS) return `Add at least ${MIN_ATTEMPTS} attempts`;
  if (attempts.length > MAX_ATTEMPTS) return `Remove attempts: ${MAX_ATTEMPTS} is the maximum`;
  const empty = attempts.findIndex((a) => !a.content.trim());
  if (empty >= 0) return `Paste attempt ${empty + 1}`;
  const long = attempts.findIndex((a) => a.content.length > MAX_ATTEMPT_CHARS);
  if (long >= 0)
    return `Shorten attempt ${long + 1} to ${MAX_ATTEMPT_CHARS.toLocaleString("en-US")} characters`;
  const total = attempts.reduce((n, a) => n + a.content.length, 0);
  if (total > MAX_ATTEMPTS_TOTAL_CHARS)
    return `Shorten the attempts to ${MAX_ATTEMPTS_TOTAL_CHARS.toLocaleString("en-US")} characters in total`;
  return null;
}

/**
 * The reason a run can't start right now, in plain words, or `null` when
 * it can. Covers every check the server route makes, so the Run button is
 * never enabled for a request the server would reject.
 */
export function getRunBlocker(s: RunReadinessInput): string | null {
  if (s.modelsLoading) return "Fetching providers…";
  if (s.availableModels.length === 0) return "No models available. Set AI_PROVIDERS first.";
  const isCompare = s.options.engine === "compare-attempts";
  if (!s.prompt.trim()) return isCompare ? "Describe the task" : "Write a question";
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
  if (isCompare) return attemptsBlocker(s.attempts ?? []);
  return null;
}
