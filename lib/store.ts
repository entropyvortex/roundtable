// ─────────────────────────────────────────────────────────────
// RoundTable — Global State (Zustand)
// ─────────────────────────────────────────────────────────────

import { create } from "zustand";
import type {
  ArenaState,
  ClaimDigest,
  ConsensusOptions,
  LoadSnapshotOptions,
  Disagreement,
  JudgeResult,
  RoundType,
  SessionSnapshot,
  TokenUsage,
} from "./types";
import { addUsage, ZERO_USAGE } from "./pricing";
import { optionsForEngine } from "./engine-rules";

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

/** The options a snapshot ran with; `engine` wins over `options.engine` for older snapshots. */
function snapshotRunOptions(snapshot: SessionSnapshot): ConsensusOptions {
  const engine = snapshot.engine ?? snapshot.options?.engine ?? DEFAULT_OPTIONS.engine;
  return { ...DEFAULT_OPTIONS, ...snapshot.options, engine };
}

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

  runOptions: null,
  runError: null,

  sharedView: false,
  abortController: null,

  view: "setup",
  runStartedAt: null,
  runEndedAt: null,

  // ── Views ──────────────────────────────────────────────────

  setView: (view) => set({ view }),

  // ── Configuration ──────────────────────────────────────────

  setAvailableModels: (models) => set({ availableModels: models }),
  setModelsLoading: (loading) => set({ modelsLoading: loading }),

  addParticipant: (model, persona, customSpec) => {
    // Skip ids already on the panel: a snapshot loaded from History or a
    // permalink brings its own `p-N` ids while the counter restarts per page load.
    const taken = new Set(get().participants.map((p) => p.id));
    let id: string;
    do {
      participantCounter++;
      id = `p-${participantCounter}`;
    } while (taken.has(id));
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
      participants: s.participants.map((p) => {
        if (p.id !== id) return p;
        // A built-in persona has no spec; drop the one a custom persona left behind.
        const { customPersonaSpec: _spec, ...rest } = p;
        return persona.id === "custom" ? { ...p, persona } : { ...rest, persona };
      }),
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

  startConsensus: (engine) => {
    const controller = new AbortController();
    const options = get().options;
    set({
      // What the request carries. Setup may change while the run streams
      // and a sweep sends another engine, so the run keeps its own copy.
      runOptions: optionsForEngine(options, engine ?? options.engine),
      runError: null,
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
      runStartedAt: Date.now(),
      runEndedAt: null,
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
        // Drop the empty placeholder `startJudge` created; no verdict arrived.
        judge: s.judgeRunning ? null : s.judge,
        claimsRunning: false,
        abortController: null,
        // Only stamp the end of a run that was actually in flight.
        runEndedAt: s.isRunning ? Date.now() : s.runEndedAt,
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
      rounds: s.rounds.map((r) =>
        r.number === round ? { ...r, consensusScore, completed: true } : r,
      ),
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

  startSweep: (engines) =>
    set({
      sweepActive: true,
      sweepEngines: [...engines],
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
        judge: s.judgeRunning ? null : s.judge,
        claimsRunning: false,
        abortController: null,
        // Engines and results stay so Compare engines can show what
        // finished, what was stopped and what never ran.
        sweepActive: false,
        runEndedAt: s.isRunning ? Date.now() : s.runEndedAt,
      };
    }),

  dismissSweep: () => set({ sweepActive: false }),

  completeConsensus: (finalScore, summary, roundsCompleted) =>
    set({
      isRunning: false,
      runError: null,
      finalScore,
      finalSummary: summary,
      progress: 1,
      roundsCompleted,
      abortController: null,
      runEndedAt: Date.now(),
    }),

  failConsensus: (message) =>
    set((s) => ({
      isRunning: false,
      runError: message,
      finalScore: null,
      finalSummary: null,
      roundsCompleted: s.rounds.filter((r) => r.completed).length,
      abortController: null,
      runEndedAt: Date.now(),
      // The run can fail mid-judge / mid-claims; leave no spinner on and
      // no empty verdict behind.
      judgeRunning: false,
      judgeStream: "",
      judge: s.judgeRunning ? null : s.judge,
      claimsRunning: false,
    })),

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
        runStartedAt: null,
        runEndedAt: null,
        runOptions: null,
        runError: null,
      };
    }),

  // ── Snapshot / share ───────────────────────────────────────

  loadSnapshot: (snapshot: SessionSnapshot, opts?: LoadSnapshotOptions) => {
    // Abort anything running and replace visible state with the snapshot.
    const s = get();
    s.abortController?.abort();

    // Per-participant token totals are not stored; rebuild them from the
    // responses so the cost breakdown is right for a loaded run.
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
      // Opening a Compare engines row keeps the user's Setup configuration.
      ...(opts?.keepOptions ? {} : { options: snapshot.options }),
      runOptions: snapshotRunOptions(snapshot),
      runError: null,
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
      // Default true keeps the permalink behaviour (read-only replay);
      // History passes `{ sharedView: false }` so the user can re-run.
      sharedView: opts?.sharedView ?? true,
      abortController: null,
      // A snapshot carries no wall-clock run duration.
      runStartedAt: null,
      runEndedAt: null,
    });
  },

  getSnapshot: (): SessionSnapshot => {
    const s = get();
    // The run's own options, not whatever Setup holds now.
    const options = s.runOptions ?? optionsForEngine(s.options, s.options.engine);
    return {
      v: 1,
      prompt: s.prompt,
      engine: options.engine,
      options,
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
