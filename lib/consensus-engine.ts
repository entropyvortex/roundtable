// ─────────────────────────────────────────────────────────────
// RoundTable — Consensus Engine (Server-side)
// ─────────────────────────────────────────────────────────────
// Orchestrates multi-round, multi-AI consensus using SSE
// streaming. Dispatches between engines and wires in the
// optional Judge synthesizer and cost meter.
//
// Engines:
//   cvp         — Consensus Validation Protocol (multi-round debate)
//   blind-jury  — Parallel independent responses + judge synthesis
//
// All engines accept an optional AbortSignal and forward it to
// every provider call.

import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import type {
  Participant,
  RoundType,
  ConsensusEvent,
  RoundResponse,
  ConsensusOptions,
  Disagreement,
  JudgeResult,
  TokenUsage,
} from "./types";
import { findResolvedModel } from "./providers";
import { JUDGE_PERSONA } from "./personas";
import { addUsage, estimateCost, estimateUsageFromText, ZERO_USAGE } from "./pricing";

const MAX_OUTPUT_TOKENS = 1500;
const EARLY_STOP_DELTA_THRESHOLD = 3; // consensus score delta below this = converged

// ── Round definitions ──────────────────────────────────────

function getRoundMeta(
  roundNumber: number,
  totalRounds: number,
): { type: RoundType; label: string } {
  if (roundNumber === 1) return { type: "initial-analysis", label: "Initial Analysis" };
  if (roundNumber === 2) return { type: "counterarguments", label: "Counterarguments" };
  if (roundNumber === 3) return { type: "evidence-assessment", label: "Evidence Assessment" };
  return {
    type: "synthesis",
    label:
      roundNumber === totalRounds
        ? "Final Synthesis"
        : `Synthesis & Refinement (Round ${roundNumber})`,
  };
}

// ── Prompt building ────────────────────────────────────────

function buildRoundSystemPrompt(
  persona: string,
  roundType: RoundType,
  roundNumber: number,
  totalRounds: number,
  previousResponses: RoundResponse[],
): string {
  const roundInstructions: Record<RoundType, string> = {
    "initial-analysis": `This is Round ${roundNumber}/${totalRounds}: INITIAL ANALYSIS.
Provide your initial analysis of the prompt. Share your perspective, key observations, and preliminary assessment. State your confidence level (0-100) at the end.`,
    counterarguments: `This is Round ${roundNumber}/${totalRounds}: COUNTERARGUMENTS.
Review the initial analyses from all participants below. Identify weaknesses, biases, and blind spots. Offer substantive counterarguments. Challenge assumptions. State your updated confidence level (0-100) at the end.`,
    "evidence-assessment": `This is Round ${roundNumber}/${totalRounds}: EVIDENCE ASSESSMENT.
Evaluate the strength of evidence and reasoning presented so far. Distinguish well-supported claims from speculation. Identify areas where consensus is forming and where disagreement remains substantive. State your confidence level (0-100) at the end.`,
    synthesis: `This is Round ${roundNumber}/${totalRounds}: ${roundNumber === totalRounds ? "FINAL SYNTHESIS" : "SYNTHESIS & REFINEMENT"}.
Synthesize the discussion so far into a coherent assessment. Acknowledge remaining uncertainties. ${roundNumber === totalRounds ? "Provide your final, considered position." : "Refine your position based on the strongest arguments presented."} State your final confidence level (0-100) at the end.`,
  };

  const previousContext =
    previousResponses.length > 0
      ? `\n\n--- PREVIOUS ROUND RESPONSES ---\n${previousResponses
          .map(
            (r) => `[Participant ${r.participantId} | Confidence: ${r.confidence}%]\n${r.content}`,
          )
          .join("\n\n---\n\n")}\n--- END PREVIOUS RESPONSES ---`
      : "";

  return `${persona}

${roundInstructions[roundType]}${previousContext}

IMPORTANT: End your response with a line in exactly this format:
CONFIDENCE: [number 0-100]`;
}

function buildBlindJurorSystemPrompt(persona: string): string {
  return `${persona}

You are participating in a BLIND JURY. Every juror is answering the prompt independently and simultaneously. You have no visibility into other jurors' responses. Give your most complete, considered analysis now — there is no second round.

IMPORTANT: End your response with a line in exactly this format:
CONFIDENCE: [number 0-100]`;
}

