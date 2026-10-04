// Page: "Run all three engines" — per-engine labels, the Compare
// engines table, history saves, cancel and failure mid-sweep.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import HomePage from "@/app/page";
import { useArenaStore, DEFAULT_OPTIONS } from "@/lib/store";
import { clearHistory, listRuns } from "@/lib/history";
import type { EngineType } from "@/lib/types";
import {
  MODELS,
  SEATS,
  completeRun,
  installServer,
  openingEvents,
  type FakeServer,
} from "./helpers/page-harness";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div data-testid="md">{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));

const SCORES: Record<EngineType, number> = { cvp: 82, "blind-jury": 64, adversarial: 45 };
const ENGINES: EngineType[] = ["cvp", "blind-jury", "adversarial"];
let server: FakeServer;

/** Answer each engine with its own score and a tag naming the engine. */
const answerByEngine = (req: { options: { engine?: EngineType } }) => {
  const engine = req.options.engine!;
  return completeRun({ score: SCORES[engine], tag: `[${engine}] ` });
};

beforeEach(() => {
  vi.clearAllMocks();
  server = installServer();
  useArenaStore.setState(useArenaStore.getInitialState(), true);
  useArenaStore.setState({
    participants: SEATS,
    prompt: "Which database should we pick?",
    options: { ...DEFAULT_OPTIONS, judgeEnabled: true, judgeModelId: MODELS[0].id },
  });
  localStorage.clear();
  clearHistory();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  useArenaStore.getState().cancelSweep();
});

async function renderPage() {
  render(<HomePage />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Run all three engines" })).toBeEnabled(),
  );
}

const compareRows = () =>
  within(screen.getByRole("region", { name: "Compare engines" }))
    .getAllByRole("row")
    .slice(1);

/** The run header (question, engine badge, panel, status line). */
const runHeader = () => screen.getByRole("heading", { level: 1 }).closest("header")!;

