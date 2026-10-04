// Page: a single run end to end — SSE → store → Run view, errors,
// cancel (Stop / Esc), background streaming, New run, Re-run, export.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import HomePage from "@/app/page";
import { useArenaStore, DEFAULT_OPTIONS } from "@/lib/store";
import { clearHistory, listRuns } from "@/lib/history";
import * as session from "@/lib/session";
import { saveCompletedRun } from "@/components/history/useHistory";
import { FIXTURE_SNAPSHOT } from "./fixtures/snapshot";
import {
  MODELS,
  SEATS,
  closingEvents,
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
vi.mock("@/lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session")>();
  return { ...actual, downloadBlob: vi.fn() };
});

const QUESTION = "Should we ship it this quarter?";
let server: FakeServer;

beforeEach(() => {
  vi.clearAllMocks();
  server = installServer();
  useArenaStore.setState(useArenaStore.getInitialState(), true);
  useArenaStore.setState({
    participants: SEATS,
    prompt: `  ${QUESTION}  `,
    options: { ...DEFAULT_OPTIONS, judgeEnabled: true, judgeModelId: MODELS[0].id },
  });
  localStorage.clear();
  clearHistory();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  useArenaStore.getState().cancelConsensus();
});

async function renderPage() {
  const utils = render(<HomePage />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
  return utils;
}

/** Start a run from Setup; resolves once the request reached the server. */
async function startRun() {
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
  await waitFor(() => expect(server.streams).toHaveLength(1));
  return server.streams[0];
}

const runStatus = () => screen.getByRole("status");
const tab = (name: RegExp) => screen.getByRole("tab", { name });
const transcript = () => document.getElementById("run-pane-panel-transcript")!;
const lastSignal = () => (server.fetch.mock.calls.at(-1)![1] as RequestInit).signal!;

describe("HomePage — run", () => {
  it("streams a run into the Run view: the brief first, the transcript as evidence", async () => {
    await renderPage();
    const live = await startRun();

    expect(useArenaStore.getState().view).toBe("run");
    expect(tab(/^Run/)).toHaveAttribute("aria-selected", "true");
    expect(toast.info).toHaveBeenCalledWith("Run started — Esc stops it");
    expect(server.requests[0]).toEqual({
      prompt: QUESTION,
      participants: SEATS,
      options: { ...DEFAULT_OPTIONS, judgeEnabled: true, judgeModelId: MODELS[0].id },
    });

    // Live: round 1 opens and p-1 streams into its card.
    live.push(openingEvents());
    await waitFor(() => expect(runStatus()).toHaveTextContent("Running round 1 of 5"));
    await waitFor(() => expect(transcript()).toHaveTextContent("Thinking out loud"));
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();

    live.push(closingEvents({ score: 80 }));
    live.close();
    await waitFor(() => expect(useArenaStore.getState().finalScore).toBe(80));

    // Brief: score + label, judge verdict, where they split.
    const score = screen.getByRole("region", { name: "Consensus score" });
    expect(score).toHaveTextContent("80");
    expect(score).toHaveTextContent("Strong agreement");
    expect(screen.getByRole("region", { name: "Judge synthesis" })).toHaveTextContent(
      "Majority verdict.",
    );
    expect(screen.getByRole("region", { name: "Where they split" })).toHaveTextContent(
      "Whether it is worth it",
    );
    // Transcript: one anchored card per participant.
    expect(document.getElementById("r1-p-1")).toHaveTextContent("Answer from p-1");
    expect(document.getElementById("r1-p-2")).toHaveTextContent("Answer from p-2");
    expect(runStatus()).toHaveTextContent(/^Complete/);
    expect(screen.getByRole("button", { name: "Re-run" })).toBeEnabled();

    // Toasts, and the run is in history exactly once.
    expect(toast.success).toHaveBeenCalledWith("Consensus complete! Score: 80%");
    expect(toast.success).toHaveBeenCalledWith("Saved to history");
    const runs = listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ engine: "cvp", score: 80 });
    expect(runs[0].snapshot.prompt).toBe(`  ${QUESTION}  `);
    expect(tab(/^History 1 saved run$/)).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("applies every event type, including disagreements and early stop", async () => {
    await renderPage();
    const live = await startRun();
    live.push([
      ...openingEvents(),
      {
        type: "disagreements",
        round: 1,
        disagreements: [
          {
            id: "r1-p-1-p-2",
            round: 1,
            participantAId: "p-1",
            participantBId: "p-2",
            severity: 25,
            label: "Timing split",
          },
        ],
      },
      { type: "early-stop", round: 1, delta: 2, reason: "converged" },
    ]);
    // Malformed and non-data lines are skipped.
    live.push("data: {not json}\n\n: keep-alive\n\n");
    live.push(closingEvents({ score: 55 }));
    live.close();
    await waitFor(() => expect(useArenaStore.getState().finalScore).toBe(55));

    const s = useArenaStore.getState();
    expect(s.disagreements).toHaveLength(1);
    expect(s.earlyStopped).toEqual({ round: 1, delta: 2, reason: "converged" });
    expect(s.judge?.majorityPosition).toBe("Majority verdict.");
    expect(s.claims?.contradictions).toHaveLength(1);
    expect(s.tokenTotal.totalTokens).toBe(1800);
    expect(screen.getByRole("region", { name: "Consensus score" })).toHaveTextContent("Split");
    expect(screen.getByRole("region", { name: "Confidence-spread flags" })).toHaveTextContent(
      "Timing split",
    );
  });

  it("parses a final event that arrives without a trailing newline", async () => {
    await renderPage();
    const live = await startRun();
    const events = completeRun({ score: 61 });
    const last = events.pop()!;
    live.push(events);
    live.push(`data: ${JSON.stringify(last)}`);
    live.close();
    await waitFor(() => expect(useArenaStore.getState().finalScore).toBe(61));
    expect(useArenaStore.getState().isRunning).toBe(false);
  });

  it("reports a failed claim extraction without failing the run", async () => {
    await renderPage();
    const live = await startRun();
    const events = completeRun({ score: 74, claims: false });
    const complete = events.pop()!;
    live.push([
      ...events,
      { type: "claims-start", modelId: "gpt-4o", providerName: "OpenAI" },
      {
        type: "claims-end",
        digest: {
          modelId: "gpt-4o",
          providerName: "OpenAI",
          rawContent: "",
          contradictions: [],
          error: "extractor timed out",
        },
      },
      complete,
    ]);
    live.close();
    await waitFor(() => expect(useArenaStore.getState().finalScore).toBe(74));
    expect(toast.error).toHaveBeenCalledWith("Claim extraction failed: extractor timed out");
    expect(screen.getByRole("region", { name: "Where they split" })).toHaveTextContent(
      "extractor timed out",
    );
    expect(listRuns()).toHaveLength(1);
  });

  it("shows a provider error on one answer as a toast and a danger card", async () => {
    await renderPage();
    const live = await startRun();
    live.push([
      { type: "round-start", round: 1, roundType: "initial-analysis", label: "Initial analysis" },
      { type: "participant-start", participantId: "p-1", round: 1 },
      {
        type: "participant-end",
        participantId: "p-1",
        round: 1,
        confidence: 0,
        fullContent: "[Error from OpenAI / gpt-4o: Not Found — HTTP 404]",
        durationMs: 20,
        error: "Not Found — HTTP 404",
      },
    ]);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("OpenAI / gpt-4o: Not Found — HTTP 404"),
    );
    const card = document.getElementById("r1-p-1")!;
    expect(card).toHaveTextContent("Not Found — HTTP 404");
    expect(useArenaStore.getState().rounds[0].responses[0].error).toBe("Not Found — HTTP 404");
  });

  it("an error event ends the run with a toast and is not saved", async () => {
    await renderPage();
    const live = await startRun();
    live.push([...openingEvents(), { type: "error", message: "Cost cap of $0.10 exceeded" }]);
    live.close();

    await waitFor(() => expect(useArenaStore.getState().isRunning).toBe(false));
    expect(toast.error).toHaveBeenCalledWith("Cost cap of $0.10 exceeded");
    expect(runStatus()).toHaveTextContent("Failed");
    expect(listRuns()).toHaveLength(0);
    expect(toast.success).not.toHaveBeenCalledWith("Saved to history");
    expect(tab(/^History$/)).toBeInTheDocument();
  });

  it("surfaces the server's message for an HTTP error", async () => {
    server.onRun = () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: "Rate limit exceeded. Try again in a minute." }),
    });
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Consensus failed: Rate limit exceeded. Try again in a minute.",
      ),
    );
    const s = useArenaStore.getState();
    expect(s.isRunning).toBe(false);
    expect(s.runError).toBe("Rate limit exceeded. Try again in a minute.");
    expect(s.finalScore).toBeNull();
  });

  it("falls back to the status code when the error body is not JSON", async () => {
    server.onRun = () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Consensus failed: HTTP 502"));
  });

  it("fails the run when the stream closes before it finishes", async () => {
    await renderPage();
    const live = await startRun();
    live.push(openingEvents());
    live.close();
    await waitFor(() => expect(useArenaStore.getState().isRunning).toBe(false));
    expect(toast.error).toHaveBeenCalledWith(
      "Consensus failed: the stream ended before the run finished",
    );
    expect(listRuns()).toHaveLength(0);
  });

  it("Stop in the run header cancels the stream without an error", async () => {
    await renderPage();
    const live = await startRun();
    live.push(openingEvents());
    await waitFor(() => expect(runStatus()).toHaveTextContent("Running round 1 of 5"));

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(toast.info).toHaveBeenCalledWith("Run stopped");
    expect(lastSignal().aborted).toBe(true);
    await waitFor(() => expect(runStatus()).toHaveTextContent(/^Stopped/));
    expect(useArenaStore.getState().isRunning).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
    expect(listRuns()).toHaveLength(0);
  });

  it("Esc cancels a live run, unless something else already handled it", async () => {
    await renderPage();
    const live = await startRun();
    live.push(openingEvents());

    const handled = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    handled.preventDefault();
    window.dispatchEvent(handled);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(useArenaStore.getState().isRunning).toBe(true);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(useArenaStore.getState().isRunning).toBe(false);
    expect(lastSignal().aborted).toBe(true);
    expect(toast.info).toHaveBeenCalledWith("Run stopped");

    // Nothing left to cancel: Esc is a no-op.
    vi.mocked(toast.info).mockClear();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("keeps streaming while the user browses Setup and History, then lands in both", async () => {
    await renderPage();
    const live = await startRun();
    live.push(openingEvents());

    fireEvent.click(tab(/^Setup/));
    const bar = screen.getByRole("region", { name: "Estimate and run" });
    await waitFor(() => expect(bar).toHaveTextContent("Running round 1 of"));
    expect(within(bar).getByRole("button", { name: "Stop" })).toBeInTheDocument();

    fireEvent.click(tab(/^History/));
    expect(lastSignal().aborted).toBe(false);
    live.push(closingEvents({ score: 88 }));
    live.close();

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Saved to history"));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("article", { name: QUESTION })).toBeInTheDocument();

    fireEvent.click(tab(/^Run/));
    expect(screen.getByRole("region", { name: "Consensus score" })).toHaveTextContent("88");
  });

  it("does not open a saved run over a live one", async () => {
    saveCompletedRun(FIXTURE_SNAPSHOT);
    await renderPage();
    const live = await startRun();
    live.push(openingEvents());

    fireEvent.click(tab(/^History/));
    const row = screen.getByRole("article", { name: /early-stage startup/ });
    fireEvent.click(within(row).getByRole("button", { name: /^Open/ }));
    expect(toast.info).toHaveBeenCalledWith(
      "A run is in progress — stop it before opening a saved run.",
    );
    expect(useArenaStore.getState().isRunning).toBe(true);
    expect(useArenaStore.getState().prompt).toBe(`  ${QUESTION}  `);
    expect(useArenaStore.getState().view).toBe("history");
  });

  it("New run stops a live run and returns to Setup with the question kept", async () => {
    await renderPage();
    const live = await startRun();
    live.push(openingEvents());

    fireEvent.click(screen.getByRole("button", { name: "New run" }));
    expect(toast.info).toHaveBeenCalledWith("Run stopped");
    expect(lastSignal().aborted).toBe(true);
    expect(useArenaStore.getState().view).toBe("setup");
    expect(screen.getByRole("textbox", { name: "Question" })).toHaveValue(`  ${QUESTION}  `);
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
  });

  it("Re-run streams the same question and panel again", async () => {
    server.onRun = (_req, live, i) => {
      live.push(completeRun({ score: i === 0 ? 80 : 66 }));
      live.close();
    };
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(useArenaStore.getState().finalScore).toBe(80));

    fireEvent.click(screen.getByRole("button", { name: "Re-run" }));
    await waitFor(() => expect(useArenaStore.getState().finalScore).toBe(66));
    expect(server.requests).toHaveLength(2);
    expect(server.requests[1]).toEqual(server.requests[0]);
    expect(listRuns()).toHaveLength(2);
  });

  it("exports the finished run as Markdown / JSON and copies a permalink", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    server.onRun = (_req, live) => {
      live.push(completeRun({ score: 80 }));
      live.close();
    };
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(useArenaStore.getState().finalScore).toBe(80));

    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Download Markdown/ }));
    expect(session.downloadBlob).toHaveBeenLastCalledWith(
      expect.stringMatching(/^roundtable-should-we-ship-it.*\.md$/),
      expect.stringContaining("Answer from p-1"),
      "text/markdown",
    );

    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Download JSON/ }));
    const [, json] = vi.mocked(session.downloadBlob).mock.calls.at(-1)!;
    expect(JSON.parse(json)).toMatchObject({ v: 1, engine: "cvp", finalScore: 80 });

    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Copy permalink/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const url = writeText.mock.calls[0][0] as string;
    expect(url).toContain("#rt=");
    // The permalink round-trips to the same run.
    const snap = await session.decodeSnapshotFromHash(url.slice(url.indexOf("#")));
    expect(snap?.finalScore).toBe(80);
  });
});

