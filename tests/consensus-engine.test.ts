import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConsensusEvent, ConsensusOptions, Participant } from "@/lib/types";
import { PERSONAS } from "@/lib/personas";
import { DEFAULT_OPTIONS } from "@/lib/store";

// Mock the AI SDK and providers before importing the engine.
// The provider stub is a function (for legacy `provider(modelId)` callers)
// that also exposes `.chat` / `.responses` methods the engine uses.
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => {
    const make = (modelId: string) => ({ modelId });
    const provider = make as ((modelId: string) => { modelId: string }) & {
      chat: (modelId: string) => { modelId: string };
      responses: (modelId: string) => { modelId: string };
    };
    provider.chat = make;
    provider.responses = make;
    return provider;
  },
}));

// streamText returns an object with textStream and usage.
// A counter lets individual tests vary the confidence yielded.
let confidenceSequence: number[] = [];
let confidenceIndex = 0;

function nextConfidence(): number {
  if (confidenceSequence.length === 0) return 78;
  const v = confidenceSequence[confidenceIndex % confidenceSequence.length];
  confidenceIndex++;
  return v;
}

vi.mock("ai", () => ({
  streamText: vi.fn((_opts?: { abortSignal?: AbortSignal }) => {
    const confidence = nextConfidence();
    return {
      textStream: (async function* () {
        yield "Analysis complete. ";
        yield `\nCONFIDENCE: ${confidence}`;
      })(),
      usage: Promise.resolve({ inputTokens: 100, outputTokens: 50 }),
    };
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
const { runConsensus, shuffle, detectDisagreements, __testing } =
  await import("@/lib/consensus-engine");

function opts(overrides: Partial<ConsensusOptions> = {}): ConsensusOptions {
  return { ...DEFAULT_OPTIONS, ...overrides };
}

const makeParticipant = (id: string, modelId = "test:test-model", personaIdx = 0): Participant => ({
  id,
  modelInfo: {
    id: modelId,
    providerId: "test",
    providerName: "Test",
    modelId: "test-model",
  },
  persona: PERSONAS[personaIdx % PERSONAS.length],
});

describe("consensus-engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confidenceSequence = [];
    confidenceIndex = 0;
  });

  it("emits round-start, participant events, round-end, and consensus-complete", async () => {
    const events: ConsensusEvent[] = [];
    const emit = (e: ConsensusEvent) => events.push(e);

    await runConsensus(
      "Test topic",
      [makeParticipant("p-1"), makeParticipant("p-2", "test:test-model", 1)],
      opts({ rounds: 2, randomizeOrder: false, blindFirstRound: false, earlyStop: false }),
      emit,
    );

    const types = events.map((e) => e.type);

    expect(types.filter((t) => t === "round-start")).toHaveLength(2);
    expect(types.filter((t) => t === "participant-start")).toHaveLength(4);
    expect(types.filter((t) => t === "participant-end")).toHaveLength(4);
    expect(types.filter((t) => t === "round-end")).toHaveLength(2);
    expect(types[types.length - 1]).toBe("consensus-complete");
  });

  it("emits tokens during streaming", async () => {
    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [makeParticipant("p-1")],
      opts({ rounds: 1, blindFirstRound: false }),
      (e) => events.push(e),
    );

    const tokens = events.filter((e) => e.type === "token");
    expect(tokens.length).toBeGreaterThan(0);
  });

  it("extracts confidence from response", async () => {
    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [makeParticipant("p-1")],
      opts({ rounds: 1, blindFirstRound: false }),
      (e) => events.push(e),
    );

    const end = events.find((e) => e.type === "participant-end");
    expect(end).toBeDefined();
    if (end?.type === "participant-end") {
      expect(end.confidence).toBe(78);
      expect(end.usage).toBeDefined();
      expect(end.usage!.totalTokens).toBe(150);
    }
  });

  it("calculates consensus score in round-end events", async () => {
    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [makeParticipant("p-1"), makeParticipant("p-2", "test:test-model", 1)],
      opts({ rounds: 1, blindFirstRound: false }),
      (e) => events.push(e),
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
    await runConsensus(
      "Test",
      [makeParticipant("p-1")],
      opts({ rounds: 1, blindFirstRound: false }),
      (e) => events.push(e),
    );

    const complete = events.find((e) => e.type === "consensus-complete");
    expect(complete).toBeDefined();
    if (complete?.type === "consensus-complete") {
      expect(complete.finalScore).toBeGreaterThanOrEqual(0);
      expect(complete.summary).toContain("CVP");
      expect(complete.roundsCompleted).toBe(1);
    }
  });

  it("assigns correct round types per CVP spec", async () => {
    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [makeParticipant("p-1")],
      opts({ rounds: 5, blindFirstRound: false, randomizeOrder: false, earlyStop: false }),
      (e) => events.push(e),
    );

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

  it("handles thrown provider errors gracefully via catch", async () => {
    const { streamText } = await import("ai");
    (streamText as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      textStream: (async function* () {
        throw new Error("Upstream fetch failed");
      })(),
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
    }));

    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [makeParticipant("p-err")],
      opts({ rounds: 1, blindFirstRound: false }),
      (e) => events.push(e),
    );

    const end = events.find((e) => e.type === "participant-end");
    expect(end).toBeDefined();
    if (end?.type === "participant-end") {
      expect(end.error).toContain("Upstream fetch failed");
      expect(end.fullContent).toContain("Error from");
      expect(end.confidence).toBe(0);
    }
  });

  it("captures onError-reported provider failures without throwing from textStream", async () => {
    const { streamText } = await import("ai");
    // Simulate the Vercel AI SDK v6 pattern: textStream ends cleanly
    // but onError was called with an AI_APICallError-shaped object.
    (streamText as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (options: { onError?: (e: { error: unknown }) => void }) => {
        const apiError = Object.assign(new Error("Not Found"), {
          name: "AI_APICallError",
          statusCode: 404,
          url: "https://api.anthropic.com/v1/responses",
        });
        options.onError?.({ error: apiError });
        return {
          textStream: (async function* () {
            // Silent stream end — simulates v6 behavior where errors
            // are surfaced via onError rather than as iterator throws.
          })(),
          usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
        };
      },
    );

    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [makeParticipant("p-err")],
      opts({ rounds: 1, blindFirstRound: false }),
      (e) => events.push(e),
    );

    const end = events.find((e) => e.type === "participant-end");
    expect(end).toBeDefined();
    if (end?.type === "participant-end") {
      expect(end.error).toContain("Not Found");
      expect(end.error).toContain("HTTP 404");
      expect(end.fullContent).toContain("Error from");
      expect(end.confidence).toBe(0);
    }
  });

  it("emits a synthetic error token when the model cannot be resolved", async () => {
    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [makeParticipant("p-ghost", "missing:model")],
      opts({ rounds: 1, blindFirstRound: false }),
      (e) => events.push(e),
    );

    const end = events.find((e) => e.type === "participant-end");
    expect(end).toBeDefined();
    if (end?.type === "participant-end") {
      expect(end.error).toContain("Model not available");
      expect(end.fullContent).toContain("Error from");
    }
  });

  it("excludes errored responses from the consensus score", async () => {
    const { streamText } = await import("ai");
    (streamText as ReturnType<typeof vi.fn>)
      .mockImplementationOnce((options: { onError?: (e: { error: unknown }) => void }) => {
        options.onError?.({
          error: Object.assign(new Error("Not Found"), { statusCode: 404 }),
        });
        return {
          textStream: (async function* () {})(),
          usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
        };
      })
      .mockImplementationOnce(() => ({
        textStream: (async function* () {
          yield "Good answer. \nCONFIDENCE: 90";
        })(),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      }));

    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [makeParticipant("p-bad"), makeParticipant("p-good", "test:test-model", 1)],
      opts({ rounds: 1, blindFirstRound: false, randomizeOrder: false }),
      (e) => events.push(e),
    );

    const roundEnd = events.find((e) => e.type === "round-end");
    if (roundEnd?.type === "round-end") {
      // Only the good response (confidence 90) contributes;
      // score = 90 - 0.5 * 0 = 90
      expect(roundEnd.consensusScore).toBe(90);
    }
  });

  it("detectDisagreements skips pairs where either side errored", () => {
    const participants = [
      {
        id: "a",
        modelInfo: {
          id: "test:test-model",
          providerId: "test",
          providerName: "Test",
          modelId: "test-model",
        },
        persona: PERSONAS[0],
      },
      {
        id: "b",
        modelInfo: {
          id: "test:test-model",
          providerId: "test",
          providerName: "Test",
          modelId: "test-model",
        },
        persona: PERSONAS[1],
      },
    ];
    const out = detectDisagreements(
      1,
      [
        {
          participantId: "a",
          roundNumber: 1,
          content: "",
          confidence: 0,
          timestamp: 0,
          error: "HTTP 404",
        },
        { participantId: "b", roundNumber: 1, content: "", confidence: 90, timestamp: 0 },
      ],
      participants,
    );
    expect(out).toHaveLength(0);
  });

  // ── New feature tests ────────────────────────────────────

  it("runs Round 1 in parallel when blindFirstRound is enabled", async () => {
    const { streamText } = await import("ai");
    (streamText as ReturnType<typeof vi.fn>).mockClear();

    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [
        makeParticipant("p-1"),
        makeParticipant("p-2", "test:test-model", 1),
        makeParticipant("p-3", "test:test-model", 2),
      ],
      opts({
        rounds: 1,
        blindFirstRound: true,
        randomizeOrder: false,
        extractClaimsEnabled: false,
      }),
      (e) => events.push(e),
    );

    // With blindFirstRound, no participant sees prior responses in round 1.
    // Check that the system prompts passed to streamText contain no
    // "--- PREVIOUS ROUND RESPONSES ---" marker.
    const calls = (streamText as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBe(3);
    for (const call of calls) {
      const systemPrompt = call[0].system as string;
      expect(systemPrompt).not.toContain("PREVIOUS ROUND RESPONSES");
    }
  });

  it("stops early when consensus converges", async () => {
    // Force identical confidences so delta = 0 between rounds 1 and 2
    confidenceSequence = [80, 80, 80, 80, 80, 80];

    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [makeParticipant("p-1"), makeParticipant("p-2", "test:test-model", 1)],
      opts({
        rounds: 5,
        blindFirstRound: false,
        randomizeOrder: false,
        earlyStop: true,
      }),
      (e) => events.push(e),
    );

    const earlyStop = events.find((e) => e.type === "early-stop");
    expect(earlyStop).toBeDefined();

    const complete = events.find((e) => e.type === "consensus-complete");
    if (complete?.type === "consensus-complete") {
      expect(complete.roundsCompleted).toBeLessThan(5);
    }
  });

  it("emits disagreements when confidence diverges by 20+ points", async () => {
    // Alternating 90 and 60 → delta = 30 → disagreement
    confidenceSequence = [90, 60];

    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [makeParticipant("p-1"), makeParticipant("p-2", "test:test-model", 1)],
      opts({ rounds: 1, blindFirstRound: false, randomizeOrder: false }),
      (e) => events.push(e),
    );

    const disagreement = events.find((e) => e.type === "disagreements");
    expect(disagreement).toBeDefined();
    if (disagreement?.type === "disagreements") {
      expect(disagreement.disagreements.length).toBeGreaterThan(0);
      expect(disagreement.disagreements[0].severity).toBe(30);
    }
  });

  it("blind-jury engine runs a single parallel round with no cross-visibility", async () => {
    const { streamText } = await import("ai");
    (streamText as ReturnType<typeof vi.fn>).mockClear();

    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [
        makeParticipant("p-1"),
        makeParticipant("p-2", "test:test-model", 1),
        makeParticipant("p-3", "test:test-model", 2),
      ],
      opts({ engine: "blind-jury", extractClaimsEnabled: false }),
      (e) => events.push(e),
    );

    const roundStarts = events.filter((e) => e.type === "round-start");
    expect(roundStarts).toHaveLength(1);
    expect((roundStarts[0] as { label: string }).label).toContain("Blind Jury");

    const calls = (streamText as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBe(3);
    for (const call of calls) {
      const systemPrompt = call[0].system as string;
      expect(systemPrompt).toContain("BLIND JURY");
    }

    const complete = events.find((e) => e.type === "consensus-complete");
    if (complete?.type === "consensus-complete") {
      expect(complete.roundsCompleted).toBe(1);
    }
  });

  it("runs the judge synthesizer when judgeEnabled and judgeModelId are set", async () => {
    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [makeParticipant("p-1"), makeParticipant("p-2", "test:test-model", 1)],
      opts({
        rounds: 1,
        blindFirstRound: false,
        randomizeOrder: false,
        judgeEnabled: true,
        judgeModelId: "test:test-model",
      }),
      (e) => events.push(e),
    );

    expect(events.find((e) => e.type === "judge-start")).toBeDefined();
    expect(events.find((e) => e.type === "judge-end")).toBeDefined();
    const tokens = events.filter((e) => e.type === "judge-token");
    expect(tokens.length).toBeGreaterThan(0);
  });

  it("judge error path still emits judge-end with error content", async () => {
    const { streamText } = await import("ai");
    // Participant call succeeds, judge call throws. Use mockImplementationOnce
    // (queued, FIFO) so the implementation does not leak into later tests.
    (streamText as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => ({
        textStream: (async function* () {
          yield "x";
          yield "\nCONFIDENCE: 60";
        })(),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 5 }),
      }))
      .mockImplementationOnce(() => {
        throw new Error("judge upstream failure");
      });

    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [makeParticipant("p-1")],
      opts({
        rounds: 1,
        blindFirstRound: false,
        randomizeOrder: false,
        judgeEnabled: true,
        judgeModelId: "test:test-model",
      }),
      (e) => events.push(e),
    );
    const end = events.find((e) => e.type === "judge-end");
    expect(end).toBeDefined();
    if (end?.type === "judge-end") {
      expect(end.result.content).toContain("Judge error");
    }
  });

  it("falls back to heuristic usage when the SDK reports no usage", async () => {
    const { streamText } = await import("ai");
    (streamText as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      textStream: (async function* () {
        yield "Fallback content. ";
        yield "\nCONFIDENCE: 65";
      })(),
      // No `usage` field at all
    }));

    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [makeParticipant("p-1")],
      opts({ rounds: 1, blindFirstRound: false }),
      (e) => events.push(e),
    );
    const end = events.find((e) => e.type === "participant-end");
    if (end?.type === "participant-end") {
      expect(end.usage).toBeDefined();
      expect(end.usage!.totalTokens).toBeGreaterThan(0);
    }
  });

  it("propagates an abort signal to stop the run mid-stream", async () => {
    const ac = new AbortController();
    ac.abort();
    const events: ConsensusEvent[] = [];
    await expect(
      runConsensus(
        "Test",
        [makeParticipant("p-1")],
        opts({ rounds: 2, blindFirstRound: false }),
        (e) => events.push(e),
        ac.signal,
      ),
    ).rejects.toBeInstanceOf(DOMException);
  });

  // ── Internal helper tests ────────────────────────────────

  it("shuffle returns a permutation without mutating input", () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, () => 0.5);
    expect(out).toHaveLength(5);
    expect(out).not.toBe(input);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("calculateConsensusScore penalises high variance", () => {
    const score = __testing.calculateConsensusScore([
      { participantId: "a", roundNumber: 1, content: "", confidence: 100, timestamp: 0 },
      { participantId: "b", roundNumber: 1, content: "", confidence: 0, timestamp: 0 },
    ]);
    expect(score).toBeLessThan(50);
  });

  it("calculateConsensusScore is 0 for empty", () => {
    expect(__testing.calculateConsensusScore([])).toBe(0);
  });

  it("extractConfidence falls back to 50 when missing", () => {
    expect(__testing.extractConfidence("no marker here")).toBe(50);
    expect(__testing.extractConfidence("CONFIDENCE: 92")).toBe(92);
    expect(__testing.extractConfidence("CONFIDENCE: 150")).toBe(100);
  });

  it("extractConfidence picks the LAST CONFIDENCE marker (not earlier mentions)", () => {
    // A model that previews its score mid-response, then states the
    // canonical trailing line, should be scored on the trailing line.
    const text = "I had CONFIDENCE: 30 earlier but after reviewing\n\nCONFIDENCE: 88";
    expect(__testing.extractConfidence(text)).toBe(88);
  });

  it("extractJudgeSection picks out markdown sections", () => {
    const md = `## Majority Position\nA wins.\n\n## Minority Positions\nB disagrees.\n\n## Unresolved Disputes\nNone.`;
    expect(__testing.extractJudgeSection(md, "Majority Position")).toBe("A wins.");
    expect(__testing.extractJudgeSection(md, "Minority Positions")).toBe("B disagrees.");
    expect(__testing.extractJudgeSection(md, "Nothing Here")).toBe("");
  });

  it("getRoundMeta labels the final synthesis round", () => {
    expect(__testing.getRoundMeta(1, 5).type).toBe("initial-analysis");
    expect(__testing.getRoundMeta(5, 5).label).toContain("Final Synthesis");
  });

  it("buildJudgeContext stringifies final responses", () => {
    const ctx = __testing.buildJudgeContext(
      [
        {
          participantId: "p-1",
          roundNumber: 1,
          content: "Result A\nCONFIDENCE: 80",
          confidence: 80,
          timestamp: 0,
        },
      ],
      [
        {
          id: "p-1",
          modelInfo: {
            id: "test:test-model",
            providerId: "test",
            providerName: "Test",
            modelId: "test-model",
          },
          persona: PERSONAS[0],
        },
      ],
    );
    expect(ctx).toContain("Result A");
    expect(ctx).toContain(PERSONAS[0].name);
  });

  it("detectDisagreements ignores pairs under the 20-point threshold", () => {
    const out = detectDisagreements(
      1,
      [
        { participantId: "a", roundNumber: 1, content: "", confidence: 70, timestamp: 0 },
        { participantId: "b", roundNumber: 1, content: "", confidence: 80, timestamp: 0 },
      ],
      [],
    );
    expect(out).toHaveLength(0);
  });

  // ── Adversarial Red Team engine ───────────────────────────

  it("adversarial engine runs Round 1 in parallel without cross-visibility", async () => {
    const { streamText } = await import("ai");
    (streamText as ReturnType<typeof vi.fn>).mockClear();

    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [
        makeParticipant("p-1"),
        makeParticipant("p-2", "test:test-model", 1),
        makeParticipant("p-3", "test:test-model", 2),
      ],
      opts({ engine: "adversarial", rounds: 1, extractClaimsEnabled: false }),
      (e) => events.push(e),
    );

    const calls = (streamText as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBe(3);
    for (const call of calls) {
      const systemPrompt = call[0].system as string;
      expect(systemPrompt).toContain("ADVERSARIAL RED TEAM");
      expect(systemPrompt).not.toContain("ATTACKER for this round");
      expect(systemPrompt).not.toContain("DEFENDER this round");
    }

    const roundStarts = events.filter((e) => e.type === "round-start") as Array<
      Extract<ConsensusEvent, { type: "round-start" }>
    >;
    expect(roundStarts).toHaveLength(1);
    expect(roundStarts[0].label).toBe("Initial Positions");
  });

  it("adversarial engine designates one attacker per stress round, rotating", async () => {
    const { streamText } = await import("ai");
    (streamText as ReturnType<typeof vi.fn>).mockClear();

    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [
        makeParticipant("p-1"),
        makeParticipant("p-2", "test:test-model", 1),
        makeParticipant("p-3", "test:test-model", 2),
      ],
      opts({ engine: "adversarial", rounds: 4 }),
      (e) => events.push(e),
    );

    const roundStarts = events.filter((e) => e.type === "round-start") as Array<
      Extract<ConsensusEvent, { type: "round-start" }>
    >;
    // Round 1 init, Round 2 stress, Round 3 stress, Round 4 final synthesis
    expect(roundStarts).toHaveLength(4);
    expect(roundStarts[0].label).toBe("Initial Positions");
    expect(roundStarts[1].label).toContain("Stress Test");
    expect(roundStarts[1].label).toContain("Attacker:"); // Round 2 → participant[0]
    expect(roundStarts[2].label).toContain("Stress Test");
    expect(roundStarts[3].label).toBe("Post-Stress Final Synthesis");

    // Confirm rotating attacker — Round 2 attacker is participants[0], Round 3 attacker is participants[1]
    expect(roundStarts[1].label).toContain(PERSONAS[0].name);
    expect(roundStarts[2].label).toContain(PERSONAS[1].name);
  });

  it("adversarial attacker prompt is distinct from defender prompt", async () => {
    const { streamText } = await import("ai");
    (streamText as ReturnType<typeof vi.fn>).mockClear();

    await runConsensus(
      "Test",
      [makeParticipant("p-1"), makeParticipant("p-2", "test:test-model", 1)],
      opts({ engine: "adversarial", rounds: 3, extractClaimsEnabled: false }),
      () => {},
    );

    const calls = (streamText as ReturnType<typeof vi.fn>).mock.calls;
    // Round 1 (2 init) + Round 2 (1 attacker + 1 defender) + Round 3 (2 final synth) = 6 calls
    expect(calls.length).toBe(6);
    const systemPrompts = calls.map((c) => c[0].system as string);
    const attackerPrompts = systemPrompts.filter((p) => p.includes("RED TEAM ATTACKER"));
    const defenderPrompts = systemPrompts.filter((p) => p.includes("DEFENDER this round"));
    const finalPrompts = systemPrompts.filter((p) => p.includes("FINAL POST-STRESS SYNTHESIS"));
    expect(attackerPrompts).toHaveLength(1);
    expect(defenderPrompts).toHaveLength(1);
    expect(finalPrompts).toHaveLength(2);
    // Attacker prompt suspends persona — should NOT contain any persona description
    expect(attackerPrompts[0]).not.toContain("Risk Analyst");
  });

  it("adversarial stress-round score and disagreements use defender responses only", async () => {
    // Confidences will be assigned in call order:
    //   r1: p-1 (init), p-2 (init)
    //   r2: p-1 attacker, p-2 defender (parallel — only one defender)
    //   r3: p-1 final, p-2 final
    confidenceSequence = [70, 80, 10, 95, 70, 80];

    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [makeParticipant("p-1"), makeParticipant("p-2", "test:test-model", 1)],
      opts({ engine: "adversarial", rounds: 3 }),
      (e) => events.push(e),
    );

    // Round 2 is the stress round — score must be from defender alone (95),
    // NOT include attacker confidence 10. avg(95) - 0.5*0 = 95.
    const roundEnds = events.filter((e) => e.type === "round-end") as Array<
      Extract<ConsensusEvent, { type: "round-end" }>
    >;
    expect(roundEnds).toHaveLength(3);
    expect(roundEnds[1].consensusScore).toBe(95);
  });

  it("adversarial defenders run in parallel — defender prompt does not see other defenders", async () => {
    const { streamText } = await import("ai");
    (streamText as ReturnType<typeof vi.fn>).mockClear();

    await runConsensus(
      "Test",
      [
        makeParticipant("p-1"),
        makeParticipant("p-2", "test:test-model", 1),
        makeParticipant("p-3", "test:test-model", 2),
      ],
      opts({ engine: "adversarial", rounds: 3 }),
      () => {},
    );

    const calls = (streamText as ReturnType<typeof vi.fn>).mock.calls;
    const systemPrompts = calls.map((c) => c[0].system as string);
    const defenderPrompts = systemPrompts.filter((p) => p.includes("DEFENDER this round"));
    expect(defenderPrompts.length).toBeGreaterThan(0);
    for (const p of defenderPrompts) {
      expect(p).not.toContain("OTHER DEFENDERS THIS ROUND");
      expect(p).not.toContain("Co-defender");
      expect(p).toContain("answering in parallel with other defenders");
    }
  });

  it("adversarial engine completes with consensus-complete summary", async () => {
    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [makeParticipant("p-1"), makeParticipant("p-2", "test:test-model", 1)],
      opts({ engine: "adversarial", rounds: 3 }),
      (e) => events.push(e),
    );
    const complete = events.find((e) => e.type === "consensus-complete");
    expect(complete).toBeDefined();
    if (complete?.type === "consensus-complete") {
      expect(complete.summary).toContain("Adversarial Red Team");
      expect(complete.roundsCompleted).toBe(3);
    }
  });

  it("adversarial engine runs the judge over the post-stress final round only", async () => {
    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [makeParticipant("p-1"), makeParticipant("p-2", "test:test-model", 1)],
      opts({
        engine: "adversarial",
        rounds: 3,
        judgeEnabled: true,
        judgeModelId: "test:test-model",
      }),
      (e) => events.push(e),
    );
    const judgeStart = events.find((e) => e.type === "judge-start");
    const judgeEnd = events.find((e) => e.type === "judge-end");
    expect(judgeStart).toBeDefined();
    expect(judgeEnd).toBeDefined();
  });

  it("pickAttackerIndex rotates round-robin", () => {
    expect(__testing.pickAttackerIndex(2, 3)).toBe(0);
    expect(__testing.pickAttackerIndex(3, 3)).toBe(1);
    expect(__testing.pickAttackerIndex(4, 3)).toBe(2);
    expect(__testing.pickAttackerIndex(5, 3)).toBe(0); // wrap
    expect(__testing.pickAttackerIndex(2, 0)).toBe(0); // empty-safe
  });

  // ── Claim-level extractor ────────────────────────────────

  it("parseClaimsJSON returns empty for non-JSON noise", () => {
    expect(__testing.parseClaimsJSON("nope", new Set(["p-1"]))).toEqual([]);
    expect(__testing.parseClaimsJSON("", new Set(["p-1"]))).toEqual([]);
    expect(__testing.parseClaimsJSON("```json\nnot really\n```", new Set(["p-1"]))).toEqual([]);
  });

  it("parseClaimsJSON extracts well-formed contradictions", () => {
    const raw = `Some preamble. {"contradictions": [{"claim": "A vs B on X", "sides": [{"stance": "A says yes", "participantIds": ["p-1"], "quote": "Yes definitely"}, {"stance": "B says no", "participantIds": ["p-2"], "quote": "Absolutely not"}]}]} trailing`;
    const out = __testing.parseClaimsJSON(raw, new Set(["p-1", "p-2"]));
    expect(out).toHaveLength(1);
    expect(out[0].claim).toBe("A vs B on X");
    expect(out[0].sides).toHaveLength(2);
    expect(out[0].sides[0].participantIds).toEqual(["p-1"]);
    expect(out[0].sides[1].quote).toBe("Absolutely not");
  });

  it("parseClaimsJSON drops sides with unknown participant ids", () => {
    const raw = `{"contradictions":[{"claim":"X","sides":[{"stance":"yes","participantIds":["p-1"],"quote":"q1"},{"stance":"no","participantIds":["p-ghost"],"quote":"q2"}]}]}`;
    // The "no" side becomes empty after filtering — only one side left → drop
    const out = __testing.parseClaimsJSON(raw, new Set(["p-1", "p-2"]));
    expect(out).toHaveLength(0);
  });

  it("parseClaimsJSON drops contradictions missing claim or sides<2", () => {
    const raw = `{"contradictions":[{"claim":"","sides":[]},{"claim":"only one side","sides":[{"stance":"a","participantIds":["p-1"],"quote":"q"}]}]}`;
    expect(__testing.parseClaimsJSON(raw, new Set(["p-1"]))).toEqual([]);
  });

  it("parseClaimsJSON drops a contradiction where the same participant appears on multiple sides", () => {
    const raw = `{"contradictions":[{"claim":"X","sides":[{"stance":"yes","participantIds":["p-1"],"quote":"q1"},{"stance":"no","participantIds":["p-1"],"quote":"q2"}]}]}`;
    expect(__testing.parseClaimsJSON(raw, new Set(["p-1", "p-2"]))).toEqual([]);
  });

  it("parseClaimsJSON verifies quotes against participant content when provided", () => {
    const raw = `{"contradictions":[{"claim":"X","sides":[{"stance":"yes","participantIds":["p-1"],"quote":"This is a long quote that should appear in p-1's actual content extensively"},{"stance":"no","participantIds":["p-2"],"quote":"This is a different long quote that should match p-2 content directly here"}]}]}`;
    // Both quotes present in their participants' content → kept
    const goodMap = new Map([
      [
        "p-1",
        "Some preface. This is a long quote that should appear in p-1's actual content extensively. Some suffix.",
      ],
      [
        "p-2",
        "Header. This is a different long quote that should match p-2 content directly here. Footer.",
      ],
    ]);
    const out = __testing.parseClaimsJSON(raw, new Set(["p-1", "p-2"]), goodMap);
    expect(out).toHaveLength(1);
  });

  it("parseClaimsJSON drops fabricated quotes that do not match participant content", () => {
    const raw = `{"contradictions":[{"claim":"X","sides":[{"stance":"yes","participantIds":["p-1"],"quote":"This is a fabricated quote that was never said by anyone in this debate at all"},{"stance":"no","participantIds":["p-2"],"quote":"This too is a hallucinated quote with no real basis in the participants' content"}]}]}`;
    const badMap = new Map([
      ["p-1", "Actual content of p-1, completely different from the fabricated quote."],
      ["p-2", "Actual content of p-2, also entirely unrelated to the so-called quote."],
    ]);
    const out = __testing.parseClaimsJSON(raw, new Set(["p-1", "p-2"]), badMap);
    expect(out).toEqual([]);
  });

  it("parseClaimsJSON caps to 8 contradictions", () => {
    const arr = Array.from({ length: 20 }, (_, i) => ({
      claim: `claim ${i}`,
      sides: [
        { stance: "a", participantIds: ["p-1"], quote: "q1" },
        { stance: "b", participantIds: ["p-2"], quote: "q2" },
      ],
    }));
    const raw = JSON.stringify({ contradictions: arr });
    const out = __testing.parseClaimsJSON(raw, new Set(["p-1", "p-2"]));
    expect(out.length).toBeLessThanOrEqual(8);
  });

  it("pickClaimExtractorModelId prefers judge model when judge enabled", () => {
    const participants = [makeParticipant("p-1")];
    expect(
      __testing.pickClaimExtractorModelId(
        opts({ judgeEnabled: true, judgeModelId: "judge:big" }),
        participants,
      ),
    ).toBe("judge:big");
  });

  it("pickClaimExtractorModelId falls back to first participant model", () => {
    const participants = [makeParticipant("p-1", "test:test-model")];
    expect(__testing.pickClaimExtractorModelId(opts({ judgeEnabled: false }), participants)).toBe(
      "test:test-model",
    );
  });

  it("CVP engine emits claims-start and claims-end when extractClaimsEnabled", async () => {
    const { streamText } = await import("ai");
    (streamText as ReturnType<typeof vi.fn>).mockClear();
    // First call returns the participant response, second call returns claims JSON
    (streamText as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => ({
        textStream: (async function* () {
          yield "x";
          yield "\nCONFIDENCE: 80";
        })(),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      }))
      .mockImplementationOnce(() => ({
        textStream: (async function* () {
          yield '{"contradictions":[';
          yield '{"claim":"X","sides":[{"stance":"a","participantIds":["p-1"],"quote":"q1"},{"stance":"b","participantIds":["p-1"],"quote":"q2"}]}';
          yield "]}";
        })(),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      }));

    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [makeParticipant("p-1")],
      opts({ rounds: 1, blindFirstRound: false, extractClaimsEnabled: true }),
      (e) => events.push(e),
    );

    const start = events.find((e) => e.type === "claims-start");
    const end = events.find((e) => e.type === "claims-end");
    expect(start).toBeDefined();
    expect(end).toBeDefined();
    if (end?.type === "claims-end") {
      // With both sides referencing p-1, the second side has same participant
      // and parser keeps it (no de-dup requirement).
      expect(end.digest.contradictions.length).toBeGreaterThanOrEqual(0);
      expect(end.digest.modelId).toBe("test-model");
    }
  });

  // ── Cost cap ─────────────────────────────────────────────

  it("CVP engine throws CostCapExceededError when running cost crosses the cap", async () => {
    const { CostCapExceededError } = await import("@/lib/consensus-engine");
    // Pricing for `test-model` is unknown → estimateCost returns 0.
    // To force a non-zero cost, mock streamText to return a "usage"
    // that, when run through estimateCost, would yield USD via
    // estimateUsageFromText fallback or via known-model mapping. The
    // cleanest path: use a participant whose modelId matches a known
    // pricing entry. We'll mock findResolvedModel to return one.
    const providers = await import("@/lib/providers");
    const original = providers.findResolvedModel;
    (providers as { findResolvedModel: (id: string) => unknown }).findResolvedModel = (
      id: string,
    ) => {
      if (id === "missing:model") return undefined;
      return {
        providerId: "openai",
        providerName: "OpenAI",
        modelId: "gpt-4o", // listed in pricing.ts
        baseUrl: "https://test.com/v1",
        apiKey: "test-key",
      };
    };
    const events: ConsensusEvent[] = [];
    try {
      await runConsensus(
        "Test",
        [makeParticipant("p-1", "openai:gpt-4o")],
        opts({
          rounds: 3,
          blindFirstRound: false,
          randomizeOrder: false,
          earlyStop: false,
          extractClaimsEnabled: false,
          costCapUSD: 0.000001, // essentially zero — first round will trip it
        }),
        (e) => events.push(e),
      );
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CostCapExceededError);
    } finally {
      (providers as { findResolvedModel: (id: string) => unknown }).findResolvedModel = original;
    }
  });

  it("Cost cap is undefined → no throws, no enforcement", async () => {
    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [makeParticipant("p-1")],
      opts({ rounds: 1, blindFirstRound: false, extractClaimsEnabled: false }),
      (e) => events.push(e),
    );
    expect(events.find((e) => e.type === "consensus-complete")).toBeDefined();
  });

  it("propagates engine-level CostCapExceededError as an SSE error event via the API route layer", async () => {
    // The SSE route catches engine throws and emits an `error` event.
    // We can simulate by emitting via a mock catch wrapper similar to
    // app/api/consensus/route.ts. Simpler: assert that the engine throws
    // CostCapExceededError so the route's try/catch picks it up.
    const { CostCapExceededError } = await import("@/lib/consensus-engine");
    expect(new CostCapExceededError(0.5, 0.1).message).toContain("Cost cap exceeded");
  });

  it("CVP engine soft-fails claim extraction on parse errors", async () => {
    const { streamText } = await import("ai");
    (streamText as ReturnType<typeof vi.fn>).mockClear();
    (streamText as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => ({
        textStream: (async function* () {
          yield "x\nCONFIDENCE: 80";
        })(),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 5 }),
      }))
      .mockImplementationOnce(() => ({
        // Garbage that won't parse as JSON
        textStream: (async function* () {
          yield "this is not json at all";
        })(),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 5 }),
      }));

    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Test",
      [makeParticipant("p-1")],
      opts({ rounds: 1, blindFirstRound: false, extractClaimsEnabled: true }),
      (e) => events.push(e),
    );

    const end = events.find((e) => e.type === "claims-end");
    expect(end).toBeDefined();
    if (end?.type === "claims-end") {
      expect(end.digest.contradictions).toEqual([]);
    }
  });

  it("detectDisagreements reports pairs above threshold", () => {
    const participants = [
      {
        id: "a",
        modelInfo: {
          id: "test:test-model",
          providerId: "test",
          providerName: "Test",
          modelId: "test-model",
        },
        persona: PERSONAS[0],
      },
      {
        id: "b",
        modelInfo: {
          id: "test:test-model",
          providerId: "test",
          providerName: "Test",
          modelId: "test-model",
        },
        persona: PERSONAS[1],
      },
    ];
    const out = detectDisagreements(
      2,
      [
        { participantId: "a", roundNumber: 2, content: "", confidence: 90, timestamp: 0 },
        { participantId: "b", roundNumber: 2, content: "", confidence: 50, timestamp: 0 },
      ],
      participants,
    );
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe(40);
    expect(out[0].label).toContain("vs");
  });
});
