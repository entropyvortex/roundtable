// ─────────────────────────────────────────────────────────────
// RoundTable — Consensus Engine (Server-side)
// ─────────────────────────────────────────────────────────────
// Orchestrates multi-round, multi-AI consensus using SSE
// streaming. Dispatches between engines and wires in the
// optional Judge synthesizer and cost meter.
//
// Engines:
//   cvp          — Consensus Validation Protocol (multi-round debate)
//   blind-jury   — Parallel independent responses + judge synthesis
//   adversarial  — Adversarial Red Team: rotating attacker stress-tests
//                  the others; defenders respond; final post-stress
//                  synthesis
//
// Protocol primitives come from ai-consensus-core: the round prompts,
// confidence parsing (last CONFIDENCE marker), consensus score,
// disagreement detection, judge
// prompts and section parsing, the claim extractor and the cost-cap
// error. Every model call goes through the core `ModelCaller` adapter
// in ./core-caller (Vercel AI SDK). The three orchestration loops below
// stay here: Blind jury and Red team have no core equivalent, and CVP
// keeps Roundtable's 1-seat runs, which `ConsensusEngine.run()` rejects
// (see the PR notes).
//
// All engines accept an optional AbortSignal and forward it to
// every provider call.

import {
  assertWithinCostCap,
  buildJudgeSystemPrompt,
  buildJudgeUserPrompt,
  buildParticipantSystemPrompt,
  consensusScore,
  CostCapExceededError,
  detectDisagreements as coreDetectDisagreements,
  extractClaims,
  extractConfidence,
  extractJudgeSection,
  getRoundMeta as coreGetRoundMeta,
  parseClaimsJSON,
  shuffle,
  type Participant as CoreParticipant,
  type ParticipantResponse as CoreResponse,
  type TokenUsage as CoreUsage,
} from "ai-consensus-core";
import type {
  Participant,
  RoundType,
  ConsensusEvent,
  RoundResponse,
  ConsensusOptions,
  Disagreement,
  JudgeResult,
  ClaimDigest,
  TokenUsage,
} from "./types";
import { createVercelCaller } from "./core-caller";
import { findResolvedModel } from "./providers";
import { JUDGE_PERSONA } from "./personas";
import { addUsage, estimateCost, ZERO_USAGE } from "./pricing";

export { CostCapExceededError, parseClaimsJSON, shuffle };

const MAX_OUTPUT_TOKENS = 1500;
const EARLY_STOP_DELTA_THRESHOLD = 3; // consensus score delta below this = converged

/** Throw `CostCapExceededError` when the running cost crosses the cap. */
const enforceCostCap = assertWithinCostCap;

// ── Core shape adapters ────────────────────────────────────

/**
 * Core participant for prompts. `modelId` is the display label
 * `provider/model`, so core's judge and claim prompts read exactly as
 * Roundtable's did (`Persona (Provider/model)`).
 */
function toCoreParticipant(p: Participant): CoreParticipant {
  return {
    id: p.id,
    modelId: `${p.modelInfo.providerName}/${p.modelInfo.modelId}`,
    persona: p.persona,
  };
}

/** Core response shape for prompts and stats (only the read fields matter). */
function toCoreResponse(r: RoundResponse): CoreResponse {
  return {
    participantId: r.participantId,
    modelId: "",
    personaId: "",
    round: r.roundNumber,
    phase: "initial-analysis",
    content: r.content,
    confidence: r.confidence,
    ...(r.error ? { error: r.error } : {}),
    startedAt: 0,
    completedAt: 0,
    durationMs: 0,
  };
}

/** Roundtable usage (with USD estimate) from core usage. */
function withCost(resolvedModelId: string, usage: CoreUsage | undefined): TokenUsage | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    estimatedCostUSD: estimateCost(resolvedModelId, usage.inputTokens, usage.outputTokens),
  };
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

// ── Round definitions and prompts (core) ───────────────────