/** Every event of a complete run up to and including the first judge token. */
const upToJudgeToken = () => {
  const events = completeRun();
  return events.slice(0, events.findIndex((e) => e.type === "judge-token") + 1);
};

describe("HomePage — a run that ends mid-judge", () => {
  it("Stop during the judge shows no phantom verdict", async () => {
    await renderPage();
    const live = await startRun();
    live.push(upToJudgeToken());
    await waitFor(() => expect(useArenaStore.getState().judgeRunning).toBe(true));
    fireEvent.click(screen.getAllByRole("button", { name: /^Stop/ })[0]);
    expect(await screen.findByText("No judge verdict was produced for this run.")).toBeVisible();
    expect(screen.queryByText("Writing…")).not.toBeInTheDocument();
  });

  it("a server error during the judge stops the “Writing…” spinner", async () => {
    await renderPage();
    const live = await startRun();
    live.push(upToJudgeToken());
    await waitFor(() => expect(useArenaStore.getState().judgeRunning).toBe(true));
    live.push([{ type: "error", message: "boom" }]);
    await waitFor(() => expect(useArenaStore.getState().isRunning).toBe(false));
    expect(screen.queryByText("Writing…")).not.toBeInTheDocument();
    expect(runStatus()).toHaveTextContent("Failed · boom");
  });
});

