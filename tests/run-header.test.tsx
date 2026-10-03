import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { useArenaStore, DEFAULT_OPTIONS } from "@/lib/store";
import { FIXTURE_SNAPSHOT, FIXTURE_SNAPSHOT_JURY } from "./fixtures/snapshot";
import { resetStore } from "./helpers/store";
import RunHeader, { describeRunStatus, type RunStatusInput } from "@/components/run/RunHeader";
import * as session from "@/lib/session";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session")>();
  return {
    ...actual,
    downloadBlob: vi.fn(),
    encodeSnapshotToHash: vi.fn(async () => "rt=cFIXTURE"),
  };
});

const handlers = () => ({ onCancel: vi.fn(), onNewRun: vi.fn(), onRerun: vi.fn() });
const status = () => screen.getByRole("status");

describe("RunHeader — status line", () => {
  beforeEach(resetStore);

  it("while running: 'Running round 2 of 5' with a Stop button", () => {
    useArenaStore.setState({
      participants: FIXTURE_SNAPSHOT.participants,
      prompt: FIXTURE_SNAPSHOT.prompt,
      options: { ...DEFAULT_OPTIONS, rounds: 5 },
    });
    const s = useArenaStore.getState();
    s.startConsensus();
    s.startRound(1, "initial-analysis", "Initial");
    s.startRound(2, "counterarguments", "Counter");
    const h = handlers();
    render(<RunHeader {...h} />);
    expect(status()).toHaveTextContent("Running round 2 of 5");
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(h.onCancel).toHaveBeenCalledTimes(1);
    // No export / re-run while running.
    expect(screen.queryByRole("button", { name: "Export" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-run" })).not.toBeInTheDocument();
    expect(screen.getByText("Debate (CVP)")).toBeInTheDocument();
  });

  it("during a sweep: 'Engine 2 of 3 · Blind jury'", () => {
    useArenaStore.setState({ participants: FIXTURE_SNAPSHOT.participants, prompt: "q" });
    const s = useArenaStore.getState();
    s.startSweep(["cvp", "blind-jury", "adversarial"]);
    s.pushSweepResult(FIXTURE_SNAPSHOT);
    s.setSweepCurrentIndex(1);
    s.startConsensus("blind-jury");
    s.startRound(1, "initial-analysis", "Independent Verdicts");
    render(<RunHeader {...handlers()} />);
    expect(status()).toHaveTextContent("Engine 2 of 3 · Blind jury");
    expect(status()).toHaveTextContent("Running round 1 of 1");
    expect(screen.getByText("Engine sweep")).toBeInTheDocument();
  });

  it("names the engine that ran — a stopped Red team leg — not the configured one", () => {
    useArenaStore.setState({
      participants: FIXTURE_SNAPSHOT.participants,
      prompt: "q",
      options: { ...DEFAULT_OPTIONS, rounds: 2 },
    });
    const s = useArenaStore.getState();
    s.startSweep(["cvp", "blind-jury", "adversarial"]);
    s.setSweepCurrentIndex(2);
    s.startConsensus("adversarial");
    s.startRound(1, "initial-analysis", "Initial Positions");
    render(<RunHeader {...handlers()} />);
    expect(status()).toHaveTextContent("Engine 3 of 3 · Red team");
    // Red team runs at least 3 rounds even when Debate is set to 2.
    expect(status()).toHaveTextContent("Running round 1 of 3");

    act(() => useArenaStore.getState().cancelSweep());
    expect(screen.getByText("Red team")).toBeInTheDocument();
    expect(screen.queryByText("Debate (CVP)")).not.toBeInTheDocument();
    expect(screen.queryByText("Engine sweep")).not.toBeInTheDocument();
    expect(status()).toHaveTextContent(/^Stopped/);
  });

  it("after opening one engine of a finished sweep: that engine's name and status", () => {
    useArenaStore.setState({ participants: FIXTURE_SNAPSHOT.participants, prompt: "q" });
    const s = useArenaStore.getState();
    s.startSweep(["cvp", "blind-jury"]);
    s.pushSweepResult(FIXTURE_SNAPSHOT);
    s.pushSweepResult(FIXTURE_SNAPSHOT_JURY);
    render(<RunHeader {...handlers()} />);
    expect(screen.getByText("Engine sweep")).toBeInTheDocument();
    expect(status()).toHaveTextContent(/^Sweep complete · 2 engines/);

    act(() => {
      s.dismissSweep();
      s.loadSnapshot(FIXTURE_SNAPSHOT_JURY, { sharedView: false, keepOptions: true });
    });
    expect(screen.getByText("Blind jury")).toBeInTheDocument();
    expect(screen.queryByText("Engine sweep")).not.toBeInTheDocument();
    expect(status()).toHaveTextContent(/^Complete/);
    expect(useArenaStore.getState().options.engine).toBe("cvp");
  });

  it("when complete: 'Complete · 1m 42s · $0.56' plus export / re-run / new run", () => {
    useArenaStore.getState().loadSnapshot(FIXTURE_SNAPSHOT, { sharedView: false });
    useArenaStore.setState({
      runStartedAt: 1_000,
      runEndedAt: 103_000,
      tokenTotal: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUSD: 0.56 },
    });
    const h = handlers();
    render(<RunHeader {...h} />);
    expect(status()).toHaveTextContent("Complete · 1m 42s · $0.56");
    expect(screen.queryByText("Shared run (read-only)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Re-run" }));
    fireEvent.click(screen.getByRole("button", { name: "New run" }));
    expect(h.onRerun).toHaveBeenCalledTimes(1);
    expect(h.onNewRun).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
    // Panel shows each persona.
    const panel = screen.getByRole("list", { name: "Panel" });
    expect(panel).toHaveTextContent("Risk Analyst");
    expect(panel).toHaveTextContent("Optimistic Futurist");
    expect(panel).toHaveTextContent("First-Principles Engineer");
  });

  it("in a shared view: read-only badge, no Re-run, duration omitted", () => {
    useArenaStore.getState().loadSnapshot(FIXTURE_SNAPSHOT);
    render(<RunHeader {...handlers()} />);
    expect(screen.getByText("Shared run (read-only)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-run" })).not.toBeInTheDocument();
    expect(status()).toHaveTextContent(/^Complete · \$0\.13$/);
  });

  it("truncates a long question with an expand toggle", () => {
    useArenaStore.getState().loadSnapshot(FIXTURE_SNAPSHOT);
    render(<RunHeader {...handlers()} />);
    const q = screen.getByRole("heading", { level: 1 });
    expect(q).toHaveClass("line-clamp-2");
    const toggle = screen.getByRole("button", { name: "Show full question" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(q).not.toHaveClass("line-clamp-2");
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("disables Re-run without a runnable setup and shows a failure", () => {
    useArenaStore.setState({ prompt: "short", participants: [FIXTURE_SNAPSHOT.participants[0]] });
    useArenaStore.getState().startConsensus();
    useArenaStore.getState().failConsensus("HTTP 500");
    render(<RunHeader {...handlers()} />);
    expect(screen.getByRole("button", { name: "Re-run" })).toBeDisabled();
    expect(status()).toHaveTextContent("Failed · HTTP 500");
    expect(screen.queryByRole("button", { name: "Show full question" })).not.toBeInTheDocument();
  });
});

describe("describeRunStatus", () => {
  const base: RunStatusInput = {
    isRunning: false,
    currentRound: 0,
    engine: "cvp",
    configuredRounds: 5,
    judgeRunning: false,
    claimsRunning: false,
    sweepActive: false,
    sweepEngines: [],
    sweepCurrentIndex: 0,
    sweepResults: [],
    finalScore: null,
    runError: null,
    roundCount: 0,
    runStartedAt: null,
    runEndedAt: null,
    costUSD: 0,
  };

  it("covers every phase", () => {
    expect(describeRunStatus(base)).toEqual({ kind: "idle", text: "Not started" });
    expect(describeRunStatus({ ...base, isRunning: true }).text).toBe("Starting");
    expect(
      describeRunStatus({ ...base, isRunning: true, currentRound: 5, judgeRunning: true }).text,
    ).toBe("Writing judge synthesis");
    expect(
      describeRunStatus({ ...base, isRunning: true, currentRound: 5, claimsRunning: true }).text,
    ).toBe("Extracting contradictions");
    expect(
      describeRunStatus({ ...base, isRunning: true, currentRound: 1, engine: "blind-jury" }).text,
    ).toBe("Running round 1 of 1");
    expect(
      describeRunStatus({
        ...base,
        isRunning: true,
        currentRound: 1,
        engine: "adversarial",
        configuredRounds: 2,
      }).text,
    ).toBe("Running round 1 of 3");
    expect(
      describeRunStatus({
        ...base,
        roundCount: 2,
        runStartedAt: 0,
        runEndedAt: 42_000,
        costUSD: 0.005,
      }),
    ).toEqual({ kind: "stopped", text: "Stopped · 42s · $0.0050" });
    expect(
      describeRunStatus({
        ...base,
        sweepActive: true,
        sweepEngines: ["cvp", "blind-jury"],
        sweepResults: [FIXTURE_SNAPSHOT, FIXTURE_SNAPSHOT_JURY],
        finalScore: 74,
      }),
    ).toEqual({ kind: "complete", text: "Sweep complete · 2 engines · $0.16" });
    expect(describeRunStatus({ ...base, finalScore: 80, costUSD: 0 }).text).toBe("Complete");
  });
});

describe("Export menu", () => {
  beforeEach(() => {
    resetStore();
    vi.mocked(session.downloadBlob).mockClear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    useArenaStore.getState().loadSnapshot(FIXTURE_SNAPSHOT);
  });

  it("downloads Markdown and JSON of the current snapshot", () => {
    render(<RunHeader {...handlers()} />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Download Markdown/ }));
    expect(session.downloadBlob).toHaveBeenLastCalledWith(
      expect.stringMatching(/^roundtable-should-an-early-stage-startup.*\.md$/),
      expect.stringContaining("# RoundTable Session"),
      "text/markdown",
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Download JSON/ }));
    const [name, data, mime] = vi.mocked(session.downloadBlob).mock.calls.at(-1)!;
    expect(name).toMatch(/\.json$/);
    expect(JSON.parse(data).rounds).toHaveLength(4);
    expect(mime).toBe("application/json");
    expect(toast.success).toHaveBeenCalledWith("JSON downloaded");
  });

  it("copies a permalink and reports failures", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<RunHeader {...handlers()} />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Copy permalink/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toMatch(/#rt=cFIXTURE$/);
    expect(toast.success).toHaveBeenCalledWith("Permalink copied to clipboard");

    writeText.mockRejectedValueOnce(new Error("denied"));
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Copy permalink/ }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn’t copy the permalink — the clipboard is unavailable",
      ),
    );

    // No clipboard API at all (plain-http hosts) reports the same way.
    Object.assign(navigator, { clipboard: undefined });
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Copy permalink/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2));

    vi.spyOn(session, "encodeSnapshotToHash").mockRejectedValueOnce(new Error("boom"));
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Copy permalink/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to build permalink"));
  });
});