function getRoundMeta(
  roundNumber: number,
  totalRounds: number,
): { type: RoundType; label: string } {
  const { phase, label } = coreGetRoundMeta(roundNumber, totalRounds);
  return { type: phase, label };
}

function buildRoundSystemPrompt(
  persona: string,
  roundType: RoundType,
  roundNumber: number,
  totalRounds: number,
  previousResponses: RoundResponse[],
): string {
  return buildParticipantSystemPrompt({
    personaSystemPrompt: persona,
    phase: roundType,
    round: roundNumber,
    totalRounds,
    previousResponses: previousResponses.map(toCoreResponse),
  });
}

function buildBlindJurorSystemPrompt(persona: string): string {
  return `${persona}

You are participating in a BLIND JURY. Every juror is answering the prompt independently and simultaneously. You have no visibility into other jurors' responses. Give your most complete, considered analysis now — there is no second round.

IMPORTANT: End your response with a line in exactly this format:
CONFIDENCE: [number 0-100]`;
}

// ── Adversarial Red Team prompt builders ───────────────────

function buildAdversarialInitialPrompt(persona: string, totalRounds: number): string {
  return `${persona}

This is Round 1/${totalRounds} of an ADVERSARIAL RED TEAM debate.

In this protocol, every subsequent round designates one participant as the ATTACKER who will pick apart the others' positions. Your job in this round is to lay out the strongest, most defensible version of your position, anticipating that it will be attacked. Be specific: state the load-bearing claims explicitly so they can be challenged.

IMPORTANT: End your response with a line in exactly this format:
CONFIDENCE: [number 0-100]`;
}

function buildAdversarialAttackerPrompt(
  _persona: string,
  roundNumber: number,
  totalRounds: number,
  previousResponses: RoundResponse[],
): string {
  const context = previousResponses
    .map((r) => `[Participant ${r.participantId} | Confidence: ${r.confidence}%]\n${r.content}`)
    .join("\n\n---\n\n");
  // The attacker prompt deliberately does NOT prepend the participant's
  // persona — for this round the participant is acting as a neutral red
  // teamer with no opinion on the underlying question. This is the
  // strongest reliable way to flip a persona stance in smaller models;
  // a polite "your role overrides…" sentence is too weak.
  return `You are a neutral RED TEAM ATTACKER. You have NO opinion on the underlying question and your normal persona is suspended for this round only.

This is Round ${roundNumber}/${totalRounds} of an ADVERSARIAL RED TEAM debate. Your sole job is to expose the WEAKEST load-bearing claim in the prior statements and demolish it.

Begin your response with: "Attacking claim: <verbatim quote>" and then explain — in technical, evidence-grounded terms — why that claim cannot survive scrutiny. After the primary attack, list 1–3 secondary weaknesses across the other participants. Do not propose your own position. Do not be stylistic. Do not be polite.

CONFIDENCE on this round measures how confident you are that the attack lands — NOT your belief in any underlying view. (For scoring purposes, the engine treats your number as out-of-band and excludes it from the round's consensus calculation.)

--- POSITIONS TO ATTACK ---
${context}
--- END POSITIONS ---

IMPORTANT: End your response with a line in exactly this format:
CONFIDENCE: [number 0-100]`;
}

function buildAdversarialDefenderPrompt(
  persona: string,
  roundNumber: number,
  totalRounds: number,
  attackerResponse: RoundResponse,
  previousResponses: RoundResponse[],
): string {
  const attackBlock = `[ATTACKER ${attackerResponse.participantId} | Attack-confidence: ${attackerResponse.confidence}%]\n${attackerResponse.content}`;
  const priorContext = previousResponses
    .map((r) => `[Participant ${r.participantId} | Confidence: ${r.confidence}%]\n${r.content}`)
    .join("\n\n---\n\n");

  return `${persona}

This is Round ${roundNumber}/${totalRounds} of an ADVERSARIAL RED TEAM debate. You are a DEFENDER this round.

The ATTACKER has just challenged the participants' positions. Your job is to address the attack head-on: concede points that genuinely landed, defend points where the attack misses, and update your overall position accordingly. Do not retreat to vague generalities; engage with the specific claims the attacker raised. You are answering in parallel with other defenders — do NOT reference what other defenders are saying this round, only the attack itself and the prior rounds.

--- THIS ROUND'S ATTACK ---
${attackBlock}

--- PRIOR ROUNDS ---
${priorContext || "(none)"}
--- END CONTEXT ---

CONFIDENCE on this round measures your updated confidence in YOUR position after taking the attack into account.

IMPORTANT: End your response with a line in exactly this format:
CONFIDENCE: [number 0-100]`;
}

