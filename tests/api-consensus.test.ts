import { describe, it, expect, vi } from "vitest";

// Mock the consensus engine (new signature — options bundle)
vi.mock("@/lib/consensus-engine", () => ({
  runConsensus: vi.fn(async (_prompt, _participants, _options, emit, _signal) => {
    emit({ type: "round-start", round: 1, roundType: "initial-analysis", label: "Analysis" });
    emit({ type: "consensus-complete", finalScore: 85, summary: "Done", roundsCompleted: 1 });
  }),
}));

// Mock personas (used by the route to rebuild server-side).
// Use the real composeCustomPersona / sanitizeCustomPersonaSpec so we
// can assert end-to-end that bad specs are rejected with HTTP 400.
vi.mock("@/lib/personas", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/personas")>("@/lib/personas");
  return {
    ...actual,
    getPersona: () => ({
      id: "test",
      name: "Test",
      emoji: "T",
      color: "#000",
      systemPrompt: "test",
      description: "test",
    }),
  };
});

// Mock providers (used by the route to validate models)
vi.mock("@/lib/providers", () => ({
  findResolvedModel: (id: string) => {
    if (!id) return undefined;
    if (id === "unknown:model") return undefined;
    return { providerId: "t", providerName: "T", modelId: "m", baseUrl: "http://x", apiKey: "k" };
  },
}));

// Use unique IPs per test to avoid rate limiting between tests
let testIpCounter = 0;
function makeRequest(body: unknown): Request {
  testIpCounter++;
  return new Request("http://localhost/api/consensus", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `test-${testIpCounter}` },
    body: JSON.stringify(body),
  });
}

const { POST } = await import("@/app/api/consensus/route");

