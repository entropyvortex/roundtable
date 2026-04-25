import { describe, it, expect, beforeEach } from "vitest";
import { useArenaStore, DEFAULT_OPTIONS } from "@/lib/store";
import { PERSONAS } from "@/lib/personas";
import type { ModelInfo, SessionSnapshot } from "@/lib/types";

const mockModel: ModelInfo = {
  id: "test:model-1",
  providerId: "test",
  providerName: "Test Provider",
  modelId: "model-1",
};

const mockModel2: ModelInfo = {
  id: "test:model-2",
  providerId: "test",
  providerName: "Test Provider",
  modelId: "model-2",
};

const persona = PERSONAS[0];
const persona2 = PERSONAS[1];

describe("ArenaStore", () => {
  beforeEach(() => {
    useArenaStore.getState().reset();
    useArenaStore.setState({
      availableModels: [],
      modelsLoading: true,
      participants: [],
      prompt: "",
      options: { ...DEFAULT_OPTIONS },
    });
  });

  describe("models", () => {
    it("sets available models", () => {
      useArenaStore.getState().setAvailableModels([mockModel]);
      expect(useArenaStore.getState().availableModels).toEqual([mockModel]);
    });

    it("sets models loading state", () => {
      useArenaStore.getState().setModelsLoading(false);
      expect(useArenaStore.getState().modelsLoading).toBe(false);
    });
  });

  describe("participants", () => {
    it("adds a participant", () => {
      useArenaStore.getState().addParticipant(mockModel, persona);
      const { participants } = useArenaStore.getState();
      expect(participants).toHaveLength(1);
      expect(participants[0].modelInfo).toEqual(mockModel);
      expect(participants[0].persona).toEqual(persona);
      expect(participants[0].id).toMatch(/^p-\d+$/);
    });

    it("removes a participant", () => {
      useArenaStore.getState().addParticipant(mockModel, persona);
      const id = useArenaStore.getState().participants[0].id;
      useArenaStore.getState().removeParticipant(id);
      expect(useArenaStore.getState().participants).toHaveLength(0);
    });

    it("updates participant persona", () => {
      useArenaStore.getState().addParticipant(mockModel, persona);
      const id = useArenaStore.getState().participants[0].id;
      useArenaStore.getState().updateParticipantPersona(id, persona2);
      expect(useArenaStore.getState().participants[0].persona).toEqual(persona2);
    });

    it("updates participant model", () => {
      useArenaStore.getState().addParticipant(mockModel, persona);
      const id = useArenaStore.getState().participants[0].id;
      useArenaStore.getState().updateParticipantModel(id, mockModel2);
      expect(useArenaStore.getState().participants[0].modelInfo).toEqual(mockModel2);
    });
  });

  describe("configuration", () => {
    it("sets round count clamped between 1 and 10", () => {
      useArenaStore.getState().setRoundCount(7);
      expect(useArenaStore.getState().options.rounds).toBe(7);

      useArenaStore.getState().setRoundCount(0);
      expect(useArenaStore.getState().options.rounds).toBe(1);

      useArenaStore.getState().setRoundCount(15);
      expect(useArenaStore.getState().options.rounds).toBe(10);
    });

    it("sets prompt", () => {
      useArenaStore.getState().setPrompt("test prompt");
      expect(useArenaStore.getState().prompt).toBe("test prompt");
    });

    it("setOption toggles individual engine options", () => {
      useArenaStore.getState().setOption("engine", "blind-jury");
      expect(useArenaStore.getState().options.engine).toBe("blind-jury");
      useArenaStore.getState().setOption("randomizeOrder", false);
      expect(useArenaStore.getState().options.randomizeOrder).toBe(false);
      useArenaStore.getState().setOption("judgeModelId", "foo:bar");
      expect(useArenaStore.getState().options.judgeModelId).toBe("foo:bar");
    });
  });

  describe("consensus lifecycle", () => {
    it("startConsensus returns AbortController and resets state", () => {
      useArenaStore.getState().setPrompt("test");
      const controller = useArenaStore.getState().startConsensus();
      expect(controller).toBeInstanceOf(AbortController);

      const s = useArenaStore.getState();
      expect(s.isRunning).toBe(true);
      expect(s.currentRound).toBe(0);
      expect(s.rounds).toEqual([]);
      expect(s.activeStreams).toEqual({});
      expect(s.finalScore).toBeNull();
      expect(s.progress).toBe(0);
      expect(s.tokenTotal.totalTokens).toBe(0);
      expect(s.disagreements).toEqual([]);
    });

    it("cancelConsensus aborts and sets isRunning false", () => {
      const controller = useArenaStore.getState().startConsensus();
      useArenaStore.getState().cancelConsensus();
      expect(useArenaStore.getState().isRunning).toBe(false);
      expect(controller.signal.aborted).toBe(true);
    });

    it("startRound creates a new round entry", () => {
      useArenaStore.getState().startConsensus();
      useArenaStore.getState().startRound(1, "initial-analysis", "Initial Analysis");
      const s = useArenaStore.getState();
      expect(s.currentRound).toBe(1);
      expect(s.rounds).toHaveLength(1);
      expect(s.rounds[0].type).toBe("initial-analysis");
      expect(s.rounds[0].label).toBe("Initial Analysis");
    });

    it("appendToken accumulates streaming content", () => {
      useArenaStore.getState().appendToken("p-1", 1, "Hello");
      useArenaStore.getState().appendToken("p-1", 1, " World");
      expect(useArenaStore.getState().activeStreams["p-1"]).toBe("Hello World");
    });

    it("completeParticipantRound adds response and clears stream", () => {
      useArenaStore.getState().startConsensus();
      useArenaStore.getState().startRound(1, "initial-analysis", "Analysis");
      useArenaStore.getState().appendToken("p-1", 1, "streaming");
      useArenaStore
        .getState()
        .completeParticipantRound("p-1", 1, 75, "Full response\nCONFIDENCE: 75", {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          estimatedCostUSD: 0.001,
        });

      const s = useArenaStore.getState();
      expect(s.activeStreams["p-1"]).toBe("");
      expect(s.rounds[0].responses).toHaveLength(1);
      expect(s.rounds[0].responses[0].confidence).toBe(75);
      expect(s.tokenTotal.totalTokens).toBe(150);
      expect(s.usageByParticipant["p-1"].totalTokens).toBe(150);
    });

    it("endRound sets consensus score and updates progress", () => {
      useArenaStore.getState().setOption("rounds", 5);
      useArenaStore.getState().startConsensus();
      useArenaStore.getState().startRound(1, "initial-analysis", "Analysis");
      useArenaStore.getState().endRound(1, 82);

      const s = useArenaStore.getState();
      expect(s.rounds[0].consensusScore).toBe(82);
      expect(s.progress).toBe(1 / 5);
    });

    it("completeConsensus finalizes state", () => {
      useArenaStore.getState().startConsensus();
      useArenaStore.getState().completeConsensus(88, "Good consensus", 5);

      const s = useArenaStore.getState();
      expect(s.isRunning).toBe(false);
      expect(s.finalScore).toBe(88);
      expect(s.finalSummary).toBe("Good consensus");
      expect(s.progress).toBe(1);
      expect(s.roundsCompleted).toBe(5);
    });

    it("reset clears all execution state", () => {
      useArenaStore.getState().startConsensus();
      useArenaStore.getState().startRound(1, "initial-analysis", "A");
      useArenaStore.getState().reset();

      const s = useArenaStore.getState();
      expect(s.isRunning).toBe(false);
      expect(s.rounds).toEqual([]);
      expect(s.progress).toBe(0);
      expect(s.finalScore).toBeNull();
      expect(s.disagreements).toEqual([]);
      expect(s.judge).toBeNull();
    });
  });

  describe("disagreements, judge, early stop", () => {
    it("addDisagreements appends items", () => {
      useArenaStore.getState().addDisagreements(1, [
        {
          id: "r1-a-b",
          round: 1,
          participantAId: "a",
          participantBId: "b",
          severity: 30,
          label: "x",
        },
      ]);
      expect(useArenaStore.getState().disagreements).toHaveLength(1);
    });

    it("startJudge seeds a judge record with empty content", () => {
      useArenaStore.getState().startJudge("openai:gpt-4o", "OpenAI");
      const s = useArenaStore.getState();
      expect(s.judgeRunning).toBe(true);
      expect(s.judge?.modelId).toBe("openai:gpt-4o");
      expect(s.judge?.providerName).toBe("OpenAI");
    });

    it("appendJudgeToken accumulates streamed judge content", () => {
      useArenaStore.getState().startJudge("x", "X");
      useArenaStore.getState().appendJudgeToken("Hello ");
      useArenaStore.getState().appendJudgeToken("world");
      expect(useArenaStore.getState().judgeStream).toBe("Hello world");
    });

    it("completeJudge stores the final result and adds its usage to the total", () => {
      useArenaStore.getState().startJudge("x", "X");
      useArenaStore.getState().completeJudge({
        modelId: "x",
        providerName: "X",
        content: "final",
        majorityPosition: "A",
        minorityPositions: "B",
        unresolvedDisputes: "",
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, estimatedCostUSD: 0.0001 },
      });
      const s = useArenaStore.getState();
      expect(s.judgeRunning).toBe(false);
      expect(s.judge?.content).toBe("final");
      expect(s.tokenTotal.totalTokens).toBe(30);
    });

    it("setEarlyStopped records the info", () => {
      useArenaStore.getState().setEarlyStopped({ round: 3, delta: 1, reason: "stable" });
      expect(useArenaStore.getState().earlyStopped?.round).toBe(3);
    });
  });

  describe("sweep mode", () => {
    it("startSweep initialises sweep state with engines", () => {
      useArenaStore.getState().startSweep(["cvp", "blind-jury", "adversarial"]);
      const s = useArenaStore.getState();
      expect(s.sweepActive).toBe(true);
      expect(s.sweepEngines).toEqual(["cvp", "blind-jury", "adversarial"]);
      expect(s.sweepCurrentIndex).toBe(0);
      expect(s.sweepResults).toEqual([]);
    });

    it("setSweepCurrentIndex tracks progress through the sweep", () => {
      useArenaStore.getState().startSweep(["cvp", "blind-jury"]);
      useArenaStore.getState().setSweepCurrentIndex(1);
      expect(useArenaStore.getState().sweepCurrentIndex).toBe(1);
    });

    it("pushSweepResult accumulates snapshots", () => {
      useArenaStore.getState().startSweep(["cvp", "blind-jury"]);
      useArenaStore.getState().setPrompt("p");
      const snap1 = useArenaStore.getState().getSnapshot();
      useArenaStore.getState().pushSweepResult(snap1);
      useArenaStore.getState().pushSweepResult({ ...snap1, finalScore: 90 });
      const s = useArenaStore.getState();
      expect(s.sweepResults).toHaveLength(2);
      expect(s.sweepResults[1].finalScore).toBe(90);
    });

    it("clearSweep resets sweep state without touching participants/prompt", () => {
      useArenaStore.getState().setPrompt("kept");
      useArenaStore.getState().addParticipant(mockModel, persona);
      useArenaStore.getState().startSweep(["cvp"]);
      const snap = useArenaStore.getState().getSnapshot();
      useArenaStore.getState().pushSweepResult(snap);
      useArenaStore.getState().clearSweep();
      const s = useArenaStore.getState();
      expect(s.sweepActive).toBe(false);
      expect(s.sweepEngines).toEqual([]);
      expect(s.sweepResults).toEqual([]);
      expect(s.prompt).toBe("kept");
      expect(s.participants).toHaveLength(1);
    });

    it("reset() does NOT clear sweep state — sweep survives between engines", () => {
      useArenaStore.getState().startSweep(["cvp", "blind-jury"]);
      useArenaStore.getState().setSweepCurrentIndex(1);
      useArenaStore.getState().reset();
      const s = useArenaStore.getState();
      expect(s.sweepActive).toBe(true);
      expect(s.sweepCurrentIndex).toBe(1);
    });

    it("cancelSweep tears down sweep state but preserves completed sweepResults", () => {
      useArenaStore.getState().startSweep(["cvp", "blind-jury", "adversarial"]);
      useArenaStore.getState().setPrompt("p");
      const snap = useArenaStore.getState().getSnapshot();
      useArenaStore.getState().pushSweepResult(snap);
      useArenaStore.getState().cancelSweep();
      const s = useArenaStore.getState();
      expect(s.sweepActive).toBe(false);
      expect(s.sweepEngines).toEqual([]);
      expect(s.isRunning).toBe(false);
      // Already-completed engines remain visible for the user.
      expect(s.sweepResults).toHaveLength(1);
    });
  });

  describe("snapshot load / getSnapshot", () => {
    it("getSnapshot returns current state shape", () => {
      useArenaStore.getState().setPrompt("hello");
      const snap = useArenaStore.getState().getSnapshot();
      expect(snap.v).toBe(1);
      expect(snap.prompt).toBe("hello");
    });

    it("loadSnapshot reconstructs usageByParticipant from round responses", () => {
      const u = (cost: number) => ({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        estimatedCostUSD: cost,
      });
      const snap: SessionSnapshot = {
        v: 1,
        prompt: "x",
        engine: "cvp",
        options: { ...DEFAULT_OPTIONS, rounds: 2 },
        participants: [
          { id: "p-a", modelInfo: mockModel, persona },
          { id: "p-b", modelInfo: mockModel2, persona: persona2 },
        ],
        rounds: [
          {
            number: 1,
            type: "initial-analysis",
            label: "R1",
            consensusScore: 70,
            responses: [
              {
                participantId: "p-a",
                roundNumber: 1,
                content: "",
                confidence: 70,
                timestamp: 0,
                usage: u(0.01),
              },
              {
                participantId: "p-b",
                roundNumber: 1,
                content: "",
                confidence: 80,
                timestamp: 0,
                usage: u(0.02),
              },
            ],
          },
          {
            number: 2,
            type: "synthesis",
            label: "R2",
            consensusScore: 75,
            responses: [
              {
                participantId: "p-a",
                roundNumber: 2,
                content: "",
                confidence: 75,
                timestamp: 0,
                usage: u(0.03),
              },
              {
                participantId: "p-b",
                roundNumber: 2,
                content: "",
                confidence: 80,
                timestamp: 0,
                usage: u(0.04),
              },
            ],
          },
        ],
        finalScore: 75,
        finalSummary: "done",
        judge: null,
        disagreements: [],
        tokenTotal: {
          inputTokens: 400,
          outputTokens: 200,
          totalTokens: 600,
          estimatedCostUSD: 0.1,
        },
        createdAt: Date.now(),
      };
      useArenaStore.getState().loadSnapshot(snap);
      const s = useArenaStore.getState();
      // p-a totals: 0.01 + 0.03 = 0.04
      expect(s.usageByParticipant["p-a"].estimatedCostUSD).toBeCloseTo(0.04, 5);
      // p-b totals: 0.02 + 0.04 = 0.06
      expect(s.usageByParticipant["p-b"].estimatedCostUSD).toBeCloseTo(0.06, 5);
      expect(s.usageByParticipant["p-a"].totalTokens).toBe(300); // 150 + 150
    });

    it("loadSnapshot rehydrates and sets sharedView", () => {
      const snap: SessionSnapshot = {
        v: 1,
        prompt: "shared prompt",
        engine: "cvp",
        options: { ...DEFAULT_OPTIONS, rounds: 3 },
        participants: [{ id: "p-1", modelInfo: mockModel, persona }],
        rounds: [
          { number: 1, type: "initial-analysis", label: "A", responses: [], consensusScore: 75 },
        ],
        finalScore: 75,
        finalSummary: "done",
        judge: null,
        disagreements: [],
        tokenTotal: null,
        createdAt: Date.now(),
      };
      useArenaStore.getState().loadSnapshot(snap);
      const s = useArenaStore.getState();
      expect(s.prompt).toBe("shared prompt");
      expect(s.sharedView).toBe(true);
      expect(s.finalScore).toBe(75);
      expect(s.rounds).toHaveLength(1);
    });
  });
});