function buildJudgeContext(finalResponses: RoundResponse[], participants: Participant[]): string {
  const blocks = finalResponses.map((r) => {
    const p = participants.find((x) => x.id === r.participantId);
    const label = p
      ? `${p.persona.name} (${p.modelInfo.providerName}/${p.modelInfo.modelId})`
      : r.participantId;
    const body = r.content.replace(/\nCONFIDENCE:\s*\d+\s*$/i, "").trim();
    return `### ${label} — self-reported confidence ${r.confidence}%\n${body}`;
  });
  return `Below are the final-round responses from every participant. Synthesize them per your instructions.\n\n${blocks.join("\n\n---\n\n")}`;
}

// ── Extraction helpers ─────────────────────────────────────

/** Extract confidence score from response text (0-100, defaults to 50) */
function extractConfidence(text: string): number {
  const match = text.match(/CONFIDENCE:\s*(\d+)/i);
  if (match) return Math.min(100, Math.max(0, parseInt(match[1], 10)));
  return 50;
}

function extractJudgeSection(text: string, heading: string): string {
  const pattern = new RegExp(`##\\s*${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
  const m = text.match(pattern);
  return m ? m[1].trim() : "";
}

// ── Scoring ────────────────────────────────────────────────

function calculateConsensusScore(responses: RoundResponse[]): number {
  const valid = responses.filter((r) => !r.error);
  if (valid.length === 0) return 0;
  const avg = valid.reduce((sum, r) => sum + r.confidence, 0) / valid.length;
  const variance =
    valid.reduce((sum, r) => sum + Math.pow(r.confidence - avg, 2), 0) / valid.length;
  const stdDev = Math.sqrt(variance);
  return Math.round(Math.max(0, Math.min(100, avg - stdDev * 0.5)));
}

// ── Randomization ──────────────────────────────────────────

/** Fisher–Yates shuffle. Non-mutating. */
export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Disagreement detection ─────────────────────────────────

/**
 * Detect disagreements in a round using a deterministic, text-free
 * heuristic: pairs of participants whose confidence scores diverge
 * by >= 20 points. This avoids fragile regex claim-extraction and
 * extra LLM calls, while still giving a meaningful signal.
 */
export function detectDisagreements(
  round: number,
  responses: RoundResponse[],
  participants: Participant[],
): Disagreement[] {
  const out: Disagreement[] = [];
  for (let i = 0; i < responses.length; i++) {
    for (let j = i + 1; j < responses.length; j++) {
      const a = responses[i];
      const b = responses[j];
      if (a.error || b.error) continue;
      const delta = Math.abs(a.confidence - b.confidence);
      if (delta < 20) continue;
      const pa = participants.find((p) => p.id === a.participantId);
      const pb = participants.find((p) => p.id === b.participantId);
      const label = pa && pb ? `${pa.persona.name} vs ${pb.persona.name}` : "Confidence split";
      out.push({
        id: `r${round}-${a.participantId}-${b.participantId}`,
        round,
        participantAId: a.participantId,
        participantBId: b.participantId,
        severity: delta,
        label,
      });
    }
  }
  return out;
}

// ── Streaming a single participant ─────────────────────────

/** Safely extract token usage from a streamText result */
async function extractUsage(
  result: { usage?: unknown } | undefined,
): Promise<{ inputTokens: number; outputTokens: number } | null> {
  if (!result || !result.usage) return null;
  try {
    const u = (await (result.usage as Promise<unknown>)) as Record<string, unknown> | undefined;
    if (!u || typeof u !== "object") return null;
    const input = (u.inputTokens ?? u.promptTokens ?? 0) as number;
    const output = (u.outputTokens ?? u.completionTokens ?? 0) as number;
    if (typeof input !== "number" || typeof output !== "number") return null;
    return { inputTokens: input, outputTokens: output };
  } catch {
    return null;
  }
}

/**
 * Format a provider error for display. Pulls out the common fields
 * that the Vercel AI SDK attaches to `AI_APICallError` (statusCode,
 * url, responseBody) and falls back to the message when they are
 * absent.
 */
function formatProviderError(err: unknown): string {
  if (!(err instanceof Error)) return typeof err === "string" ? err : "Unknown provider error";
  const msg = err.message || err.name || "Unknown provider error";
  const info = err as unknown as {
    statusCode?: number;
    responseBody?: unknown;
    url?: string;
  };
  const parts: string[] = [msg];
  if (typeof info.statusCode === "number") parts.push(`HTTP ${info.statusCode}`);
  return parts.join(" — ");
}

async function streamParticipant(
  participant: Participant,
  systemPrompt: string,
  userPrompt: string,
  round: number,
  emit: (event: ConsensusEvent) => void,
  signal?: AbortSignal,
): Promise<RoundResponse> {
  emit({ type: "participant-start", participantId: participant.id, round });

  const started = Date.now();
  let fullContent = "";
  let usage: TokenUsage | undefined;
  let errorMessage: string | undefined;

  const resolved = findResolvedModel(participant.modelInfo.id);

  if (!resolved) {
    errorMessage = `Model not available: ${participant.modelInfo.id}`;
    fullContent = `[Error from ${participant.modelInfo.providerName} / ${participant.modelInfo.modelId}: ${errorMessage}]`;
    emit({ type: "token", participantId: participant.id, round, token: fullContent });
    console.error(`[RoundTable] Model resolution failed for ${participant.modelInfo.id}`);
  } else {
    try {
      const provider = createOpenAI({
        baseURL: resolved.baseUrl,
        apiKey: resolved.apiKey,
      });

      // Vercel AI SDK v6 surfaces provider errors via the `onError`
      // callback rather than throwing from `textStream`. We capture
      // them here and re-throw after the iteration so the outer
      // try/catch handles them uniformly.
      let capturedError: unknown = null;

      // Use `.chat()` — the OpenAI chat-completions endpoint
      // (`/v1/chat/completions`) is the only one every provider's
      // OpenAI-compat shim implements (Anthropic, xAI, Mistral,
      // Groq, Together, …). The default `provider(modelId)` call
      // would target `/v1/responses`, which is OpenAI-only.
      const result = streamText({
        model: provider.chat(resolved.modelId),
        system: systemPrompt,
        prompt: userPrompt,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.7,
        abortSignal: signal,
        onError: ({ error }: { error: unknown }) => {
          capturedError = error;
        },
      } as Parameters<typeof streamText>[0]);

      const awaited = await result;
      for await (const chunk of awaited.textStream) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        fullContent += chunk;
        emit({ type: "token", participantId: participant.id, round, token: chunk });
      }

      if (capturedError) throw capturedError;

      const rawUsage = await extractUsage(awaited as { usage?: unknown });
      if (rawUsage) {
        usage = {
          inputTokens: rawUsage.inputTokens,
          outputTokens: rawUsage.outputTokens,
          totalTokens: rawUsage.inputTokens + rawUsage.outputTokens,
          estimatedCostUSD: estimateCost(
            resolved.modelId,
            rawUsage.inputTokens,
            rawUsage.outputTokens,
          ),
        };
      } else {
        usage = estimateUsageFromText(resolved.modelId, systemPrompt + userPrompt, fullContent);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;

      errorMessage = formatProviderError(err);

      console.error(
        `[RoundTable] Provider error from ${participant.modelInfo.providerName}/${participant.modelInfo.modelId}:`,
        err,
      );

      // If nothing was streamed, emit a synthetic token so the UI
      // never renders an empty card. If something WAS streamed,
      // append the error to what was already shown.
      if (fullContent.length === 0) {
        fullContent = `[Error from ${participant.modelInfo.providerName} / ${participant.modelInfo.modelId}: ${errorMessage}]`;
        emit({ type: "token", participantId: participant.id, round, token: fullContent });
      } else {
        const tail = `\n\n[Error from ${participant.modelInfo.providerName} / ${participant.modelInfo.modelId}: ${errorMessage}]`;
        fullContent += tail;
        emit({ type: "token", participantId: participant.id, round, token: tail });
      }
    }
  }

  // Errored responses have no meaningful self-reported confidence.
  // Using 0 keeps them out of the consensus score (which filters
  // `r.error`) and makes the UI render an explicit error badge.
  const confidence = errorMessage ? 0 : extractConfidence(fullContent);
  const durationMs = Date.now() - started;

  const response: RoundResponse = {
    participantId: participant.id,
    roundNumber: round,
    content: fullContent,
    confidence,
    timestamp: Date.now(),
    durationMs,
    usage,
    error: errorMessage,
  };

  emit({
    type: "participant-end",
    participantId: participant.id,
    round,
    confidence,
    fullContent,
    usage,
    durationMs,
    error: errorMessage,
  });

  return response;
}

// ── Judge synthesizer ──────────────────────────────────────

async function runJudge(
  judgeModelId: string,
  finalResponses: RoundResponse[],
  participants: Participant[],
  userPrompt: string,
  emit: (event: ConsensusEvent) => void,
  signal?: AbortSignal,
): Promise<JudgeResult> {
  const resolved = findResolvedModel(judgeModelId);
  if (!resolved) {
    throw new Error(`Judge model not found: ${judgeModelId}`);
  }

  const provider = createOpenAI({
    baseURL: resolved.baseUrl,
    apiKey: resolved.apiKey,
  });

  emit({ type: "judge-start", modelId: resolved.modelId, providerName: resolved.providerName });

  const context = buildJudgeContext(finalResponses, participants);
  const system = `${JUDGE_PERSONA.systemPrompt}

The original prompt that was debated was:
"""
${userPrompt}
"""`;

  let content = "";
  let usage: TokenUsage | undefined;

  try {
    let capturedError: unknown = null;

    // See streamParticipant for why we use `.chat()` here.
    const result = streamText({
      model: provider.chat(resolved.modelId),
      system,
      prompt: context,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.3,
      abortSignal: signal,
      onError: ({ error }: { error: unknown }) => {
        capturedError = error;
      },
    } as Parameters<typeof streamText>[0]);

    const awaited = await result;
    for await (const chunk of awaited.textStream) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      content += chunk;
      emit({ type: "judge-token", token: chunk });
    }

    if (capturedError) throw capturedError;

    const rawUsage = await extractUsage(awaited as { usage?: unknown });
    if (rawUsage) {
      usage = {
        inputTokens: rawUsage.inputTokens,
        outputTokens: rawUsage.outputTokens,
        totalTokens: rawUsage.inputTokens + rawUsage.outputTokens,
        estimatedCostUSD: estimateCost(
          resolved.modelId,
          rawUsage.inputTokens,
          rawUsage.outputTokens,
        ),
      };
    } else {
      usage = estimateUsageFromText(resolved.modelId, system + context, content);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    const msg = formatProviderError(err);
    console.error(
      `[RoundTable] Judge error from ${resolved.providerName}/${resolved.modelId}:`,
      err,
    );
    const tail = content.length === 0 ? `[Judge error: ${msg}]` : `\n\n[Judge error: ${msg}]`;
    content += tail;
    emit({ type: "judge-token", token: tail });
  }

  const result: JudgeResult = {
    modelId: resolved.modelId,
    providerName: resolved.providerName,
    content,
    majorityPosition: extractJudgeSection(content, "Majority Position"),
    minorityPositions: extractJudgeSection(content, "Minority Positions"),
    unresolvedDisputes: extractJudgeSection(content, "Unresolved Disputes"),
    usage,
  };
  emit({ type: "judge-end", result });
  return result;
}

// ── CVP Engine ─────────────────────────────────────────────

async function runCVPConsensus(
  prompt: string,
  participants: Participant[],
  options: ConsensusOptions,
  emit: (event: ConsensusEvent) => void,
  signal?: AbortSignal,
): Promise<number> {
  const totalRounds = options.rounds;
  const allResponses: RoundResponse[] = [];
  const roundScores: number[] = [];
  let roundsCompleted = 0;

  for (let round = 1; round <= totalRounds; round++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const { type, label } = getRoundMeta(round, totalRounds);
    emit({ type: "round-start", round, roundType: type, label });

    const previousResponses = allResponses.filter((r) => r.roundNumber < round);

    // Determine speaking order for this round
    const order =
      options.randomizeOrder && round > 1 ? shuffle(participants) : participants.slice();

    const roundResponses: RoundResponse[] = [];

    if (round === 1 && options.blindFirstRound) {
      // Parallel, no cross-visibility — each participant only sees an empty previous-context.
      const promises = order.map((participant) => {
        const systemPrompt = buildRoundSystemPrompt(
          participant.persona.systemPrompt,
          type,
          round,
          totalRounds,
          [],
        );
        return streamParticipant(participant, systemPrompt, prompt, round, emit, signal);
      });
      const results = await Promise.all(promises);
      roundResponses.push(...results);
    } else {
      // Sequential — later participants see earlier ones from this round
      for (const participant of order) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

        const visibleContext = [
          ...previousResponses,
          ...roundResponses, // what earlier participants said in THIS round
        ];

        const systemPrompt = buildRoundSystemPrompt(
          participant.persona.systemPrompt,
          type,
          round,
          totalRounds,
          visibleContext,
        );

        const response = await streamParticipant(
          participant,
          systemPrompt,
          prompt,
          round,
          emit,
          signal,
        );
        roundResponses.push(response);
      }
    }

    allResponses.push(...roundResponses);
    const consensusScore = calculateConsensusScore(roundResponses);
    roundScores.push(consensusScore);
    emit({ type: "round-end", round, consensusScore });

    const disagreements = detectDisagreements(round, roundResponses, participants);
    if (disagreements.length > 0) {
      emit({ type: "disagreements", round, disagreements });
    }

    roundsCompleted = round;

    // Convergence check — requires at least round 2 before we can look at a delta
    if (options.earlyStop && round >= 2 && round < totalRounds) {
      const delta = Math.abs(consensusScore - roundScores[round - 2]);
      if (delta <= EARLY_STOP_DELTA_THRESHOLD) {
        const reason = `Consensus score delta ${delta.toFixed(1)} between rounds ${round - 1} and ${round} is at or below the convergence threshold (${EARLY_STOP_DELTA_THRESHOLD}).`;
        emit({ type: "early-stop", round, delta, reason });
        break;
      }
    }
  }

  const lastRoundNumber = roundsCompleted;
  const lastRoundResponses = allResponses.filter((r) => r.roundNumber === lastRoundNumber);
  const finalScore = calculateConsensusScore(lastRoundResponses);

  if (options.judgeEnabled && options.judgeModelId) {
    await runJudge(options.judgeModelId, lastRoundResponses, participants, prompt, emit, signal);
  }

  emit({
    type: "consensus-complete",
    finalScore,
    summary: `CVP completed ${roundsCompleted} round${roundsCompleted !== 1 ? "s" : ""} with ${participants.length} participants. Final consensus score: ${finalScore}%.`,
    roundsCompleted,
  });

  return finalScore;
}

// ── Blind Jury Engine ──────────────────────────────────────

async function runBlindJuryConsensus(
  prompt: string,
  participants: Participant[],
  options: ConsensusOptions,
  emit: (event: ConsensusEvent) => void,
  signal?: AbortSignal,
): Promise<number> {
  // One and only round — parallel, no cross-visibility.
  emit({
    type: "round-start",
    round: 1,
    roundType: "initial-analysis",
    label: "Blind Jury Deliberation",
  });

  const results = await Promise.all(
    participants.map((p) =>
      streamParticipant(
        p,
        buildBlindJurorSystemPrompt(p.persona.systemPrompt),
        prompt,
        1,
        emit,
        signal,
      ),
    ),
  );

  const consensusScore = calculateConsensusScore(results);
  emit({ type: "round-end", round: 1, consensusScore });

  const disagreements = detectDisagreements(1, results, participants);
  if (disagreements.length > 0) {
    emit({ type: "disagreements", round: 1, disagreements });
  }

  // Blind Jury always runs the judge if a model is available.
  if (options.judgeEnabled && options.judgeModelId) {
    await runJudge(options.judgeModelId, results, participants, prompt, emit, signal);
  }

  emit({
    type: "consensus-complete",
    finalScore: consensusScore,
    summary: `Blind Jury reached a consensus score of ${consensusScore}% across ${participants.length} independent jurors.`,
    roundsCompleted: 1,
  });

  return consensusScore;
}

// ── Public entrypoint ──────────────────────────────────────

export async function runConsensus(
  prompt: string,
  participants: Participant[],
  options: ConsensusOptions,
  emit: (event: ConsensusEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (options.engine === "blind-jury") {
    await runBlindJuryConsensus(prompt, participants, options, emit, signal);
  } else {
    await runCVPConsensus(prompt, participants, options, emit, signal);
  }
}

// ── Exports for tests ──────────────────────────────────────

export const __testing = {
  calculateConsensusScore,
  detectDisagreements,
  extractConfidence,
  extractJudgeSection,
  getRoundMeta,
  shuffle,
  buildRoundSystemPrompt,
  buildBlindJurorSystemPrompt,
  buildJudgeContext,
  ZERO_USAGE,
  addUsage,
};