function buildAdversarialFinalPrompt(
  persona: string,
  roundNumber: number,
  totalRounds: number,
  previousResponses: RoundResponse[],
): string {
  const context = previousResponses
    .map((r) => `[Participant ${r.participantId} | Confidence: ${r.confidence}%]\n${r.content}`)
    .join("\n\n---\n\n");
  return `${persona}

This is Round ${roundNumber}/${totalRounds} of an ADVERSARIAL RED TEAM debate. This is the FINAL POST-STRESS SYNTHESIS round.

Your position has been attacked across the prior rounds. State your final, post-stress position. Be explicit about: which attacks landed and changed your view, which attacks missed and why, and what conditional caveats you now attach to your conclusion that you would not have attached before stress-testing.

--- DEBATE TRANSCRIPT ---
${context}
--- END TRANSCRIPT ---

IMPORTANT: End your response with a line in exactly this format:
CONFIDENCE: [number 0-100]`;
}

/** Pick the attacker for a given round in the adversarial engine.
 *  Round 2 → participant[0], Round 3 → participant[1], etc. Round-robin
 *  rotation so every participant gets to attack at least once when
 *  totalRounds-1 ≥ participants.length. */
export function pickAttackerIndex(round: number, participantCount: number): number {
  if (participantCount <= 0) return 0;
  return (round - 2) % participantCount;
}

function buildJudgeContext(finalResponses: RoundResponse[], participants: Participant[]): string {
  return buildJudgeUserPrompt({
    finalResponses: finalResponses.map(toCoreResponse),
    participants: participants.map(toCoreParticipant),
  });
}

// ── Extraction and scoring (core) ──────────────────────────

function calculateConsensusScore(responses: RoundResponse[]): number {
  return consensusScore(responses.filter((r) => !r.error).map((r) => r.confidence));
}

/**
 * Detect disagreements in a round using a deterministic, text-free
 * heuristic: pairs of participants whose confidence scores diverge
 * by >= 20 points.
 */
export function detectDisagreements(
  round: number,
  responses: RoundResponse[],
  participants: Participant[],
): Disagreement[] {
  return coreDetectDisagreements({
    round,
    responses: responses.map(toCoreResponse),
    participants: participants.map(toCoreParticipant),
    threshold: 20,
  });
}

