// Page: shell, providers, views, permalinks and opening saved runs.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import HomePage from "@/app/page";
import { useArenaStore } from "@/lib/store";
import { clearHistory, listRuns } from "@/lib/history";
import { encodeSnapshotToHash } from "@/lib/session";
import { saveCompletedRun } from "@/components/history/useHistory";
import { FIXTURE_PARTICIPANTS, FIXTURE_SNAPSHOT } from "./fixtures/snapshot";
import { MODELS, SEATS, completeRun, installServer, type FakeServer } from "./helpers/page-harness";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div data-testid="md">{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));

let server: FakeServer;

beforeEach(() => {
  vi.clearAllMocks();
  server = installServer();
  useArenaStore.setState(useArenaStore.getInitialState(), true);
  localStorage.clear();
  clearHistory();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  useArenaStore.getState().cancelConsensus();
  window.history.replaceState(null, "", "/");
});

async function renderPage() {
  const utils = render(<HomePage />);
  await waitFor(() => expect(useArenaStore.getState().modelsLoading).toBe(false));
  return utils;
}

const tab = (name: RegExp) => screen.getByRole("tab", { name });

describe("HomePage — shell and providers", () => {
  it("opens on Setup with the getting-started explainer and loads providers", async () => {
    useArenaStore.setState({ participants: SEATS, prompt: "Should we ship it?" });
    await renderPage();

    expect(server.fetch).toHaveBeenCalledWith("/api/providers");
    expect(useArenaStore.getState().availableModels).toEqual(MODELS);
    expect(screen.getByText("RoundTable")).toBeInTheDocument();
    expect(tab(/^Setup/)).toHaveAttribute("aria-selected", "true");
    expect(tab(/^Run/)).toBeEnabled();
    expect(tab(/^History$/)).toBeInTheDocument(); // no count badge yet
    expect(screen.getByRole("heading", { level: 1, name: "Ask the table" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "How it works" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
    expect(screen.getByRole("link", { name: /askgrokmcp/ })).toHaveAttribute(
      "href",
      "https://github.com/marceloceccon/askgrokmcp",
    );
    // No decorative art or onboarding overlay.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reports a provider fetch failure and explains why Run is off", async () => {
    server.providersError = new TypeError("Network error");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    useArenaStore.setState({ participants: SEATS, prompt: "Should we ship it?" });
    await renderPage();

    expect(toast.error).toHaveBeenCalledWith("Failed to load AI providers");
    expect(useArenaStore.getState().availableModels).toEqual([]);
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(
      within(screen.getByRole("region", { name: "Estimate and run" })).getByText(
        "No models available. Set AI_PROVIDERS first.",
      ),
    ).toBeInTheDocument();
    spy.mockRestore();
  });

  it("treats a non-OK providers response as a failure", async () => {
    server.fetch.mockImplementationOnce(async () => ({ ok: false, status: 500 }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await renderPage();
    expect(toast.error).toHaveBeenCalledWith("Failed to load AI providers");
    expect(useArenaStore.getState().availableModels).toEqual([]);
    spy.mockRestore();
  });

  it("switches views from the header; Run shows an empty state until something runs", async () => {
    await renderPage();

    fireEvent.click(tab(/^Run/));
    expect(useArenaStore.getState().view).toBe("run");
    expect(screen.getByRole("heading", { name: "No run yet" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New run" }));
    expect(screen.getByRole("heading", { level: 1, name: "Ask the table" })).toBeInTheDocument();

    fireEvent.click(tab(/^History/));
    expect(screen.getByRole("heading", { level: 1, name: "History" })).toBeInTheDocument();
    expect(
      screen.getByText("No runs yet — completed runs are saved here automatically"),
    ).toBeInTheDocument();
  });

  it("shows the saved-run count and hides the explainer once history has a run", async () => {
    saveCompletedRun(FIXTURE_SNAPSHOT);
    await renderPage();
    expect(tab(/^History 1 saved run$/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "How it works" })).not.toBeInTheDocument();
  });
});

describe("HomePage — #rt= permalinks", () => {
  it("opens a shared run read-only in the Run view", async () => {
    window.history.replaceState(null, "", `/#${await encodeSnapshotToHash(FIXTURE_SNAPSHOT)}`);
    useArenaStore.setState({ sweepActive: true, sweepEngines: ["cvp"] });
    await renderPage();

    await waitFor(() => expect(useArenaStore.getState().view).toBe("run"));
    const s = useArenaStore.getState();
    expect(s.sharedView).toBe(true);
    expect(s.prompt).toBe(FIXTURE_SNAPSHOT.prompt);
    expect(s.sweepActive).toBe(false); // a stale sweep never frames a shared run
    expect(toast.info).toHaveBeenCalledWith("Viewing shared session");

    expect(tab(/^Run/)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Shared run (read-only)")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/early-stage startup/);
    expect(screen.getByRole("region", { name: "Consensus score" })).toHaveTextContent("80");
    expect(screen.queryByRole("button", { name: "Re-run" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    // Nothing was saved or re-run just by viewing.
    expect(listRuns()).toHaveLength(0);
    expect(server.requests).toHaveLength(0);

    // New run leaves the shared view and drops the permalink from the URL.
    fireEvent.click(screen.getByRole("button", { name: "New run" }));
    expect(window.location.hash).toBe("");
    expect(useArenaStore.getState().view).toBe("setup");
    expect(screen.getByRole("heading", { level: 1, name: "Ask the table" })).toBeInTheDocument();
  });

  it("ignores a hash that is not a permalink", async () => {
    window.history.replaceState(null, "", "/#rt-main");
    await renderPage();
    await waitFor(() => expect(useArenaStore.getState().view).toBe("setup"));
    expect(useArenaStore.getState().sharedView).toBe(false);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("clears the permalink when a new run starts", async () => {
    window.history.replaceState(null, "", "/#rt=r-not-a-real-payload");
    useArenaStore.setState({ participants: SEATS, prompt: "Should we ship it?" });
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(window.location.hash).toBe("");
    expect(useArenaStore.getState().view).toBe("run");
  });
});

describe("HomePage — opening saved runs", () => {
  it("opens a history entry in the Run view, editable, and checks it before re-running", async () => {
    saveCompletedRun(FIXTURE_SNAPSHOT);
    useArenaStore.setState({
      sweepActive: true,
      sweepEngines: ["cvp", "blind-jury", "adversarial"],
      sweepResults: [FIXTURE_SNAPSHOT],
    });
    await renderPage();

    fireEvent.click(tab(/^History/));
    const row = screen.getByRole("article", { name: /early-stage startup/ });
    fireEvent.click(within(row).getByRole("button", { name: /^Open/ }));

    const s = useArenaStore.getState();
    expect(s.view).toBe("run");
    expect(s.sharedView).toBe(false);
    expect(s.sweepActive).toBe(false);
    expect(s.sweepResults).toEqual([]);
    expect(s.finalScore).toBe(80);
    expect(screen.queryByText("Shared run (read-only)")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Compare engines" })).not.toBeInTheDocument();

    // The fixture's models are not on this server: Re-run explains instead of failing.
    fireEvent.click(screen.getByRole("button", { name: "Re-run" }));
    expect(toast.error).toHaveBeenCalledWith("Replace the models this server doesn't offer");
    expect(server.requests).toHaveLength(0);

    // Once the server offers them, Re-run streams a fresh run of the same question.
    server.models = [...MODELS, ...FIXTURE_PARTICIPANTS.map((p) => p.modelInfo)];
    useArenaStore.getState().setAvailableModels(server.models);
    server.onRun = (_req, live) => {
      live.push(completeRun({ score: 70 }));
      live.close();
    };
    fireEvent.click(screen.getByRole("button", { name: "Re-run" }));
    await waitFor(() => expect(useArenaStore.getState().finalScore).toBe(70));
    expect(server.requests[0].prompt).toBe(FIXTURE_SNAPSHOT.prompt.trim());
    expect(server.requests[0].participants).toEqual(FIXTURE_PARTICIPANTS);
    expect(server.requests[0].options).toEqual(FIXTURE_SNAPSHOT.options);
  });
});
