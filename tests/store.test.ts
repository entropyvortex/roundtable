import { describe, it, expect, beforeEach } from "vitest";
import { useArenaStore } from "@/lib/store";
import { PERSONAS } from "@/lib/personas";
import type { ModelInfo } from "@/lib/types";

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
      roundCount: 5,
      prompt: "",
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
      expect(useArenaStore.getState().roundCount).toBe(7);

      useArenaStore.getState().setRoundCount(0);
      expect(useArenaStore.getState().roundCount).toBe(1);

      useArenaStore.getState().setRoundCount(15);
      expect(useArenaStore.getState().roundCount).toBe(10);
    });

    it("sets prompt", () => {
      useArenaStore.getState().setPrompt("test prompt");
      expect(useArenaStore.getState().prompt).toBe("test prompt");
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
        .completeParticipantRound("p-1", 1, 75, "Full response\nCONFIDENCE: 75");

      const s = useArenaStore.getState();
      expect(s.activeStreams["p-1"]).toBe("");
      expect(s.rounds[0].responses).toHaveLength(1);
      expect(s.rounds[0].responses[0].confidence).toBe(75);
    });

    it("endRound sets consensus score and updates progress", () => {
      useArenaStore.getState().startConsensus();
      useArenaStore.getState().startRound(1, "initial-analysis", "Analysis");
      useArenaStore.getState().endRound(1, 82);

      const s = useArenaStore.getState();
      expect(s.rounds[0].consensusScore).toBe(82);
      expect(s.progress).toBe(1 / 5); // round 1 of 5
    });

    it("completeConsensus finalizes state", () => {
      useArenaStore.getState().startConsensus();
      useArenaStore.getState().completeConsensus(88, "Good consensus");

      const s = useArenaStore.getState();
      expect(s.isRunning).toBe(false);
      expect(s.finalScore).toBe(88);
      expect(s.finalSummary).toBe("Good consensus");
      expect(s.progress).toBe(1);
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
    });
  });
});
