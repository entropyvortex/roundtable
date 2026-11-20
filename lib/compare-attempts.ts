// ─────────────────────────────────────────────────────────────
// RoundTable — Compare attempts engine (server-side)
// ─────────────────────────────────────────────────────────────
// Judges 2–6 pasted candidate solutions to one task with
// ai-consensus-core's AdjudicationEngine: blind jurors under neutral,
// per-juror shuffled labels, Borda + Kendall's W, quote-verified
// findings, a rebuttal round when the jurors split, then the judge.
//
// The user's attempt labels never reach a model: attempts are sent to
// the engine as `attempt-1…attempt-N` and labelled again in the UI.

import {
  AdjudicationEngine,
  type AdjudicationCandidate,
  type Participant as CoreParticipant,
  type TokenUsage as CoreUsage,
} from "ai-consensus-core";
import type { AttemptCheck, CompareEvent, JudgeResult, Participant, TokenUsage } from "./types";
import { createVercelCaller } from "./core-caller";
import { JUDGE_PERSONA } from "./personas";
import { addUsage, estimateCost, ZERO_USAGE } from "./pricing";
import { findResolvedModel } from "./providers";
import {
  MAX_ATTEMPT_CHARS,
  MAX_ATTEMPT_LABEL_CHARS,
  MAX_ATTEMPTS,
  MAX_ATTEMPTS_TOTAL_CHARS,
  MAX_CHECK_NAME_CHARS,
  MAX_CHECK_OUTPUT_CHARS,
  MAX_CHECKS_PER_ATTEMPT,
  MIN_ATTEMPTS,
} from "./limits";

/** Stop a little before the route's 300 s `maxDuration` and return what finished. */
export const COMPARE_DEADLINE_MS = 280_000;

export interface CompareAttemptInput {
  label: string;
  content: string;
  checks: AttemptCheck[];
}

export interface CompareRunInput {
  task: string;
  attempts: CompareAttemptInput[];
  participants: Participant[];
  judgeModelId?: string;
  costCapUSD?: number;
  randomSeed?: number;
}

function displayModelId(p: Participant): string {
  return `${p.modelInfo.providerName}/${p.modelInfo.modelId}`;
}

/**
 * Run one comparison, streaming `CompareEvent`s through `emit`. Resolves
 * after `compare-complete`; throws an AbortError when `signal` aborts
 * (the route then closes the stream silently).
 */
