import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CompareEvent, Participant } from "@/lib/types";
import { PERSONAS } from "@/lib/personas";

// Contract: runCompareAttempts drives ai-consensus-core's
// AdjudicationEngine through the Vercel caller, never sends a user's
// attempt label to a model, maps core events to SSE events, prices usage,
// and ends with compare-complete (or an AbortError on abort).

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => {
    const make = (modelId: string) => ({ modelId });
    const p = make as ((m: string) => { modelId: string }) & { chat: typeof make };
    p.chat = make;
    return p;
  },
}));

const calls: Array<{ system: string; prompt: string; model: string }> = [];
let juror: (prompt: string, model: string) => string = () => "";

/** Juror answers by finding candidates by content tag in the prompt. */
function rankByTags(prompt: string, tags: string[]): string {
  const label = (tag: string) => {
    const re = /<<<BEGIN CANDIDATE ([A-Z]) [0-9a-f]{6}>>>\n([\s\S]*?)\n<<<END CANDIDATE/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(prompt)) !== null) if (m[2]!.includes(tag)) return m[1]!;
    throw new Error(`no ${tag}`);
  };
  return JSON.stringify({
    ranking: tags.map(label),
    assessments: [],
    findings: [
      {
        candidate: label("TAG_TWO"),
        severity: "high",
        file: "a.ts",
        line: null,
        quote: "return 2; // TAG_TWO",
        issue: "wrong",
      },
      {
        candidate: label("TAG_TWO"),
        severity: "low",
        file: "a.ts",
        line: null,
        quote: "never written anywhere",
        issue: "made up",
      },
    ],
  });
}

vi.mock("ai", () => ({
  streamText: vi.fn((opts: { system: string; prompt: string; model: { modelId: string } }) => {
    calls.push({ system: opts.system, prompt: opts.prompt, model: opts.model.modelId });
    const isJudge = opts.system.includes("Consensus Judge");
    const text = isJudge
      ? "## Majority Position\nAll jurors preferred A.\n\n## Minority Positions\nNone.\n\n## Unresolved Disputes\n- None\n\nJUDGE_CONFIDENCE: 80"
      : juror(opts.prompt, opts.model.modelId);
    return {
      textStream: (async function* () {
        yield text;
      })(),
      usage: Promise.resolve({ inputTokens: 1000, outputTokens: 100 }),
    };
  }),
}));

vi.mock("@/lib/providers", () => ({
  findResolvedModel: (id: string) => ({
    providerId: "openai",
    providerName: "OpenAI",
    modelId: id.split(":")[1] ?? id,
    baseUrl: "https://x/v1",
    apiKey: "k",
  }),
}));

const { runCompareAttempts, parseAttempts } = await import("@/lib/compare-attempts");

const seat = (id: string, i: number): Participant => ({
  id,
  modelInfo: {
    id: "openai:gpt-4o",
    providerId: "openai",
    providerName: "OpenAI",
    modelId: "gpt-4o",
  },
  persona: PERSONAS[i]!,
});

const ATTEMPTS = [
  { label: "Claude's branch", content: "+ return 1; // TAG_ONE", checks: [] },
  {
    label: "Codex's branch",
    content: "+ return 2; // TAG_TWO",
    checks: [{ name: "tests", status: "failed" as const, output: "1 failing" }],
  },
  { label: "Grok's branch", content: "+ return 3; // TAG_THREE", checks: [] },
];

