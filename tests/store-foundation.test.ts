import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useArenaStore, DEFAULT_OPTIONS } from "@/lib/store";
import type { SessionSnapshot } from "@/lib/types";
import { FIXTURE_SNAPSHOT, FIXTURE_SNAPSHOT_JURY } from "./fixtures/snapshot";
import { MODELS, SEATS } from "./helpers/page-harness";

const snapshot: SessionSnapshot = {
  v: 1,
  prompt: "Q",
  engine: "cvp",
  options: { ...DEFAULT_OPTIONS },
  participants: [],
  rounds: [],
  finalScore: 50,
  finalSummary: "s",
  judge: null,
  disagreements: [],
  tokenTotal: null,
  createdAt: 1,
};

beforeEach(() => {
  useArenaStore.getState().reset();
  useArenaStore.getState().clearSweep();
  useArenaStore.setState({
    view: "setup",
    participants: [],
    prompt: "",
    options: { ...DEFAULT_OPTIONS },
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("store — foundation additions", () => {
  const T0 = new Date("2026-01-01T00:00:00Z").getTime();

  it("starts on the setup view with no run timestamps", () => {
    const s = useArenaStore.getState();
    expect(s.view).toBe("setup");
    expect(s.runStartedAt).toBeNull();
    expect(s.runEndedAt).toBeNull();
  });

  it("setView switches views", () => {
    useArenaStore.getState().setView("history");
    expect(useArenaStore.getState().view).toBe("history");
    useArenaStore.getState().setView("run");
    expect(useArenaStore.getState().view).toBe("run");
  });

  it("startConsensus stamps runStartedAt and clears runEndedAt", () => {
    useArenaStore.setState({ runEndedAt: 123 });
    useArenaStore.getState().startConsensus();
    const s = useArenaStore.getState();
    expect(s.runStartedAt).toBe(T0);
    expect(s.runEndedAt).toBeNull();
  });

  it("completeConsensus stamps runEndedAt", () => {
    useArenaStore.getState().startConsensus();
    vi.advanceTimersByTime(90_000);
    useArenaStore.getState().completeConsensus(80, "done", 3);
    const s = useArenaStore.getState();
    expect(s.runStartedAt).toBe(T0);
    expect(s.runEndedAt).toBe(T0 + 90_000);
  });

  it("cancelConsensus stamps runEndedAt", () => {
    useArenaStore.getState().startConsensus();
    vi.advanceTimersByTime(5_000);
    useArenaStore.getState().cancelConsensus();
    expect(useArenaStore.getState().runEndedAt).toBe(T0 + 5_000);
  });

  it("cancelling while idle keeps the previous run's end time", () => {
    useArenaStore.getState().startConsensus();
    vi.advanceTimersByTime(1_000);
    useArenaStore.getState().completeConsensus(80, "done", 3);
    vi.advanceTimersByTime(60_000);
    useArenaStore.getState().cancelConsensus();
    useArenaStore.getState().cancelSweep();
    expect(useArenaStore.getState().runEndedAt).toBe(T0 + 1_000);
  });

  it("cancelSweep stamps runEndedAt", () => {
    useArenaStore.getState().startSweep(["cvp", "blind-jury"]);
    useArenaStore.getState().startConsensus();
    vi.advanceTimersByTime(7_000);
    useArenaStore.getState().cancelSweep();
    expect(useArenaStore.getState().runEndedAt).toBe(T0 + 7_000);
  });

  it("reset clears both timestamps but leaves the view alone", () => {
    useArenaStore.getState().setView("run");
    useArenaStore.getState().startConsensus();
    useArenaStore.getState().completeConsensus(80, "done", 3);
    useArenaStore.getState().reset();
    const s = useArenaStore.getState();
    expect(s.runStartedAt).toBeNull();
    expect(s.runEndedAt).toBeNull();
    expect(s.view).toBe("run");
  });

  it("lifecycle actions do not change the view", () => {
    useArenaStore.getState().setView("history");
    useArenaStore.getState().startConsensus();
    useArenaStore.getState().completeConsensus(1, "s", 1);
    useArenaStore.getState().loadSnapshot(snapshot);
    expect(useArenaStore.getState().view).toBe("history");
  });

  it("loadSnapshot defaults to sharedView=true", () => {
    useArenaStore.getState().loadSnapshot(snapshot);
    expect(useArenaStore.getState().sharedView).toBe(true);
    useArenaStore.getState().loadSnapshot(snapshot, {});
    expect(useArenaStore.getState().sharedView).toBe(true);
  });

  it("loadSnapshot can open a snapshot as an editable run", () => {
    useArenaStore.getState().loadSnapshot(snapshot, { sharedView: false });
    const s = useArenaStore.getState();
    expect(s.sharedView).toBe(false);
    expect(s.prompt).toBe("Q");
    expect(s.finalScore).toBe(50);
  });

  it("loadSnapshot clears run timestamps (a snapshot carries no duration)", () => {
    useArenaStore.getState().startConsensus();
    useArenaStore.getState().loadSnapshot(snapshot);
    const s = useArenaStore.getState();
    expect(s.runStartedAt).toBeNull();
    expect(s.runEndedAt).toBeNull();
  });
});

describe("store — seat ids", () => {
  it("never reuses an id already on a loaded panel", () => {
    const s = useArenaStore.getState();
    s.loadSnapshot(
      { ...FIXTURE_SNAPSHOT, participants: SEATS.map((p) => ({ ...p })) },
      { sharedView: false },
    );
    s.addParticipant(MODELS[0], SEATS[0].persona);
    s.addParticipant(MODELS[1], SEATS[1].persona);
    const ids = useArenaStore.getState().participants.map((p) => p.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });
});

describe("store — a run that ends mid-judge", () => {
  it("cancel drops the empty judge placeholder", () => {
    const s = useArenaStore.getState();
    s.startConsensus();
    s.startJudge("gpt-4o", "OpenAI");
    s.cancelConsensus();
    expect(useArenaStore.getState().judge).toBeNull();
    expect(useArenaStore.getState().judgeRunning).toBe(false);
  });

  it("cancelling a sweep drops it too", () => {
    const s = useArenaStore.getState();
    s.startSweep(["cvp"]);
    s.startConsensus();
    s.startJudge("gpt-4o", "OpenAI");
    s.cancelSweep();
    expect(useArenaStore.getState().judge).toBeNull();
  });

  it("a failure mid-run clears the judge / claims spinners", () => {
    const s = useArenaStore.getState();
    s.startConsensus();
    s.startJudge("gpt-4o", "OpenAI");
    s.startClaims("gpt-4o", "OpenAI");
    s.failConsensus("boom");
    const after = useArenaStore.getState();
    expect(after.judgeRunning).toBe(false);
    expect(after.claimsRunning).toBe(false);
    expect(after.judge).toBeNull();
  });

  it("a normal finish keeps the verdict", () => {
    const s = useArenaStore.getState();
    s.startConsensus();
    s.startJudge("gpt-4o", "OpenAI");
    s.completeJudge({
      modelId: "gpt-4o",
      providerName: "OpenAI",
      content: "Verdict",
      majorityPosition: "Yes",
      minorityPositions: "",
      unresolvedDisputes: "",
    });
    s.completeConsensus(80, "Done", 1);
    expect(useArenaStore.getState().judge?.content).toBe("Verdict");
  });
});

describe("store — a failed run", () => {
  it("has no final score, keeps the rounds that finished, and exports without one", () => {
    const s = useArenaStore.getState();
    s.startConsensus();
    s.startRound(1, "initial-analysis", "Initial");
    s.endRound(1, 70);
    s.startRound(2, "counterarguments", "Counter");
    s.failConsensus("Cost cap of $0.50 reached");
    const after = useArenaStore.getState();
    expect(after.isRunning).toBe(false);
    expect(after.runError).toBe("Cost cap of $0.50 reached");
    expect(after.finalScore).toBeNull();
    expect(after.roundsCompleted).toBe(1);
    expect(after.rounds.map((r) => r.completed === true)).toEqual([true, false]);
    expect(after.getSnapshot().finalScore).toBeNull();
  });

  it("is cleared by the next start, a normal finish, reset and loadSnapshot", () => {
    const s = useArenaStore.getState();
    s.startConsensus();
    s.failConsensus("boom");
    s.startConsensus();
    expect(useArenaStore.getState().runError).toBeNull();
    s.failConsensus("boom");
    s.loadSnapshot(FIXTURE_SNAPSHOT);
    expect(useArenaStore.getState().runError).toBeNull();
    s.startConsensus();
    s.failConsensus("boom");
    s.reset();
    expect(useArenaStore.getState().runError).toBeNull();
  });
});

describe("store — runOptions", () => {
  it("startConsensus records the options sent, with the engine that runs", () => {
    const s = useArenaStore.getState();
    expect(s.runOptions).toBeNull();
    s.startConsensus();
    expect(useArenaStore.getState().runOptions).toEqual({ ...DEFAULT_OPTIONS, engine: "cvp" });
    s.cancelConsensus();
    s.setRoundCount(2);
    s.startConsensus("adversarial");
    // The sweep's Red team leg runs 3 rounds even when Debate is set to 2.
    expect(useArenaStore.getState().runOptions).toEqual({
      ...DEFAULT_OPTIONS,
      engine: "adversarial",
      rounds: 3,
    });
    expect(useArenaStore.getState().options).toMatchObject({ engine: "cvp", rounds: 2 });
  });

  it("is not changed by Setup edits while the run streams", () => {
    const s = useArenaStore.getState();
    s.startConsensus();
    s.setRoundCount(2);
    s.setOption("judgeEnabled", true);
    s.setOption("extractClaimsEnabled", false);
    const after = useArenaStore.getState();
    expect(after.runOptions).toEqual({ ...DEFAULT_OPTIONS });
    expect(after.getSnapshot().options).toEqual({ ...DEFAULT_OPTIONS });
    expect(after.options).toMatchObject({ rounds: 2, judgeEnabled: true });
  });

  it("outlives the run (complete, cancel, cancelSweep); reset clears it", () => {
    const s = useArenaStore.getState();
    s.startConsensus("blind-jury");
    s.completeConsensus(70, "done", 1);
    expect(useArenaStore.getState().runOptions?.engine).toBe("blind-jury");
    s.startSweep(["cvp", "adversarial"]);
    s.startConsensus("adversarial");
    s.cancelSweep();
    expect(useArenaStore.getState().runOptions?.engine).toBe("adversarial");
    s.reset();
    expect(useArenaStore.getState().runOptions).toBeNull();
  });

  it("getSnapshot falls back to Setup's options before anything has run", () => {
    const s = useArenaStore.getState();
    s.setRoundCount(2);
    expect(s.getSnapshot()).toMatchObject({ engine: "cvp", options: { engine: "cvp", rounds: 2 } });
  });

  it("loadSnapshot takes the snapshot's options; keepOptions leaves Setup alone", () => {
    const s = useArenaStore.getState();
    const configured = s.options;
    s.loadSnapshot(FIXTURE_SNAPSHOT_JURY, { sharedView: false, keepOptions: true });
    let after = useArenaStore.getState();
    expect(after.runOptions).toEqual(FIXTURE_SNAPSHOT_JURY.options);
    expect(after.options).toBe(configured);
    expect(after.rounds).toBe(FIXTURE_SNAPSHOT_JURY.rounds);
    expect(after.prompt).toBe(FIXTURE_SNAPSHOT_JURY.prompt);
    expect(after.judge).toBe(FIXTURE_SNAPSHOT_JURY.judge);
    expect(after.getSnapshot().engine).toBe("blind-jury");
    expect(after.getSnapshot().options).toEqual(FIXTURE_SNAPSHOT_JURY.options);

    // Without keepOptions (History, permalinks) the snapshot's options load into Setup.
    s.loadSnapshot(FIXTURE_SNAPSHOT, { sharedView: false });
    after = useArenaStore.getState();
    expect(after.runOptions).toEqual(FIXTURE_SNAPSHOT.options);
    expect(after.options).toEqual(FIXTURE_SNAPSHOT.options);
  });

  it("loadSnapshot trusts the snapshot's engine over its options", () => {
    useArenaStore
      .getState()
      .loadSnapshot({ ...FIXTURE_SNAPSHOT, engine: "blind-jury" }, { sharedView: false });
    expect(useArenaStore.getState().runOptions?.engine).toBe("blind-jury");
  });

  it("dismissSweep hides the sweep but keeps its engines and results", () => {
    const s = useArenaStore.getState();
    s.startSweep(["cvp", "blind-jury"]);
    s.pushSweepResult(FIXTURE_SNAPSHOT);
    s.dismissSweep();
    const after = useArenaStore.getState();
    expect(after.sweepActive).toBe(false);
    expect(after.sweepEngines).toEqual(["cvp", "blind-jury"]);
    expect(after.sweepResults).toEqual([FIXTURE_SNAPSHOT]);
  });
});
