// ─────────────────────────────────────────────────────────────
// RoundTable — Core Type Definitions
// ─────────────────────────────────────────────────────────────

/** Raw provider config as stored in AI_PROVIDERS env var */
export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string; // "env:VAR_NAME" or literal
  models?: string[]; // optional — if omitted, models are fetched from the provider API
}

/** A resolved model ready for API calls (never exposed to client) */
export interface ResolvedModel {
  providerId: string;
  providerName: string;
  modelId: string;
  baseUrl: string;
  apiKey: string; // resolved actual key
}

/** Client-safe model info (no secrets) */
export interface ModelInfo {
  id: string; // "provider:model" composite key
  providerId: string;
  providerName: string;
  modelId: string;
  preferred?: boolean; // true if explicitly listed in AI_PROVIDERS models array
}

/** Persona definition */
export interface Persona {
  id: string;
  name: string;
  emoji: string;
  color: string;
  systemPrompt: string;
  description: string;
}

/** An AI participant in the consensus process */
export interface Participant {
  id: string;
  modelInfo: ModelInfo;
  persona: Persona;
}

/** Token usage for a single AI call */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Estimated cost in USD, based on the pricing table in lib/pricing.ts */
  estimatedCostUSD: number;
}

/** A single round's response from one AI */
export interface RoundResponse {
  participantId: string;
  roundNumber: number;
  content: string;
  confidence: number; // 0-100
  timestamp: number;
  durationMs?: number;
  usage?: TokenUsage;
  /** If the provider call failed, a short human-readable error (e.g. `Not Found (HTTP 404)`). */
  error?: string;
}

/** Consensus round metadata */
export interface ConsensusRound {
  number: number;
  type: RoundType;
  label: string;
  responses: RoundResponse[];
  consensusScore: number; // 0-100
}

export type RoundType =
  | "initial-analysis"
  | "counterarguments"
  | "evidence-assessment"
  | "synthesis";

/** Which engine to run */
export type EngineType = "cvp" | "blind-jury";

/** A detected disagreement between participants in a round */
export interface Disagreement {
  id: string; // stable: `r<N>-<pA>-<pB>`
  round: number;
  participantAId: string;
  participantBId: string;
  /** Confidence delta that flagged the divergence (0-100) */
  severity: number;
  /** Short label summarising the nature of the split */
  label: string;
}

/** Judge synthesis output (non-voting final summariser) */
export interface JudgeResult {
  modelId: string;
  providerName: string;
  content: string;
  majorityPosition: string;
  minorityPositions: string;
  unresolvedDisputes: string;
  usage?: TokenUsage;
}

/**
 * User-configurable options for a consensus run.
 * Every field is optional on the wire — defaults are applied server-side.
 */
export interface ConsensusOptions {
  engine: EngineType;
  /** Only used when engine === "cvp" */
  rounds: number;
  /** Shuffle participant order each round (CVP only) */
  randomizeOrder: boolean;
  /** Run Round 1 in parallel with no cross-visibility (CVP only) */
  blindFirstRound: boolean;
  /** Stop early if the consensus delta between rounds falls below threshold (CVP only) */
  earlyStop: boolean;
  /** Run a non-voting judge synthesizer at the end of the run */
  judgeEnabled: boolean;
  /** Composite model id (provider:model) to use for the judge */
  judgeModelId?: string;
}

/** SSE event types streamed from /api/consensus */
export type ConsensusEvent =
  | { type: "round-start"; round: number; roundType: RoundType; label: string }
  | { type: "participant-start"; participantId: string; round: number }
  | { type: "token"; participantId: string; round: number; token: string }
  | {
      type: "participant-end";
      participantId: string;
      round: number;
      confidence: number;
      fullContent: string;
      usage?: TokenUsage;
      durationMs: number;
      error?: string;
    }
  | { type: "round-end"; round: number; consensusScore: number }
  | { type: "disagreements"; round: number; disagreements: Disagreement[] }
  | {
      type: "early-stop";
      round: number;
      delta: number;
      reason: string;
    }
  | { type: "judge-start"; modelId: string; providerName: string }
  | { type: "judge-token"; token: string }
  | { type: "judge-end"; result: JudgeResult }
  | {
      type: "consensus-complete";
      finalScore: number;
      summary: string;
      roundsCompleted: number;
    }
  | { type: "error"; message: string };

/** Request body for /api/consensus */
export interface ConsensusRequest {
  prompt: string;
  participants: Participant[];
  options: ConsensusOptions;
}

/** A frozen snapshot of a completed run — used for export + share links */
export interface SessionSnapshot {
  v: 1;
  prompt: string;
  engine: EngineType;
  options: ConsensusOptions;
  participants: Participant[];
  rounds: ConsensusRound[];
  finalScore: number | null;
  finalSummary: string | null;
  judge: JudgeResult | null;
  disagreements: Disagreement[];
  tokenTotal: TokenUsage | null;
  createdAt: number;
}

/** Global app state managed by Zustand */
export interface ArenaState {
  // Available models (fetched from server)
  availableModels: ModelInfo[];
  modelsLoading: boolean;

  // Configuration
  participants: Participant[];
  prompt: string;
  options: ConsensusOptions;

  // Consensus execution state
  isRunning: boolean;
  currentRound: number;
  rounds: ConsensusRound[];
  activeStreams: Record<string, string>;
  finalScore: number | null;
  finalSummary: string | null;
  progress: number; // 0-1
  roundsCompleted: number;

  // New — Judge, disagreements, cost meter
  disagreements: Disagreement[];
  judge: JudgeResult | null;
  judgeStream: string;
  judgeRunning: boolean;
  earlyStopped: { round: number; delta: number; reason: string } | null;
  tokenTotal: TokenUsage;
  usageByParticipant: Record<string, TokenUsage>;

  // Shared-session replay flag
  sharedView: boolean;

  // Cancellation
  abortController: AbortController | null;

  // Actions — configuration
  setAvailableModels: (models: ModelInfo[]) => void;
  setModelsLoading: (loading: boolean) => void;
  addParticipant: (model: ModelInfo, persona: Persona) => void;
  removeParticipant: (id: string) => void;
  updateParticipantPersona: (id: string, persona: Persona) => void;
  updateParticipantModel: (id: string, model: ModelInfo) => void;
  setPrompt: (prompt: string) => void;
  setRoundCount: (count: number) => void;
  setOption: <K extends keyof ConsensusOptions>(key: K, value: ConsensusOptions[K]) => void;

  // Actions — lifecycle
  startConsensus: () => AbortController;
  cancelConsensus: () => void;
  appendToken: (participantId: string, round: number, token: string) => void;
  completeParticipantRound: (
    participantId: string,
    round: number,
    confidence: number,
    fullContent: string,
    usage?: TokenUsage,
    durationMs?: number,
    error?: string,
  ) => void;
  startRound: (round: number, type: RoundType, label: string) => void;
  endRound: (round: number, consensusScore: number) => void;
  addDisagreements: (round: number, items: Disagreement[]) => void;
  setEarlyStopped: (info: { round: number; delta: number; reason: string }) => void;
  startJudge: (modelId: string, providerName: string) => void;
  appendJudgeToken: (token: string) => void;
  completeJudge: (result: JudgeResult) => void;
  completeConsensus: (finalScore: number, summary: string, roundsCompleted: number) => void;
  reset: () => void;

  // Snapshot / replay
  loadSnapshot: (snapshot: SessionSnapshot) => void;
  getSnapshot: () => SessionSnapshot;
}
