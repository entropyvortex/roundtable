// ─────────────────────────────────────────────────────────────
// RoundTable — Global State (Zustand)
// ─────────────────────────────────────────────────────────────

import { create } from "zustand";
import type {
  ArenaState,
  ClaimDigest,
  ConsensusOptions,
  Disagreement,
  EngineType,
  JudgeResult,
  RoundType,
  SessionSnapshot,
  TokenUsage,
} from "./types";
import { addUsage, ZERO_USAGE } from "./pricing";

let participantCounter = 0;

export const DEFAULT_OPTIONS: ConsensusOptions = {
  engine: "cvp",
  rounds: 5,
  randomizeOrder: true,
  blindFirstRound: true,
  earlyStop: true,
  judgeEnabled: false,
  judgeModelId: undefined,
  // ON by default — claim-level disagreement extraction is one of the
  // headline features. Cost is +1 LLM call per run. The user can turn
  // it off in the Protocol panel for cost-sensitive runs.
  extractClaimsEnabled: true,
};

const freshUsageState = () => ({
  tokenTotal: { ...ZERO_USAGE } as TokenUsage,
  usageByParticipant: {} as Record<string, TokenUsage>,
});

export const useArenaStore = create<ArenaState>((set, get) => ({
  availableModels: [],
  modelsLoading: true,
  participants: [],
  prompt: "",
  options: { ...DEFAULT_OPTIONS },

  isRunning: false,
  currentRound: 0,
  rounds: [],
  activeStreams: {},
  finalScore: null,
  finalSummary: null,
  progress: 0,
  roundsCompleted: 0,

  disagreements: [],
  judge: null,
  judgeStream: "",
  judgeRunning: false,
  earlyStopped: null,
  ...freshUsageState(),

  claims: null,
  claimsRunning: false,

  sweepActive: false,
  sweepEngines: [],
  sweepCurrentIndex: 0,
  sweepResults: [],

  sharedView: false,
  abortController: null,

  // ── Configuration ──────────────────────────────────────────

  setAvailableModels: (models) => set({ availableModels: models }),
  setModelsLoading: (loading) => set({ modelsLoading: loading }),

  addParticipant: (model, persona, customSpec) => {
    participantCounter++;
    const id = `p-${participantCounter}`;
    set((s) => ({
      participants: [
        ...s.participants,
        { id, modelInfo: model, persona, ...(customSpec ? { customPersonaSpec: customSpec } : {}) },
      ],
    }));
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

  setPrompt: (prompt) => set({ prompt }),

  setRoundCount: (count) =>
    set((s) => ({
      options: { ...s.options, rounds: Math.max(1, Math.min(10, count)) },
    })),

  setOption: (key, value) =>
    set((s) => ({
      options: { ...s.options, [key]: value },
    })),

  // ── Lifecycle ──────────────────────────────────────────────

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
      roundsCompleted: 0,
      disagreements: [],
      judge: null,
      judgeStream: "",
      judgeRunning: false,
      earlyStopped: null,
      ...freshUsageState(),
      claims: null,
      claimsRunning: false,
      sharedView: false,
      abortController: controller,
    });
    return controller;
  },

  cancelConsensus: () =>
    set((s) => {
      s.abortController?.abort();
      return {
        isRunning: false,
        judgeRunning: false,
        judgeStream: "",
        claimsRunning: false,
        abortController: null,
      };
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
      progress: (round - 1) / Math.max(1, s.options.rounds),
      rounds: [...s.rounds, { number: round, type, label, responses: [], consensusScore: 0 }],
    })),

  completeParticipantRound: (
    participantId,
    roundNumber,
    confidence,
    fullContent,
    usage,
    durationMs,
    error,
  ) =>
    set((s) => {
      const nextUsageByParticipant = { ...s.usageByParticipant };
      let nextTotal = s.tokenTotal;
      if (usage) {
        const prev = nextUsageByParticipant[participantId] ?? ZERO_USAGE;
        nextUsageByParticipant[participantId] = addUsage(prev, usage);
        nextTotal = addUsage(nextTotal, usage);
      }
      return {
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
                    durationMs,
                    usage,
                    error,
                  },
                ],
              }
            : r,
        ),
        tokenTotal: nextTotal,
        usageByParticipant: nextUsageByParticipant,
      };
    }),

  endRound: (round, consensusScore) =>
    set((s) => ({
      rounds: s.rounds.map((r) => (r.number === round ? { ...r, consensusScore } : r)),
      progress: round / Math.max(1, s.options.rounds),
    })),

  addDisagreements: (_round, items: Disagreement[]) =>
    set((s) => ({
      disagreements: [...s.disagreements, ...items],
    })),

  setEarlyStopped: (info) => set({ earlyStopped: info }),

  startJudge: (modelId, providerName) =>
    set({
      judgeRunning: true,
      judgeStream: "",
      judge: {
        modelId,
        providerName,
        content: "",
        majorityPosition: "",
        minorityPositions: "",
        unresolvedDisputes: "",
      },
    }),

  appendJudgeToken: (token) => set((s) => ({ judgeStream: s.judgeStream + token })),

  completeJudge: (result: JudgeResult) =>
    set((s) => {
      const nextTotal = result.usage ? addUsage(s.tokenTotal, result.usage) : s.tokenTotal;
      return {
        judgeRunning: false,
        judgeStream: "",
        judge: result,
        tokenTotal: nextTotal,
      };
    }),

  startClaims: () => set({ claimsRunning: true }),

  completeClaims: (digest: ClaimDigest) =>
    set((s) => {
      const nextTotal = digest.usage ? addUsage(s.tokenTotal, digest.usage) : s.tokenTotal;
      return {
        claimsRunning: false,
        claims: digest,
        tokenTotal: nextTotal,
      };
    }),

  startSweep: (engines: EngineType[]) =>
    set({
      sweepActive: true,
      sweepEngines: engines,
      sweepCurrentIndex: 0,
      sweepResults: [],
    }),

  setSweepCurrentIndex: (i: number) => set({ sweepCurrentIndex: i }),

  pushSweepResult: (snapshot: SessionSnapshot) =>
    set((s) => ({ sweepResults: [...s.sweepResults, snapshot] })),

  clearSweep: () =>
    set({
      sweepActive: false,
      sweepEngines: [],
      sweepCurrentIndex: 0,
      sweepResults: [],
    }),

  cancelSweep: () =>
    set((s) => {
      s.abortController?.abort();
      return {
        isRunning: false,
        judgeRunning: false,
        judgeStream: "",
        claimsRunning: false,
        abortController: null,
        sweepActive: false,
        sweepEngines: [],
        sweepCurrentIndex: 0,
        // Keep sweepResults so the user can still see whichever engines completed
      };
    }),

  completeConsensus: (finalScore, summary, roundsCompleted) =>
    set({
      isRunning: false,
      finalScore,
      finalSummary: summary,
      progress: 1,
      roundsCompleted,
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
        roundsCompleted: 0,
        disagreements: [],
        judge: null,
        judgeStream: "",
        judgeRunning: false,
        earlyStopped: null,
        ...freshUsageState(),
        claims: null,
        claimsRunning: false,
        sharedView: false,
        abortController: null,
      };
    }),

  // ── Snapshot / share ───────────────────────────────────────

  loadSnapshot: (snapshot: SessionSnapshot) => {
    // Abort anything running and replace visible state with the snapshot.
    const s = get();
    s.abortController?.abort();

    // Reconstruct per-participant token totals from the snapshot's
    // round-level responses. Older code reset this to {}, which made
    // shared-view users see 0 tokens for every participant in the
    // floating cost meter.
    const usageByParticipant: Record<string, TokenUsage> = {};
    for (const round of snapshot.rounds) {
      for (const r of round.responses) {
        if (!r.usage) continue;
        const prev = usageByParticipant[r.participantId] ?? ZERO_USAGE;
        usageByParticipant[r.participantId] = addUsage(prev, r.usage);
      }
    }

    set({
      prompt: snapshot.prompt,
      participants: snapshot.participants,
      options: snapshot.options,
      rounds: snapshot.rounds,
      finalScore: snapshot.finalScore,
      finalSummary: snapshot.finalSummary,
      judge: snapshot.judge,
      judgeStream: "",
      judgeRunning: false,
      disagreements: snapshot.disagreements,
      earlyStopped: null,
      tokenTotal: snapshot.tokenTotal ?? { ...ZERO_USAGE },
      usageByParticipant,
      claims: snapshot.claims ?? null,
      claimsRunning: false,
      roundsCompleted: snapshot.rounds.length,
      progress: 1,
      activeStreams: {},
      currentRound: snapshot.rounds.length,
      isRunning: false,
      sharedView: true,
      abortController: null,
    });
  },

  getSnapshot: (): SessionSnapshot => {
    const s = get();
    return {
      v: 1,
      prompt: s.prompt,
      engine: s.options.engine,
      options: s.options,
      participants: s.participants,
      rounds: s.rounds,
      finalScore: s.finalScore,
      finalSummary: s.finalSummary,
      judge: s.judge,
      disagreements: s.disagreements,
      claims: s.claims,
      tokenTotal: s.tokenTotal,
      createdAt: Date.now(),
    };
  },
}));
