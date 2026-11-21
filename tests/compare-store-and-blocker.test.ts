import { describe, it, expect, beforeEach } from "vitest";
import { useArenaStore } from "@/lib/store";
import { getRunBlocker } from "@/lib/run-blocker";
import type { CompareResult, ModelInfo } from "@/lib/types";

// Contracts: the attempts editor actions keep 2–6 attempts and ≤8 checks;
// applyCompareEvent folds the SSE stream into `compare`; the run blocker
// covers every attempt rule the route enforces.

const s = () => useArenaStore.getState();

beforeEach(() => {
  useArenaStore.setState(useArenaStore.getInitialState(), true);
});

describe("attempt drafts", () => {
  it("starts with two empty attempts and keeps between 2 and 6", () => {
    expect(s().attempts).toHaveLength(2);
    s().removeAttempt(s().attempts[0]!.id);
    expect(s().attempts).toHaveLength(2);
    for (let i = 0; i < 6; i++) s().addAttempt();
    expect(s().attempts).toHaveLength(6);
    s().removeAttempt(s().attempts[5]!.id);
    expect(s().attempts).toHaveLength(5);
    expect(new Set(s().attempts.map((a) => a.id)).size).toBe(5);
  });

  it("edits labels, content and checks (at most 8 checks)", () => {
    const id = s().attempts[0]!.id;
    s().updateAttempt(id, { label: "mine", content: "+x" });
    for (let i = 0; i < 9; i++) s().addAttemptCheck(id);
    expect(s().attempts[0]!.checks).toHaveLength(8);
    s().updateAttemptCheck(id, 1, { name: "tests", status: "failed", output: "boom" });
    s().removeAttemptCheck(id, 0);
    expect(s().attempts[0]).toMatchObject({ label: "mine", content: "+x" });
    expect(s().attempts[0]!.checks[0]).toEqual({ name: "tests", status: "failed", output: "boom" });
    expect(s().attempts[1]!.checks).toEqual([]);
  });
});

describe("applyCompareEvent", () => {
  it("is a no-op unless a Compare run is in progress", () => {
    s().applyCompareEvent({ type: "compare-round-start", round: 1, kind: "blind" });
    expect(s().compare).toBeNull();
    s().setOption("engine", "cvp");
    s().startConsensus();
    expect(s().compare).toBeNull();
  });

  it("folds the stream into compare state and completes the run", () => {
    s().setOption("engine", "compare-attempts");
    s().startConsensus();
    expect(s().compare).toMatchObject({ round: 0, result: null });
    s().applyCompareEvent({
      type: "compare-start",
      attempts: [
        { id: "attempt-1", label: "A1" },
        { id: "attempt-2", label: "A2" },
      ],
      jurorIds: ["p-1", "p-2"],
    });
    s().applyCompareEvent({ type: "compare-round-start", round: 1, kind: "blind" });
    s().applyCompareEvent({ type: "juror-start", jurorId: "p-1", round: 1 });
    expect(s().compare!.jurors["p-1"]).toEqual({ round: 1, status: "running" });
    s().applyCompareEvent({
      type: "juror-end",
      jurorId: "p-1",
      round: 1,
      status: "abstained",
      ranking: [],
      verified: 0,
      dropped: 1,
      reason: "output is not a single JSON object",
      durationMs: 5,
    });
    s().applyCompareEvent({ type: "compare-round-end", round: 1, kendallW: null, votes: 1 });
    s().applyCompareEvent({ type: "judge-start", modelId: "m", providerName: "P" });
    s().applyCompareEvent({ type: "judge-token", token: "## Maj" });
    expect(s().compare).toMatchObject({ judgeRunning: true, judgeStream: "## Maj", votes: 1 });
    const result = { verdict: "no-clear-winner" } as CompareResult;
    s().applyCompareEvent({
      type: "compare-complete",
      result,
      tokenTotal: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUSD: 0 },
    });
    expect(s().isRunning).toBe(false);
    expect(s().compare).toMatchObject({
      result,
      jurors: {
        "p-1": { status: "abstained", reason: "output is not a single JSON object", dropped: 1 },
      },
    });
    expect(s().runEndedAt).not.toBeNull();
  });

  it("clears the judge spinner when the run fails", () => {
    s().setOption("engine", "compare-attempts");
    s().startConsensus();
    s().applyCompareEvent({ type: "judge-start", modelId: "m", providerName: "P" });
    s().failConsensus("boom");
    expect(s().compare).toMatchObject({ judgeRunning: false, judgeStream: "" });
  });
});

describe("getRunBlocker — Compare attempts", () => {
  const model: ModelInfo = { id: "t:m", providerId: "t", providerName: "T", modelId: "m" };
  const base = {
    prompt: "Fix it",
    participants: [{ modelInfo: model }, { modelInfo: model }],
    availableModels: [model],
    modelsLoading: false,
    options: { engine: "compare-attempts" as const, judgeEnabled: false },
  };

  it("asks for a task, then for every attempt to be pasted", () => {
    expect(getRunBlocker({ ...base, prompt: " ", attempts: [] })).toBe("Describe the task");
    expect(getRunBlocker({ ...base, attempts: [{ content: "a" }] })).toBe(
      "Add at least 2 attempts",
    );
    expect(getRunBlocker({ ...base, attempts: [{ content: "a" }, { content: "" }] })).toBe(
      "Paste attempt 2",
    );
  });

  it("enforces the size limits the route enforces", () => {
    expect(
      getRunBlocker({ ...base, attempts: [{ content: "a" }, { content: "x".repeat(60_001) }] }),
    ).toMatch(/Shorten attempt 2/);
    expect(
      getRunBlocker({
        ...base,
        attempts: Array.from({ length: 4 }, () => ({ content: "x".repeat(55_000) })),
      }),
    ).toMatch(/in total/);
    expect(
      getRunBlocker({ ...base, attempts: Array.from({ length: 7 }, () => ({ content: "a" })) }),
    ).toMatch(/6 is the maximum/);
  });

  it("allows a ready comparison and ignores attempts for other engines", () => {
    expect(getRunBlocker({ ...base, attempts: [{ content: "a" }, { content: "b" }] })).toBeNull();
    expect(getRunBlocker({ ...base, options: { judgeEnabled: false }, attempts: [] })).toBeNull();
  });
});