export async function runCompareAttempts(
  input: CompareRunInput,
  emit: (event: CompareEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const byId = new Map(input.participants.map((p) => [p.id, p]));
  const route = (participantId: string) =>
    participantId === "judge" ? input.judgeModelId : byId.get(participantId)?.modelInfo.id;

  // Prices are keyed by the provider's model id; the engine sees display ids.
  const pricingId = new Map<string, string>();
  const jurors: CoreParticipant[] = input.participants.map((p) => {
    const display = displayModelId(p);
    pricingId.set(display, findResolvedModel(p.modelInfo.id)?.modelId ?? p.modelInfo.modelId);
    return { id: p.id, modelId: display, persona: p.persona };
  });
  const judgeResolved = input.judgeModelId ? findResolvedModel(input.judgeModelId) : undefined;
  if (input.judgeModelId && judgeResolved) pricingId.set(input.judgeModelId, judgeResolved.modelId);
  const usd = (modelId: string, usage: CoreUsage) =>
    estimateCost(pricingId.get(modelId) ?? modelId, usage.inputTokens, usage.outputTokens);
  const withCost = (modelId: string, usage: CoreUsage | undefined): TokenUsage | undefined =>
    usage ? { ...usage, estimatedCostUSD: usd(modelId, usage) } : undefined;

  const candidates: AdjudicationCandidate[] = input.attempts.map((a, i) => ({
    id: `attempt-${i + 1}`,
    content: a.content,
    checks: a.checks,
  }));
  emit({
    type: "compare-start",
    attempts: input.attempts.map((a, i) => ({ id: `attempt-${i + 1}`, label: a.label })),
    jurorIds: jurors.map((j) => j.id),
  });

  let tokenTotal: TokenUsage = { ...ZERO_USAGE };
  const engine = new AdjudicationEngine(createVercelCaller(route));
  engine.on("roundStart", (e) =>
    emit({ type: "compare-round-start", round: e.round, kind: e.kind }),
  );
  engine.on("jurorStart", (e) => emit({ type: "juror-start", jurorId: e.jurorId, round: e.round }));
  engine.on("jurorComplete", ({ verdict: v }) => {
    const usage = withCost(v.modelId, v.usage);
    if (usage) tokenTotal = addUsage(tokenTotal, usage);
    emit({
      type: "juror-end",
      jurorId: v.jurorId,
      round: v.round,
      status: v.status,
      ranking: v.ranking,
      verified: v.verifiedFindings.length,
      dropped: v.droppedFindings.length,
      ...(v.abstainReason ? { reason: v.abstainReason } : {}),
      durationMs: v.durationMs,
      ...(usage ? { usage } : {}),
    });
  });
  engine.on("roundComplete", (e) =>
    emit({
      type: "compare-round-end",
      round: e.round,
      kendallW: e.agreement.kendallW,
      votes: e.agreement.votes,
    }),
  );
  engine.on("synthesisStart", () =>
    emit({
      type: "judge-start",
      modelId: judgeResolved?.modelId ?? "",
      providerName: judgeResolved?.providerName ?? "",
    }),
  );
  engine.on("synthesisToken", (e) => emit({ type: "judge-token", token: e.token }));
  engine.on("synthesisComplete", ({ synthesis: s }) => {
    const usage = withCost(s.modelId, s.usage);
    if (usage) tokenTotal = addUsage(tokenTotal, usage);
    const result: JudgeResult = {
      modelId: judgeResolved?.modelId ?? s.modelId,
      providerName: judgeResolved?.providerName ?? "",
      content: s.content,
      majorityPosition: s.majorityPosition,
      minorityPositions: s.minorityPositions,
      unresolvedDisputes: s.unresolvedDisputes,
      usage,
    };
    emit({ type: "judge-end", result });
  });

  const result = await engine.adjudicate({
    task: input.task,
    candidates,
    jurors,
    ...(input.judgeModelId
      ? { judge: { modelId: input.judgeModelId, systemPrompt: JUDGE_PERSONA.systemPrompt } }
      : {}),
    ...(input.randomSeed !== undefined ? { randomSeed: input.randomSeed } : {}),
    ...(signal ? { signal } : {}),
    budget: {
      deadlineMs: COMPARE_DEADLINE_MS,
      ...(input.costCapUSD && input.costCapUSD > 0
        ? { costCap: { limitUSD: input.costCapUSD, estimateUSD: usd } }
        : {}),
    },
  });
  if (result.stopReason === "aborted") throw new DOMException("Aborted", "AbortError");
  emit({ type: "compare-complete", result, tokenTotal });
}

// ── Request validation ─────────────────────────────────────

const CHECK_STATUSES = new Set(["passed", "failed", "unknown"]);

/** Validate attempts; returns the cleaned list or an error message. */
export function parseAttempts(raw: unknown): CompareAttemptInput[] | string {
  if (!Array.isArray(raw)) return "attempts must be an array";
  if (raw.length < MIN_ATTEMPTS || raw.length > MAX_ATTEMPTS) {
    return `Provide between ${MIN_ATTEMPTS} and ${MAX_ATTEMPTS} attempts`;
  }
  let total = 0;
  const out: CompareAttemptInput[] = [];
  for (const [i, item] of raw.entries()) {
    const a = (item ?? {}) as { label?: unknown; content?: unknown; checks?: unknown };
    if (typeof a.content !== "string" || a.content.trim() === "") {
      return `Attempt ${i + 1} is empty`;
    }
    if (a.content.length > MAX_ATTEMPT_CHARS) {
      return `Attempt ${i + 1} is longer than ${MAX_ATTEMPT_CHARS} characters`;
    }
    total += a.content.length;
    const label =
      typeof a.label === "string" && a.label.trim() !== ""
        ? a.label.trim().slice(0, MAX_ATTEMPT_LABEL_CHARS)
        : `Attempt ${i + 1}`;
    const checksRaw = a.checks === undefined ? [] : a.checks;
    if (!Array.isArray(checksRaw) || checksRaw.length > MAX_CHECKS_PER_ATTEMPT) {
      return `Attempt ${i + 1}: at most ${MAX_CHECKS_PER_ATTEMPT} checks`;
    }
    const checks: AttemptCheck[] = [];
    for (const c of checksRaw as Array<{ name?: unknown; status?: unknown; output?: unknown }>) {
      const name = typeof c?.name === "string" ? c.name.trim() : "";
      if (!name || name.length > MAX_CHECK_NAME_CHARS) {
        return `Attempt ${i + 1}: each check needs a name of at most ${MAX_CHECK_NAME_CHARS} characters`;
      }
      if (typeof c.status !== "string" || !CHECK_STATUSES.has(c.status)) {
        return `Attempt ${i + 1}: check "${name}" status must be passed, failed or unknown`;
      }
      if (c.output !== undefined && typeof c.output !== "string") {
        return `Attempt ${i + 1}: check "${name}" output must be text`;
      }
      const output = typeof c.output === "string" ? c.output.slice(0, MAX_CHECK_OUTPUT_CHARS) : "";
      checks.push({
        name,
        status: c.status as AttemptCheck["status"],
        ...(output.trim() ? { output } : {}),
      });
    }
    out.push({ label, content: a.content, checks });
  }
  if (total > MAX_ATTEMPTS_TOTAL_CHARS) {
    return `Attempts total more than ${MAX_ATTEMPTS_TOTAL_CHARS} characters`;
  }
  return out;
}
