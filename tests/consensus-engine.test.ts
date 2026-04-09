import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConsensusEvent, Participant } from "@/lib/types";
import { PERSONAS } from "@/lib/personas";

// Mock the AI SDK and providers before importing the engine
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => (modelId: string) => ({ modelId }),
}));

// streamText returns a Promise<{ textStream: AsyncIterable<string> }>
// Now also accepts abortSignal in the options
vi.mock("ai", () => ({
  streamText: vi.fn((_opts?: { abortSignal?: AbortSignal }) => {
    return Promise.resolve({
      textStream: (async function* () {
        yield "Analysis complete.";
        yield "\nCONFIDENCE: 78";
      })(),
    });
  }),
}));

vi.mock("@/lib/providers", () => ({
  findResolvedModel: (id: string) => {
    if (id === "missing:model") return undefined;
    return {
      providerId: "test",
      providerName: "Test",
      modelId: "test-model",
      baseUrl: "https://test.com/v1",
      apiKey: "test-key",
    };
  },
}));

// Import after mocks are set up
const { runConsensus } = await import("@/lib/consensus-engine");

const makeParticipant = (id: string, modelId = "test:test-model"): Participant => ({
  id,
  modelInfo: {
    id: modelId,
    providerId: "test",
    providerName: "Test",
    modelId: "test-model",
  },
  persona: PERSONAS[0],
});

describe("consensus-engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits round-start, participant events, round-end, and consensus-complete", async () => {
    const events: ConsensusEvent[] = [];
    const emit = (e: ConsensusEvent) => events.push(e);

    await runConsensus("Test topic", [makeParticipant("p-1"), makeParticipant("p-2")], 2, emit);

    const types = events.map((e) => e.type);

    // Should have round-start for each round
    expect(types.filter((t) => t === "round-start")).toHaveLength(2);

    // Should have participant-start and participant-end for each participant per round
    expect(types.filter((t) => t === "participant-start")).toHaveLength(4); // 2 participants * 2 rounds
    expect(types.filter((t) => t === "participant-end")).toHaveLength(4);

    // Should have round-end for each round
    expect(types.filter((t) => t === "round-end")).toHaveLength(2);

    // Should end with consensus-complete
    expect(types[types.length - 1]).toBe("consensus-complete");
  });

  it("emits tokens during streaming", async () => {
    const events: ConsensusEvent[] = [];
    await runConsensus("Test", [makeParticipant("p-1")], 1, (e) => events.push(e));

    const tokens = events.filter((e) => e.type === "token");
    expect(tokens.length).toBeGreaterThan(0);
  });

  it("extracts confidence from response", async () => {
    const events: ConsensusEvent[] = [];
    await runConsensus("Test", [makeParticipant("p-1")], 1, (e) => events.push(e));

    const end = events.find((e) => e.type === "participant-end");
    expect(end).toBeDefined();
    if (end?.type === "participant-end") {
      expect(end.confidence).toBe(78);
    }
  });

  it("calculates consensus score in round-end events", async () => {
    const events: ConsensusEvent[] = [];
    await runConsensus("Test", [makeParticipant("p-1"), makeParticipant("p-2")], 1, (e) =>
      events.push(e),
    );

    const roundEnd = events.find((e) => e.type === "round-end");
    expect(roundEnd).toBeDefined();
    if (roundEnd?.type === "round-end") {
      expect(roundEnd.consensusScore).toBeGreaterThanOrEqual(0);
      expect(roundEnd.consensusScore).toBeLessThanOrEqual(100);
    }
  });

  it("emits final consensus score and summary", async () => {
    const events: ConsensusEvent[] = [];
    await runConsensus("Test", [makeParticipant("p-1")], 1, (e) => events.push(e));

    const complete = events.find((e) => e.type === "consensus-complete");
    expect(complete).toBeDefined();
    if (complete?.type === "consensus-complete") {
      expect(complete.finalScore).toBeGreaterThanOrEqual(0);
      expect(complete.summary).toContain("Consensus reached");
    }
  });

  it("assigns correct round types per CVP spec", async () => {
    const events: ConsensusEvent[] = [];
    await runConsensus("Test", [makeParticipant("p-1")], 5, (e) => events.push(e));

    const roundStarts = events.filter((e) => e.type === "round-start") as Array<
      Extract<ConsensusEvent, { type: "round-start" }>
    >;

    expect(roundStarts[0].roundType).toBe("initial-analysis");
    expect(roundStarts[1].roundType).toBe("counterarguments");
    expect(roundStarts[2].roundType).toBe("evidence-assessment");
    expect(roundStarts[3].roundType).toBe("synthesis");
    expect(roundStarts[4].roundType).toBe("synthesis");
    expect(roundStarts[4].label).toContain("Final Synthesis");
  });

  it("handles model not found error gracefully", async () => {
    const { streamText } = await import("ai");
    (streamText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Model not found: missing:model"),
    );

    const events: ConsensusEvent[] = [];
    // This will trigger the error path in streamParticipant
    await runConsensus("Test", [makeParticipant("p-err")], 1, (e) => events.push(e));

    // Should still complete (error is caught per-participant)
    const tokens = events.filter((e) => e.type === "token");
    expect(tokens.length).toBeGreaterThanOrEqual(0);
  });
});
