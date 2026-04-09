import { describe, it, expect, vi } from "vitest";

// Mock the consensus engine (accepts signal as 5th arg)
vi.mock("@/lib/consensus-engine", () => ({
  runConsensus: vi.fn(async (_prompt, _participants, _rounds, emit, _signal) => {
    emit({ type: "round-start", round: 1, roundType: "initial-analysis", label: "Analysis" });
    emit({ type: "consensus-complete", finalScore: 85, summary: "Done" });
  }),
}));

// Mock personas (used by the route to rebuild server-side)
vi.mock("@/lib/personas", () => ({
  getPersona: () => ({
    id: "test",
    name: "Test",
    emoji: "T",
    color: "#000",
    systemPrompt: "test",
    description: "test",
  }),
}));

// Mock providers (used by the route to validate models)
vi.mock("@/lib/providers", () => ({
  findResolvedModel: (id: string) =>
    id
      ? { providerId: "t", providerName: "T", modelId: "m", baseUrl: "http://x", apiKey: "k" }
      : undefined,
}));

// We need to reset rate limiter state between tests.
// The route module stores request counts in a module-level Map.
// Re-importing would create a fresh module, but vi.mock makes that tricky.
// Instead, we'll use unique IPs per test by varying x-forwarded-for.
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

  it("returns SSE stream for valid request", async () => {
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
});
