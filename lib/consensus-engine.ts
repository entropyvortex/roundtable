// ─────────────────────────────────────────────────────────────
// RoundTable — Consensus Engine (Server-side)
// ─────────────────────────────────────────────────────────────
// Orchestrates multi-round, multi-AI consensus using SSE streaming.
// Accepts an optional AbortSignal to stop processing when the
// client disconnects.

import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { Participant, RoundType, ConsensusEvent, RoundResponse } from "./types";
import { findResolvedModel } from "./providers";

/** Round definitions per the CVP spec */
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

/** Build the system prompt for a specific round */
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

/** Extract confidence score from response text */
function extractConfidence(text: string): number {
  const match = text.match(/CONFIDENCE:\s*(\d+)/i);
  if (match) return Math.min(100, Math.max(0, parseInt(match[1], 10)));
  return 50;
}

/** Calculate consensus score from participant confidences */
function calculateConsensusScore(responses: RoundResponse[]): number {
  if (responses.length === 0) return 0;
  const avg = responses.reduce((sum, r) => sum + r.confidence, 0) / responses.length;
  const variance =
    responses.reduce((sum, r) => sum + Math.pow(r.confidence - avg, 2), 0) / responses.length;
  const stdDev = Math.sqrt(variance);
  return Math.round(Math.max(0, Math.min(100, avg - stdDev * 0.5)));
}

/** Stream a single AI participant's response */
async function streamParticipant(
  participant: Participant,
  systemPrompt: string,
  userPrompt: string,
  emit: (event: ConsensusEvent) => void,
  signal?: AbortSignal,
): Promise<RoundResponse> {
  const resolved = findResolvedModel(participant.modelInfo.id);
  if (!resolved) {
    throw new Error(`Model not found: ${participant.modelInfo.id}`);
  }

  const provider = createOpenAI({
    baseURL: resolved.baseUrl,
    apiKey: resolved.apiKey,
    compatibility: "compatible",
  });

  emit({ type: "participant-start", participantId: participant.id, round: 0 });

  let fullContent = "";

  try {
    const result = streamText({
      model: provider(resolved.modelId),
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 1500,
      temperature: 0.7,
      abortSignal: signal,
    });

    for await (const chunk of (await result).textStream) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      fullContent += chunk;
      emit({ type: "token", participantId: participant.id, round: 0, token: chunk });
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    fullContent = `[Error from ${participant.modelInfo.providerName}/${participant.modelInfo.modelId}: ${errorMsg}]`;
    emit({ type: "token", participantId: participant.id, round: 0, token: fullContent });
  }

  const confidence = extractConfidence(fullContent);

  return {
    participantId: participant.id,
    roundNumber: 0,
    content: fullContent,
    confidence,
    timestamp: Date.now(),
  };
}

/** Run the full consensus process, emitting SSE events */
export async function runConsensus(
  prompt: string,
  participants: Participant[],
  totalRounds: number,
  emit: (event: ConsensusEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const allResponses: RoundResponse[] = [];

  for (let round = 1; round <= totalRounds; round++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const { type, label } = getRoundMeta(round, totalRounds);
    emit({ type: "round-start", round, roundType: type, label });

    const previousResponses = allResponses.filter((r) => r.roundNumber < round);

    const roundResponses: RoundResponse[] = [];

    for (const participant of participants) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      const systemPrompt = buildRoundSystemPrompt(
        participant.persona.systemPrompt,
        type,
        round,
        totalRounds,
        previousResponses,
      );

      const response = await streamParticipant(
        participant,
        systemPrompt,
        prompt,
        (event) => {
          if ("round" in event) {
            emit({ ...event, round } as ConsensusEvent);
          } else {
            emit(event);
          }
        },
        signal,
      );

      response.roundNumber = round;
      roundResponses.push(response);

      emit({
        type: "participant-end",
        participantId: participant.id,
        round,
        confidence: response.confidence,
        fullContent: response.content,
      });
    }

    allResponses.push(...roundResponses);
    const consensusScore = calculateConsensusScore(roundResponses);
    emit({ type: "round-end", round, consensusScore });
  }

  const lastRoundResponses = allResponses.filter((r) => r.roundNumber === totalRounds);
  const finalScore = calculateConsensusScore(lastRoundResponses);

  emit({
    type: "consensus-complete",
    finalScore,
    summary: `Consensus reached after ${totalRounds} rounds with ${participants.length} participants. Final consensus score: ${finalScore}%.`,
  });
}
