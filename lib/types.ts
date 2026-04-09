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

/** A single round's response from one AI */
export interface RoundResponse {
  participantId: string;
  roundNumber: number;
  content: string;
  confidence: number; // 0-100
  timestamp: number;
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
    }
  | { type: "round-end"; round: number; consensusScore: number }
  | { type: "consensus-complete"; finalScore: number; summary: string }
  | { type: "error"; message: string };

/** Request body for /api/consensus */
export interface ConsensusRequest {
  prompt: string;
  participants: Participant[];
  rounds: number;
}

/** Global app state managed by Zustand */
export interface ArenaState {
  // Available models (fetched from server)
  availableModels: ModelInfo[];
  modelsLoading: boolean;

  // Configuration
  participants: Participant[];
  roundCount: number;
  prompt: string;

  // Consensus execution state
  isRunning: boolean;
  currentRound: number;
  rounds: ConsensusRound[];
  activeStreams: Record<string, string>;
  finalScore: number | null;
  finalSummary: string | null;
  progress: number; // 0-1

  // Cancellation
  abortController: AbortController | null;

  // Actions
  setAvailableModels: (models: ModelInfo[]) => void;
  setModelsLoading: (loading: boolean) => void;
  addParticipant: (model: ModelInfo, persona: Persona) => void;
  removeParticipant: (id: string) => void;
  updateParticipantPersona: (id: string, persona: Persona) => void;
  updateParticipantModel: (id: string, model: ModelInfo) => void;
  setRoundCount: (count: number) => void;
  setPrompt: (prompt: string) => void;
  startConsensus: () => AbortController;
  cancelConsensus: () => void;
  appendToken: (participantId: string, round: number, token: string) => void;
  completeParticipantRound: (
    participantId: string,
    round: number,
    confidence: number,
    fullContent: string,
  ) => void;
  startRound: (round: number, type: RoundType, label: string) => void;
  endRound: (round: number, consensusScore: number) => void;
  completeConsensus: (finalScore: number, summary: string) => void;
  reset: () => void;
}
