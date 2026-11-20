import { describe, it, expect, vi } from "vitest";

// Contract: POST /api/adjudicate validates like /api/consensus (limits,
// server-side participant rebuild, judge model), passes cleaned input to
// the engine and streams its events as SSE.

const runCompareAttempts = vi.fn(async (_input: unknown, emit: (e: unknown) => void) => {
  emit({ type: "compare-round-start", round: 1, kind: "blind" });
});
vi.mock("@/lib/compare-attempts", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/compare-attempts")>("@/lib/compare-attempts");
  return { ...actual, runCompareAttempts };
});
vi.mock("@/lib/providers", () => ({
  findResolvedModel: (id: string) =>
    !id || id === "unknown:model"
      ? undefined
      : { providerId: "t", providerName: "T", modelId: "m", baseUrl: "http://x", apiKey: "k" },
}));

let ip = 0;
function post(body: unknown, sameIp?: string): Request {
  ip += 1;
  return new Request("http://localhost/api/adjudicate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": sameIp ?? `adj-${ip}` },
    body: JSON.stringify(body),
  });
}

const seat = (id: string) => ({ id, modelInfo: { id: "t:m" }, persona: { id: "pessimist" } });
const valid = () => ({
  task: "Fix the bug",
  attempts: [
    { label: "mine", content: "+a" },
    { content: "+b", checks: [{ name: "tests", status: "failed" }] },
  ],
  participants: [seat("p-1"), seat("p-2")],
  options: { judgeEnabled: false },
});

const { POST } = await import("@/app/api/adjudicate/route");

async function errorOf(res: Response): Promise<string> {
  expect(res.status).toBe(400);
  return ((await res.json()) as { error: string }).error;
}

describe("POST /api/adjudicate", () => {
  it("streams engine events as SSE for a valid request", async () => {
    const res = await POST(post(valid()));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(await res.text()).toBe(
      'data: {"type":"compare-round-start","round":1,"kind":"blind"}\n\n',
    );
    const input = runCompareAttempts.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(input).toMatchObject({
      task: "Fix the bug",
      attempts: [
        { label: "mine", content: "+a", checks: [] },
        { label: "Attempt 2", content: "+b", checks: [{ name: "tests", status: "failed" }] },
      ],
    });
    // Personas are rebuilt server-side, not taken from the client.
    const participants = input.participants as Array<{ persona: { systemPrompt: string } }>;
    expect(participants).toHaveLength(2);
    expect(participants[0]!.persona.systemPrompt.length).toBeGreaterThan(20);
  });

  it.each([
    ["a missing task", { task: "" }, /Missing task/],
    ["an oversized task", { task: "x".repeat(10_001) }, /under 10000/],
    ["one attempt", { attempts: [{ content: "a" }] }, /between 2 and 6/],
    ["one juror", { participants: [seat("p-1")] }, /between 2 and 8 jurors/],
    [
      "an unknown model",
      { participants: [seat("p-1"), { ...seat("p-2"), modelInfo: { id: "unknown:model" } }] },
      /Model not available/,
    ],
    ["a judge without a model", { options: { judgeEnabled: true } }, /no judgeModelId/],
    [
      "an unknown judge model",
      { options: { judgeEnabled: true, judgeModelId: "unknown:model" } },
      /Judge model not available/,
    ],
  ])("rejects %s with 400", async (_name, patch, re) => {
    expect(await errorOf(await POST(post({ ...valid(), ...patch })))).toMatch(re);
  });

  it("forwards a clamped cost cap and the judge model", async () => {
    await POST(
      post({ ...valid(), options: { judgeEnabled: true, judgeModelId: "t:m", costCapUSD: 500 } }),
    );
    expect(runCompareAttempts.mock.calls.at(-1)![0]).toMatchObject({
      judgeModelId: "t:m",
      costCapUSD: 50,
    });
  });

  it("emits an SSE error event when the engine throws", async () => {
    runCompareAttempts.mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    const res = await POST(post(valid()));
    expect(await res.text()).toBe('data: {"type":"error","message":"boom"}\n\n');
  });

  it("rate-limits a client to 5 requests a minute", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await POST(post(valid(), "same-ip"))).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });
});