describe("runCompareAttempts", () => {
  beforeEach(() => {
    calls.length = 0;
    juror = (prompt) => rankByTags(prompt, ["TAG_TWO", "TAG_ONE", "TAG_THREE"]);
  });

  it("streams the run and ends with the core result, applying the failed-check rule", async () => {
    const events: CompareEvent[] = [];
    await runCompareAttempts(
      {
        task: "Return the right number",
        attempts: ATTEMPTS,
        participants: [seat("p-1", 0), seat("p-2", 1)],
        judgeModelId: "openai:gpt-4o-mini",
        randomSeed: 3,
      },
      (e) => events.push(e),
    );
    expect(events[0]).toEqual({
      type: "compare-start",
      attempts: [
        { id: "attempt-1", label: "Claude's branch" },
        { id: "attempt-2", label: "Codex's branch" },
        { id: "attempt-3", label: "Grok's branch" },
      ],
      jurorIds: ["p-1", "p-2"],
    });
    expect(events.map((e) => e.type)).toEqual([
      "compare-start",
      "compare-round-start",
      "juror-start",
      "juror-start",
      "juror-end",
      "juror-end",
      "compare-round-end",
      "judge-start",
      "judge-token",
      "judge-end",
      "compare-complete",
    ]);
    const done = events.at(-1);
    if (done?.type !== "compare-complete") throw new Error("no completion");
    const r = done.result;
    // Both jurors put attempt-2 first, but it failed a check.
    expect(r.ranking[0]).toMatchObject({ candidateId: "attempt-2", eligible: false });
    expect(r.recommended).toBe("attempt-1");
    expect(r.findings.find((f) => f.candidateId === "attempt-2")).toMatchObject({ dropped: 2 });
    expect(r.findings.find((f) => f.candidateId === "attempt-2")!.verified[0]!.reportedBy).toEqual([
      "p-1",
      "p-2",
    ]);
    expect(r.synthesis?.majorityPosition).toBe("All jurors preferred A.");
    // Three calls at 1000 in / 100 out, priced as gpt-4o / gpt-4o-mini.
    expect(done.tokenTotal.totalTokens).toBe(3300);
    expect(done.tokenTotal.estimatedCostUSD).toBeGreaterThan(0);
    const juryEnd = events.find((e) => e.type === "juror-end");
    expect(juryEnd).toMatchObject({
      status: "valid",
      verified: 1,
      dropped: 1,
      ranking: ["attempt-2", "attempt-1", "attempt-3"],
    });
  });

  it("never sends attempt labels or ids to a model", async () => {
    await runCompareAttempts(
      {
        task: "t",
        attempts: ATTEMPTS,
        participants: [seat("p-1", 0), seat("p-2", 1)],
        judgeModelId: "openai:gpt-4o",
      },
      () => undefined,
    );
    expect(calls).toHaveLength(3);
    for (const c of calls) {
      for (const a of ATTEMPTS) expect(`${c.system}${c.prompt}`).not.toContain(a.label);
      expect(`${c.system}${c.prompt}`).not.toMatch(/attempt-\d/);
    }
  });

  it("counts malformed juror output as an abstention", async () => {
    juror = (prompt, model) => (model === "gpt-4o" && prompt ? "not json" : "");
    const events: CompareEvent[] = [];
    await runCompareAttempts(
      { task: "t", attempts: ATTEMPTS, participants: [seat("p-1", 0), seat("p-2", 1)] },
      (e) => events.push(e),
    );
    const ends = events.filter((e) => e.type === "juror-end");
    expect(ends.every((e) => e.type === "juror-end" && e.status === "abstained")).toBe(true);
    const done = events.at(-1);
    expect(done?.type === "compare-complete" && done.result.noClearWinnerReason).toBe(
      "insufficient-votes",
    );
  });

  it("throws AbortError when the request is aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      runCompareAttempts(
        { task: "t", attempts: ATTEMPTS, participants: [seat("p-1", 0), seat("p-2", 1)] },
        () => undefined,
        ac.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("stops at the cost cap with a partial result", async () => {
    const events: CompareEvent[] = [];
    await runCompareAttempts(
      {
        task: "t",
        attempts: ATTEMPTS,
        participants: [seat("p-1", 0), seat("p-2", 1)],
        costCapUSD: 0.000001,
      },
      (e) => events.push(e),
    );
    const done = events.at(-1);
    expect(done?.type === "compare-complete" && done.result.stopReason).toBe("cost-cap");
    expect(calls).toHaveLength(0);
  });
});

describe("parseAttempts — contract: the route's attempt validation", () => {
  it("cleans valid attempts: default labels, trimmed check names, dropped empty output", () => {
    expect(
      parseAttempts([
        { content: "a", checks: [{ name: " tests ", status: "passed", output: "  " }] },
        { label: " Mine ", content: "b" },
      ]),
    ).toEqual([
      { label: "Attempt 1", content: "a", checks: [{ name: "tests", status: "passed" }] },
      { label: "Mine", content: "b", checks: [] },
    ]);
  });

  it.each([
    ["not an array", "x", /array/],
    ["one attempt", [{ content: "a" }], /between 2 and 6/],
    ["seven attempts", Array.from({ length: 7 }, () => ({ content: "a" })), /between 2 and 6/],
    ["an empty attempt", [{ content: "a" }, { content: "  " }], /Attempt 2 is empty/],
    ["an oversized attempt", [{ content: "a" }, { content: "x".repeat(60_001) }], /longer than/],
    [
      "too much in total",
      Array.from({ length: 4 }, () => ({ content: "x".repeat(55_000) })),
      /total/,
    ],
    [
      "a bad check status",
      [{ content: "a", checks: [{ name: "t", status: "green" }] }, { content: "b" }],
      /passed, failed or unknown/,
    ],
    [
      "a nameless check",
      [{ content: "a", checks: [{ name: "", status: "passed" }] }, { content: "b" }],
      /needs a name/,
    ],
    [
      "nine checks",
      [
        {
          content: "a",
          checks: Array.from({ length: 9 }, () => ({ name: "t", status: "passed" })),
        },
        { content: "b" },
      ],
      /at most 8/,
    ],
  ])("rejects %s", (_n, raw, re) => {
    const out = parseAttempts(raw);
    expect(typeof out).toBe("string");
    expect(out as string).toMatch(re);
  });
});