describe("HomePage — Esc in a text field", () => {
  it("clears the History search box instead of stopping the background run", async () => {
    saveCompletedRun(FIXTURE_SNAPSHOT);
    await renderPage();
    const live = await startRun();
    live.push(openingEvents());
    fireEvent.click(tab(/^History/));

    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Search runs" }), { key: "Escape" });
    expect(useArenaStore.getState().isRunning).toBe(true);

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(useArenaStore.getState().isRunning).toBe(false);
  });
});

describe("HomePage — history save failure", () => {
  const SAVE_FAILED = "Couldn't save to history (storage unavailable or full)";

  it("tells the user when a finished run can't be saved", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    try {
      await renderPage();
      const live = await startRun();
      live.push(completeRun({ score: 77 }));
      live.close();
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(SAVE_FAILED));
      expect(toast.success).not.toHaveBeenCalledWith("Saved to history");
      expect(useArenaStore.getState().finalScore).toBe(77);
    } finally {
      setItem.mockRestore();
    }
    expect(listRuns()).toEqual([]);
  });

  it("stays quiet about history when the run has nothing to save", async () => {
    await renderPage();
    const live = await startRun();
    live.push([
      { type: "consensus-complete", finalScore: 0, summary: "empty", roundsCompleted: 0 },
    ]);
    live.close();
    await waitFor(() => expect(useArenaStore.getState().isRunning).toBe(false));
    expect(toast.error).not.toHaveBeenCalledWith(SAVE_FAILED);
    expect(toast.success).not.toHaveBeenCalledWith("Saved to history");
  });

  it("still confirms a successful save", async () => {
    await renderPage();
    const live = await startRun();
    live.push(completeRun());
    live.close();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Saved to history"));
    expect(toast.error).not.toHaveBeenCalledWith(SAVE_FAILED);
    expect(listRuns()).toHaveLength(1);
  });
});
