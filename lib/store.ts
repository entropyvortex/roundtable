// ─────────────────────────────────────────────────────────────
// RoundTable — Global State (Zustand)
// ─────────────────────────────────────────────────────────────

import { create } from "zustand";
import type { ArenaState, ModelInfo, Persona, RoundType } from "./types";

let participantCounter = 0;

export const useArenaStore = create<ArenaState>((set) => ({
  availableModels: [],
  modelsLoading: true,
  participants: [],
  roundCount: 5,
  prompt: "",
  isRunning: false,
  currentRound: 0,
  rounds: [],
  activeStreams: {},
  finalScore: null,
  finalSummary: null,
  abortController: null,
  progress: 0,

  setAvailableModels: (models) => set({ availableModels: models }),
  setModelsLoading: (loading) => set({ modelsLoading: loading }),

  addParticipant: (model: ModelInfo, persona: Persona) => {
    participantCounter++;
    const id = `p-${participantCounter}`;
    set((s) => ({ participants: [...s.participants, { id, modelInfo: model, persona }] }));
  },

  removeParticipant: (id) =>
    set((s) => ({ participants: s.participants.filter((p) => p.id !== id) })),

  updateParticipantPersona: (id, persona) =>
    set((s) => ({
      participants: s.participants.map((p) => (p.id === id ? { ...p, persona } : p)),
    })),

  updateParticipantModel: (id, model) =>
    set((s) => ({
      participants: s.participants.map((p) => (p.id === id ? { ...p, modelInfo: model } : p)),
    })),

  setRoundCount: (count) => set({ roundCount: Math.max(1, Math.min(10, count)) }),
  setPrompt: (prompt) => set({ prompt }),

  startConsensus: () => {
    const controller = new AbortController();
    set({
      isRunning: true,
      currentRound: 0,
      rounds: [],
      activeStreams: {},
      finalScore: null,
      finalSummary: null,
      progress: 0,
      abortController: controller,
    });
    return controller;
  },

  cancelConsensus: () =>
    set((s) => {
      s.abortController?.abort();
      return { isRunning: false, abortController: null };
    }),

  appendToken: (participantId, _round, token) =>
    set((s) => ({
      activeStreams: {
        ...s.activeStreams,
        [participantId]: (s.activeStreams[participantId] || "") + token,
      },
    })),

  startRound: (round: number, type: RoundType, label: string) =>
    set((s) => ({
      currentRound: round,
      activeStreams: {},
      progress: (round - 1) / s.roundCount,
      rounds: [...s.rounds, { number: round, type, label, responses: [], consensusScore: 0 }],
    })),

  completeParticipantRound: (participantId, roundNumber, confidence, fullContent) =>
    set((s) => ({
      activeStreams: { ...s.activeStreams, [participantId]: "" },
      rounds: s.rounds.map((r) =>
        r.number === roundNumber
          ? {
              ...r,
              responses: [
                ...r.responses,
                {
                  participantId,
                  roundNumber,
                  content: fullContent,
                  confidence,
                  timestamp: Date.now(),
                },
              ],
            }
          : r,
      ),
    })),

  endRound: (round, consensusScore) =>
    set((s) => ({
      rounds: s.rounds.map((r) => (r.number === round ? { ...r, consensusScore } : r)),
      progress: round / s.roundCount,
    })),

  completeConsensus: (finalScore, summary) =>
    set({
      isRunning: false,
      finalScore,
      finalSummary: summary,
      progress: 1,
      abortController: null,
    }),

  reset: () =>
    set((s) => {
      s.abortController?.abort();
      return {
        isRunning: false,
        currentRound: 0,
        rounds: [],
        activeStreams: {},
        finalScore: null,
        finalSummary: null,
        progress: 0,
        abortController: null,
      };
    }),
}));