describe("POST /api/consensus", () => {
  it("returns 400 when prompt is missing", async () => {
    const response = await POST(makeRequest({ participants: [{}], rounds: 3 }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing required fields");
  });

  it("returns 400 when participants are missing", async () => {
    const response = await POST(makeRequest({ prompt: "test", rounds: 3 }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when rounds is missing", async () => {
    const response = await POST(makeRequest({ prompt: "test", participants: [{}] }));
    expect(response.status).toBe(400);
  });

  it("returns 400 for oversized prompt", async () => {
    const response = await POST(
      makeRequest({
        prompt: "x".repeat(10_001),
        participants: [{ id: "p", modelInfo: { id: "t:m" }, persona: { id: "test" } }],
        rounds: 1,
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("characters");
  });

  it("returns 400 for too many participants", async () => {
    const participants = Array.from({ length: 9 }, (_, i) => ({
      id: `p-${i}`,
      modelInfo: { id: "t:m" },
      persona: { id: "test" },
    }));
    const response = await POST(makeRequest({ prompt: "test", participants, rounds: 1 }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("participants");
  });

  it("clamps rounds to server-side max", async () => {
    const response = await POST(
      makeRequest({
        prompt: "test",
        participants: [{ id: "p-1", modelInfo: { id: "t:m" }, persona: { id: "test" } }],
        rounds: 50,
      }),
    );
    expect(response.status).toBe(200);
  });

  it("returns SSE stream for valid legacy `rounds` body", async () => {
    const response = await POST(
      makeRequest({
        prompt: "test topic",
        participants: [{ id: "p-1", modelInfo: { id: "t:m" }, persona: { id: "test" } }],
        rounds: 2,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache, no-transform");

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let output = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output += decoder.decode(value);
    }

    expect(output).toContain("round-start");
    expect(output).toContain("consensus-complete");
  });

  it("accepts an options bundle", async () => {
    const response = await POST(
      makeRequest({
        prompt: "test",
        participants: [{ id: "p-1", modelInfo: { id: "t:m" }, persona: { id: "test" } }],
        options: {
          engine: "cvp",
          rounds: 3,
          randomizeOrder: true,
          blindFirstRound: true,
          earlyStop: true,
          judgeEnabled: false,
        },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("accepts the blind-jury engine", async () => {
    const response = await POST(
      makeRequest({
        prompt: "test",
        participants: [{ id: "p-1", modelInfo: { id: "t:m" }, persona: { id: "test" } }],
        options: {
          engine: "blind-jury",
          rounds: 1,
          randomizeOrder: false,
          blindFirstRound: false,
          earlyStop: false,
          judgeEnabled: false,
        },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("accepts the adversarial engine", async () => {
    const response = await POST(
      makeRequest({
        prompt: "test",
        participants: [
          { id: "p-1", modelInfo: { id: "t:m" }, persona: { id: "test" } },
          { id: "p-2", modelInfo: { id: "t:m" }, persona: { id: "test" } },
        ],
        options: {
          engine: "adversarial",
          rounds: 3,
          randomizeOrder: false,
          blindFirstRound: false,
          earlyStop: false,
          judgeEnabled: false,
        },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("accepts a participant with a valid custom persona spec", async () => {
    const response = await POST(
      makeRequest({
        prompt: "test",
        participants: [
          {
            id: "p-1",
            modelInfo: { id: "t:m" },
            persona: { id: "custom" },
            customPersonaSpec: {
              id: "custom",
              name: "Test Custom",
              emoji: "🦊",
              color: "#abcdef",
              axes: {
                riskTolerance: "low",
                optimism: "high",
                evidenceBar: "high",
                formality: "mid",
                verbosity: "low",
                contrarian: "high",
              },
            },
          },
        ],
        options: {
          engine: "cvp",
          rounds: 1,
          randomizeOrder: false,
          blindFirstRound: false,
          earlyStop: false,
          judgeEnabled: false,
        },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("rejects a participant with an invalid custom persona spec", async () => {
    const response = await POST(
      makeRequest({
        prompt: "test",
        participants: [
          {
            id: "p-1",
            modelInfo: { id: "t:m" },
            persona: { id: "custom" },
            // missing customPersonaSpec entirely
          },
        ],
        options: {
          engine: "cvp",
          rounds: 1,
          randomizeOrder: false,
          blindFirstRound: false,
          earlyStop: false,
          judgeEnabled: false,
        },
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("custom persona spec");
  });

  it("rejects judgeEnabled with no judge model", async () => {
    const response = await POST(
      makeRequest({
        prompt: "test",
        participants: [{ id: "p-1", modelInfo: { id: "t:m" }, persona: { id: "test" } }],
        options: {
          engine: "cvp",
          rounds: 2,
          randomizeOrder: false,
          blindFirstRound: false,
          earlyStop: false,
          judgeEnabled: true,
        },
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("judgeModelId");
  });

  it("accepts judgeEnabled with a judge model", async () => {
    const response = await POST(
      makeRequest({
        prompt: "test",
        participants: [{ id: "p-1", modelInfo: { id: "t:m" }, persona: { id: "test" } }],
        options: {
          engine: "cvp",
          rounds: 2,
          randomizeOrder: false,
          blindFirstRound: false,
          earlyStop: false,
          judgeEnabled: true,
          judgeModelId: "t:m",
        },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("rejects when a participant's model cannot be resolved", async () => {
    const response = await POST(
      makeRequest({
        prompt: "test",
        participants: [{ id: "p-1", modelInfo: { id: "unknown:model" }, persona: { id: "test" } }],
        rounds: 1,
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Model not available");
  });

  it("rejects when the judge model cannot be resolved", async () => {
    const response = await POST(
      makeRequest({
        prompt: "test",
        participants: [{ id: "p-1", modelInfo: { id: "t:m" }, persona: { id: "test" } }],
        options: {
          engine: "cvp",
          rounds: 1,
          randomizeOrder: false,
          blindFirstRound: false,
          earlyStop: false,
          judgeEnabled: true,
          judgeModelId: "unknown:model",
        },
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Judge model not available");
  });

  it("surfaces engine errors via an `error` SSE event", async () => {
    const { runConsensus } = await import("@/lib/consensus-engine");
    (runConsensus as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw new Error("explode");
    });

    const response = await POST(
      makeRequest({
        prompt: "test",
        participants: [{ id: "p-1", modelInfo: { id: "t:m" }, persona: { id: "test" } }],
        rounds: 1,
      }),
    );

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let output = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output += decoder.decode(value);
    }
    expect(output).toContain("error");
    expect(output).toContain("explode");
  });

  it("returns 429 when rate limit is exceeded for a single IP", async () => {
    const fixedIp = "rate-limit-test-ip";
    const makeFixed = () =>
      new Request("http://localhost/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": fixedIp },
        body: JSON.stringify({
          prompt: "test",
          participants: [{ id: "p-1", modelInfo: { id: "t:m" }, persona: { id: "test" } }],
          rounds: 1,
        }),
      });

    let last: Response | null = null;
    for (let i = 0; i < 6; i++) {
      last = await POST(makeFixed());
    }
    expect(last?.status).toBe(429);
  });
});