describe("HomePage — engine sweep", () => {
  it("runs all three engines and labels every result with the engine that ran", async () => {
    server.onRun = (req, live) => {
      live.push(answerByEngine(req));
      live.close();
    };
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Run all three engines" }));
    expect(useArenaStore.getState().view).toBe("run");

    await waitFor(() => expect(useArenaStore.getState().sweepResults).toHaveLength(3));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Sweep complete — compare the engines in the Run view.",
      ),
    );

    // One request per engine, in order, each with its engine override.
    expect(server.requests.map((r) => r.options.engine)).toEqual(ENGINES);
    // Each snapshot carries the engine that actually ran — not the user's pick.
    const results = useArenaStore.getState().sweepResults;
    expect(results.map((r) => r.engine)).toEqual(ENGINES);
    expect(results.map((r) => r.options.engine)).toEqual(ENGINES);
    expect(results.map((r) => r.finalScore)).toEqual([82, 64, 45]);
    expect(results[1].judge?.majorityPosition).toBe("[blind-jury] Majority verdict.");
    // The user's configured engine is untouched.
    expect(useArenaStore.getState().options.engine).toBe("cvp");

    // Compare engines: one row per engine with its own score, label and verdict.
    const rows = compareRows();
    expect(rows.map((r) => within(r).getByRole("rowheader").textContent)).toEqual([
      "Debate (CVP)",
      "Blind jury",
      "Red team",
    ]);
    expect(rows[0]).toHaveTextContent("82");
    expect(rows[0]).toHaveTextContent("Strong agreement");
    expect(rows[0]).toHaveTextContent("[cvp] Majority verdict.");
    expect(rows[1]).toHaveTextContent("64");
    expect(rows[1]).toHaveTextContent("Broad agreement with reservations");
    expect(rows[1]).toHaveTextContent("[blind-jury] Majority verdict.");
    expect(rows[2]).toHaveTextContent("45");
    expect(rows[2]).toHaveTextContent("Split");
    expect(rows[2]).toHaveTextContent("[adversarial] Majority verdict.");
    expect(screen.getByText("3 of 3 done")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/^Sweep complete · 3 engines/);

    // Every engine is saved once, under its own engine.
    const saved = listRuns();
    expect(saved.map((e) => [e.engine, e.score])).toEqual([
      ["adversarial", 45],
      ["blind-jury", 64],
      ["cvp", 82],
    ]);
    expect(saved.map((e) => e.snapshot.options.engine)).toEqual([
      "adversarial",
      "blind-jury",
      "cvp",
    ]);
    expect(
      vi.mocked(toast.success).mock.calls.filter(([m]) => m === "Saved to history"),
    ).toHaveLength(3);
    // Single-run completion toasts are left out during a sweep.
    expect(toast.success).not.toHaveBeenCalledWith(expect.stringMatching(/^Consensus complete/));
    expect(screen.getByRole("tab", { name: /^History 3 saved runs$/ })).toBeInTheDocument();

    // The run on screen is the last leg: Export / permalink must say Red team.
    const live = useArenaStore.getState();
    expect(live.runOptions?.engine).toBe("adversarial");
    expect(live.getSnapshot().engine).toBe("adversarial");
    expect(live.getSnapshot().options.engine).toBe("adversarial");
    expect(within(runHeader()).getByText("Engine sweep")).toBeInTheDocument();
    const configured = live.options;

    // Open one engine's run from the table: it is labelled with its own
    // engine, the sweep status goes away, the table stays, and the user's
    // Setup options are kept.
    fireEvent.click(screen.getByRole("button", { name: "Open Blind jury run" }));
    const s = useArenaStore.getState();
    expect(s.finalScore).toBe(64);
    expect(s.runOptions?.engine).toBe("blind-jury");
    expect(s.options).toBe(configured);
    expect(s.options.engine).toBe("cvp");
    expect(s.getSnapshot().engine).toBe("blind-jury");
    expect(s.getSnapshot().options.engine).toBe("blind-jury");
    expect(s.sharedView).toBe(false);
    expect(s.sweepActive).toBe(false);
    expect(within(runHeader()).getByText("Blind jury")).toBeInTheDocument();
    expect(within(runHeader()).queryByText("Engine sweep")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/^Complete/);
    expect(screen.getByRole("region", { name: "Consensus score" })).toHaveTextContent("64");
    expect(screen.getByRole("region", { name: "Compare engines" })).toBeInTheDocument();
    expect(compareRows()).toHaveLength(3);
    expect(screen.getByText("3 of 3 done")).toBeInTheDocument();

    // Another row relabels again; Setup still shows the user's engine.
    fireEvent.click(screen.getByRole("button", { name: "Open Red team run" }));
    expect(useArenaStore.getState().finalScore).toBe(45);
    expect(within(runHeader()).getByText("Red team")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /^Setup/ }));
    expect(screen.getByRole("radio", { name: /Debate \(CVP\)/ })).toBeChecked();
  });

  it("runs the Red team leg with at least 3 rounds when Debate is set to fewer", async () => {
    useArenaStore.getState().setRoundCount(2);
    server.onRun = (req, live) => {
      live.push(answerByEngine(req));
      live.close();
    };
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Run all three engines" }));
    await waitFor(() => expect(useArenaStore.getState().sweepResults).toHaveLength(3));

    expect(server.requests.map((r) => [r.options.engine, r.options.rounds])).toEqual([
      ["cvp", 2],
      ["blind-jury", 2],
      ["adversarial", 3],
    ]);
    const s = useArenaStore.getState();
    expect(s.sweepResults[2].options.rounds).toBe(3);
    expect(listRuns().find((e) => e.engine === "adversarial")?.snapshot.options.rounds).toBe(3);
    // The user's configuration is untouched.
    expect(s.options.rounds).toBe(2);
  });

  it("Re-run uses the engine of the run on screen, not Setup's", async () => {
    server.onRun = (req, live) => {
      live.push(answerByEngine(req));
      live.close();
    };
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Run all three engines" }));
    await waitFor(() => expect(useArenaStore.getState().sweepResults).toHaveLength(3));

    fireEvent.click(screen.getByRole("button", { name: "Open Blind jury run" }));
    fireEvent.click(screen.getByRole("button", { name: "Re-run" }));
    await waitFor(() => expect(server.requests).toHaveLength(4));
    expect(server.requests[3].options.engine).toBe("blind-jury");
    expect(useArenaStore.getState().options.engine).toBe("cvp");
  });

  it("Esc mid-sweep labels the run with the engine that was running", async () => {
    server.onRun = (req, live, i) => {
      if (i === 0) {
        live.push(answerByEngine(req));
        live.close();
      } else {
        live.push(openingEvents("[blind-jury] "));
      }
    };
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Run all three engines" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Engine 2 of 3 · Blind jury"),
    );

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(useArenaStore.getState().isRunning).toBe(false));

    const s = useArenaStore.getState();
    expect(s.options.engine).toBe("cvp");
    expect(s.runOptions?.engine).toBe("blind-jury");
    expect(s.getSnapshot().engine).toBe("blind-jury");
    expect(within(runHeader()).getByText("Blind jury")).toBeInTheDocument();
    expect(within(runHeader()).queryByText("Debate (CVP)")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/^Stopped/);
  });

  it("shows engine progress, won't open results mid-sweep, and Stop keeps finished engines", async () => {
    server.onRun = (req, live, i) => {
      if (i === 0) {
        live.push(answerByEngine(req));
        live.close();
      } else {
        live.push(openingEvents());
      }
    };
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Run all three engines" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Engine 2 of 3 · Blind jury"),
    );
    expect(compareRows().map((r) => r.textContent)).toEqual([
      expect.stringContaining("82"),
      expect.stringContaining("Running…"),
      expect.stringContaining("Queued"),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Open Debate (CVP) run" }));
    expect(toast.info).toHaveBeenCalledWith(
      "Wait for the sweep to finish, or stop it, to open one engine's run.",
    );
    expect(useArenaStore.getState().isRunning).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(toast.info).toHaveBeenCalledWith("Sweep stopped");
    await waitFor(() => expect(useArenaStore.getState().isRunning).toBe(false));

    const s = useArenaStore.getState();
    expect(s.sweepActive).toBe(false);
    expect(s.sweepResults.map((r) => r.engine)).toEqual(["cvp"]);
    expect(server.requests).toHaveLength(2); // Red team never started
    expect(screen.getByText("1 of 3 done")).toBeInTheDocument();
    expect(compareRows()[1]).toHaveTextContent("Stopped before finishing");
    expect(compareRows()[2]).toHaveTextContent("Not run");
    expect(listRuns().map((e) => e.engine)).toEqual(["cvp"]);
    expect(toast.error).not.toHaveBeenCalled();

    // Now that nothing runs, a finished engine opens.
    fireEvent.click(screen.getByRole("button", { name: "Open Debate (CVP) run" }));
    expect(useArenaStore.getState().finalScore).toBe(82);
  });

  it("Esc and the Setup view's Stop sweep both cancel the sweep", async () => {
    server.onRun = (_req, live) => live.push(openingEvents());
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Run all three engines" }));
    await waitFor(() => expect(server.streams).toHaveLength(1));

    fireEvent.click(screen.getByRole("tab", { name: /^Setup/ }));
    fireEvent.click(screen.getByRole("button", { name: "Stop sweep" }));
    expect(toast.info).toHaveBeenCalledWith("Sweep stopped");
    await waitFor(() => expect(useArenaStore.getState().isRunning).toBe(false));
    expect(useArenaStore.getState().sweepActive).toBe(false);

    // A fresh sweep, stopped with Esc this time.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Run all three engines" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Run all three engines" }));
    await waitFor(() => expect(server.streams).toHaveLength(2));
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(useArenaStore.getState().isRunning).toBe(false));
    expect(useArenaStore.getState().sweepActive).toBe(false);
    expect(server.requests).toHaveLength(2);
  });

  it("stops at an engine that fails and keeps the ones that finished", async () => {
    server.onRun = (req, live, i) => {
      live.push(
        i === 0 ? answerByEngine(req) : [...openingEvents(), { type: "error", message: "boom" }],
      );
      live.close();
    };
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Run all three engines" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Sweep stopped: Blind jury failed."),
    );
    expect(toast.error).toHaveBeenCalledWith("boom");
    expect(server.requests).toHaveLength(2);
    const s = useArenaStore.getState();
    expect(s.sweepResults.map((r) => r.engine)).toEqual(["cvp"]);
    expect(listRuns().map((e) => e.engine)).toEqual(["cvp"]);
    expect(compareRows().map((r) => r.textContent)).toEqual([
      expect.stringContaining("82"),
      expect.stringContaining("Stopped before finishing"),
      expect.stringContaining("Not run"),
    ]);
    expect(toast.success).not.toHaveBeenCalledWith(expect.stringMatching(/^Sweep complete/));

    // A single run afterwards clears the old sweep.
    server.onRun = (_req, live) => {
      live.push(completeRun({ score: 70 }));
      live.close();
    };
    fireEvent.click(screen.getByRole("button", { name: "Re-run" }));
    await waitFor(() => expect(useArenaStore.getState().finalScore).toBe(70));
    expect(useArenaStore.getState().sweepActive).toBe(false);
    expect(screen.queryByRole("region", { name: "Compare engines" })).not.toBeInTheDocument();
  });
});