// ── Streaming a single participant ─────────────────────────

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

  const caller = createVercelCaller(() => participant.modelInfo.id);
  try {
    const result = await caller({
      participantId: participant.id,
      modelId: participant.modelInfo.modelId,
      round,
      phase: "initial-analysis",
      system: systemPrompt,
      user: userPrompt,
      temperature: 0.7,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      signal,
      onToken: (token) => {
        fullContent += token;
        emit({ type: "token", participantId: participant.id, round, token });
      },
    });
    fullContent = result.content;
    const resolved = findResolvedModel(participant.modelInfo.id);
    usage = withCost(resolved?.modelId ?? participant.modelInfo.modelId, result.usage);
  } catch (err) {
    if (isAbortError(err)) throw err;
    errorMessage = err instanceof Error ? err.message : String(err);

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

  emit({ type: "judge-start", modelId: resolved.modelId, providerName: resolved.providerName });

  const context = buildJudgeContext(finalResponses, participants);
  const system = buildJudgeSystemPrompt({
    judgeSystemPrompt: JUDGE_PERSONA.systemPrompt,
    question: userPrompt,
  });

  let content = "";
  let usage: TokenUsage | undefined;

  try {
    const caller = createVercelCaller(() => judgeModelId);
    const result = await caller({
      participantId: "judge",
      modelId: resolved.modelId,
      round: 0,
      phase: "synthesis",
      system,
      user: context,
      temperature: 0.3,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      signal,
      onToken: (token) => {
        content += token;
        emit({ type: "judge-token", token });
      },
    });
    content = result.content;
    usage = withCost(resolved.modelId, result.usage);
  } catch (err) {
    if (isAbortError(err)) throw err;
    const msg = err instanceof Error ? err.message : String(err);
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

// ── Claim-level extractor (core) ───────────────────────────

async function runClaimExtractor(
  modelId: string,
  finalResponses: RoundResponse[],
  participants: Participant[],
  emit: (event: ConsensusEvent) => void,
  signal?: AbortSignal,
): Promise<ClaimDigest | null> {
  const resolved = findResolvedModel(modelId);
  if (!resolved) {
    console.warn(`[RoundTable] Claim extractor: model not available: ${modelId}`);
    const digest: ClaimDigest = {
      modelId,
      providerName: "unknown",
      contradictions: [],
      rawContent: "",
      error: `Claim extractor model not available: ${modelId}`,
    };
    emit({ type: "claims-end", digest });
    return digest;
  }

  emit({
    type: "claims-start",
    modelId: resolved.modelId,
    providerName: resolved.providerName,
  });

  const core = await extractClaims(
    createVercelCaller(() => modelId),
    {
      modelId: resolved.modelId,
      finalResponses: finalResponses.map(toCoreResponse),
      participants: participants.map(toCoreParticipant),
      signal,
    },
  );
  const usage = withCost(resolved.modelId, core.usage);
  const digest: ClaimDigest = {
    modelId: resolved.modelId,
    providerName: resolved.providerName,
    contradictions: core.contradictions,
    rawContent: core.rawContent,
    usage,
    ...(core.error ? { error: core.error } : {}),
  };
  emit({ type: "claims-end", digest });
  return digest;
}

/**
 * Pick the model used for the claim extractor. Prefers the judge model
 * when judge synthesis is enabled (consistency, single user choice);
 * otherwise falls back to the first participant's model.
 */
function pickClaimExtractorModelId(
  options: ConsensusOptions,
  participants: Participant[],
): string | null {
  if (options.judgeEnabled && options.judgeModelId) return options.judgeModelId;
  return participants[0]?.modelInfo.id ?? null;
}

// ── CVP Engine ─────────────────────────────────────────────

/** Sum cost from a list of responses (skips errored ones — they're free). */
function sumResponseCost(responses: RoundResponse[]): number {
  return responses.reduce((acc, r) => acc + (r.usage?.estimatedCostUSD ?? 0), 0);
}

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
  let runningCostUSD = 0;

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
    runningCostUSD += sumResponseCost(roundResponses);
    enforceCostCap(runningCostUSD, options.costCapUSD);

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
    const judge = await runJudge(
      options.judgeModelId,
      lastRoundResponses,
      participants,
      prompt,
      emit,
      signal,
    );
    runningCostUSD += judge.usage?.estimatedCostUSD ?? 0;
    enforceCostCap(runningCostUSD, options.costCapUSD);
  }

  if (options.extractClaimsEnabled) {
    const claimsModelId = pickClaimExtractorModelId(options, participants);
    if (claimsModelId) {
      const digest = await runClaimExtractor(
        claimsModelId,
        lastRoundResponses,
        participants,
        emit,
        signal,
      );
      runningCostUSD += digest?.usage?.estimatedCostUSD ?? 0;
      enforceCostCap(runningCostUSD, options.costCapUSD);
    }
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
  let runningCostUSD = 0;

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

  runningCostUSD += sumResponseCost(results);
  enforceCostCap(runningCostUSD, options.costCapUSD);

  const consensusScore = calculateConsensusScore(results);
  emit({ type: "round-end", round: 1, consensusScore });

  const disagreements = detectDisagreements(1, results, participants);
  if (disagreements.length > 0) {
    emit({ type: "disagreements", round: 1, disagreements });
  }

  // Blind Jury always runs the judge if a model is available.
  if (options.judgeEnabled && options.judgeModelId) {
    const judge = await runJudge(options.judgeModelId, results, participants, prompt, emit, signal);
    runningCostUSD += judge.usage?.estimatedCostUSD ?? 0;
    enforceCostCap(runningCostUSD, options.costCapUSD);
  }

  if (options.extractClaimsEnabled) {
    const claimsModelId = pickClaimExtractorModelId(options, participants);
    if (claimsModelId) {
      const digest = await runClaimExtractor(claimsModelId, results, participants, emit, signal);
      runningCostUSD += digest?.usage?.estimatedCostUSD ?? 0;
      enforceCostCap(runningCostUSD, options.costCapUSD);
    }
  }

  emit({
    type: "consensus-complete",
    finalScore: consensusScore,
    summary: `Blind Jury reached a consensus score of ${consensusScore}% across ${participants.length} independent jurors.`,
    roundsCompleted: 1,
  });

  return consensusScore;
}

// ── Adversarial Red Team Engine ────────────────────────────

async function runAdversarialConsensus(
  prompt: string,
  participants: Participant[],
  options: ConsensusOptions,
  emit: (event: ConsensusEvent) => void,
  signal?: AbortSignal,
): Promise<number> {
  const totalRounds = options.rounds;
  const allResponses: RoundResponse[] = [];
  let runningCostUSD = 0;

  // Round 1 — initial parallel positions
  emit({
    type: "round-start",
    round: 1,
    roundType: "initial-analysis",
    label: "Initial Positions",
  });

  const r1 = await Promise.all(
    participants.map((p) =>
      streamParticipant(
        p,
        buildAdversarialInitialPrompt(p.persona.systemPrompt, totalRounds),
        prompt,
        1,
        emit,
        signal,
      ),
    ),
  );
  allResponses.push(...r1);
  runningCostUSD += sumResponseCost(r1);
  enforceCostCap(runningCostUSD, options.costCapUSD);
  const r1Score = calculateConsensusScore(r1);
  emit({ type: "round-end", round: 1, consensusScore: r1Score });
  const r1Disagreements = detectDisagreements(1, r1, participants);
  if (r1Disagreements.length > 0) {
    emit({ type: "disagreements", round: 1, disagreements: r1Disagreements });
  }

  // Rounds 2..N-1 — stress test rounds (one attacker, rest defend)
  // For totalRounds == 1 we are done after R1.
  // For totalRounds == 2 the only "extra" round becomes the final synthesis.
  for (let round = 2; round < totalRounds; round++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const attackerIdx = pickAttackerIndex(round, participants.length);
    const attacker = participants[attackerIdx];
    const defenders = participants.filter((_, i) => i !== attackerIdx);

    emit({
      type: "round-start",
      round,
      roundType: "counterarguments",
      label: `Stress Test — Attacker: ${attacker.persona.name}`,
    });

    const previousResponses = allResponses.filter((r) => r.roundNumber < round);
    const roundResponses: RoundResponse[] = [];

    // Attacker speaks first
    const attackerResponse = await streamParticipant(
      attacker,
      buildAdversarialAttackerPrompt(
        attacker.persona.systemPrompt,
        round,
        totalRounds,
        previousResponses,
      ),
      prompt,
      round,
      emit,
      signal,
    );
    roundResponses.push(attackerResponse);

    // Defenders respond IN PARALLEL — each sees only the attacker and
    // prior rounds, never other defenders this round. This matches the
    // anti-anchoring philosophy of CVP's blind round 1 and the parallel
    // final synthesis below.
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const defenderResponses = await Promise.all(
      defenders.map((defender) =>
        streamParticipant(
          defender,
          buildAdversarialDefenderPrompt(
            defender.persona.systemPrompt,
            round,
            totalRounds,
            attackerResponse,
            previousResponses,
          ),
          prompt,
          round,
          emit,
          signal,
        ),
      ),
    );
    roundResponses.push(...defenderResponses);

    allResponses.push(...roundResponses);
    runningCostUSD += sumResponseCost(roundResponses);
    enforceCostCap(runningCostUSD, options.costCapUSD);

    // The attacker's confidence measures attack-success, not belief in a
    // position, so it is OUT-OF-BAND for the consensus formula. Score
    // and disagreement detection use defender responses only on stress
    // rounds. This keeps the (avg - 0.5*stddev) interpretation
    // consistent across rounds and engines.
    const score = calculateConsensusScore(defenderResponses);
    emit({ type: "round-end", round, consensusScore: score });
    const disagreements = detectDisagreements(round, defenderResponses, participants);
    if (disagreements.length > 0) {
      emit({ type: "disagreements", round, disagreements });
    }
  }

  // Final round — post-stress synthesis (every participant in parallel)
  // Skip if totalRounds == 1 (everything was Round 1).
  let finalRoundResponses: RoundResponse[] = r1;
  let finalRoundNumber = 1;
  if (totalRounds >= 2) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const finalRound = totalRounds;
    emit({
      type: "round-start",
      round: finalRound,
      roundType: "synthesis",
      label: "Post-Stress Final Synthesis",
    });
    const previous = allResponses.filter((r) => r.roundNumber < finalRound);
    finalRoundResponses = await Promise.all(
      participants.map((p) =>
        streamParticipant(
          p,
          buildAdversarialFinalPrompt(p.persona.systemPrompt, finalRound, totalRounds, previous),
          prompt,
          finalRound,
          emit,
          signal,
        ),
      ),
    );
    allResponses.push(...finalRoundResponses);
    runningCostUSD += sumResponseCost(finalRoundResponses);
    enforceCostCap(runningCostUSD, options.costCapUSD);
    const score = calculateConsensusScore(finalRoundResponses);
    emit({ type: "round-end", round: finalRound, consensusScore: score });
    const disagreements = detectDisagreements(finalRound, finalRoundResponses, participants);
    if (disagreements.length > 0) {
      emit({ type: "disagreements", round: finalRound, disagreements });
    }
    finalRoundNumber = finalRound;
  }

  const finalScore = calculateConsensusScore(finalRoundResponses);

  if (options.judgeEnabled && options.judgeModelId) {
    const judge = await runJudge(
      options.judgeModelId,
      finalRoundResponses,
      participants,
      prompt,
      emit,
      signal,
    );
    runningCostUSD += judge.usage?.estimatedCostUSD ?? 0;
    enforceCostCap(runningCostUSD, options.costCapUSD);
  }

  if (options.extractClaimsEnabled) {
    const claimsModelId = pickClaimExtractorModelId(options, participants);
    if (claimsModelId) {
      const digest = await runClaimExtractor(
        claimsModelId,
        finalRoundResponses,
        participants,
        emit,
        signal,
      );
      runningCostUSD += digest?.usage?.estimatedCostUSD ?? 0;
      enforceCostCap(runningCostUSD, options.costCapUSD);
    }
  }

  emit({
    type: "consensus-complete",
    finalScore,
    summary: `Adversarial Red Team completed ${finalRoundNumber} round${finalRoundNumber !== 1 ? "s" : ""} with ${participants.length} participants. Final post-stress consensus score: ${finalScore}%.`,
    roundsCompleted: finalRoundNumber,
  });

  return finalScore;
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
  } else if (options.engine === "adversarial") {
    await runAdversarialConsensus(prompt, participants, options, emit, signal);
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
  buildAdversarialInitialPrompt,
  buildAdversarialAttackerPrompt,
  buildAdversarialDefenderPrompt,
  buildAdversarialFinalPrompt,
  pickAttackerIndex,
  parseClaimsJSON,
  pickClaimExtractorModelId,
  ZERO_USAGE,
  addUsage,
};
