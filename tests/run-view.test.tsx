import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import { useArenaStore } from "@/lib/store";
import { FIXTURE_SNAPSHOT, FIXTURE_SNAPSHOT_JURY } from "./fixtures/snapshot";
import { resetStore } from "./helpers/store";
import RunView from "@/components/run/RunView";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div data-testid="md">{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));

const props = () => ({
  onCancel: vi.fn(),
  onNewRun: vi.fn(),
  onRerun: vi.fn(),
  onOpenSnapshot: vi.fn(),
});
const panel = (name: string) => document.getElementById(`run-pane-panel-${name}`)!;

describe("RunView", () => {
  beforeEach(resetStore);

  it("shows an empty state with a New run action when nothing has run", () => {
    const p = props();
    render(<RunView {...p} />);
    expect(screen.getByRole("heading", { name: "No run yet" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New run" }));
    expect(p.onNewRun).toHaveBeenCalled();
  });

  it("renders header, brief, signals and transcript once each", () => {
    useArenaStore.getState().loadSnapshot(FIXTURE_SNAPSHOT);
    render(<RunView {...props()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/early-stage startup/);
    expect(
      within(panel("brief")).getByRole("region", { name: "Consensus score" }),
    ).toBeInTheDocument();
    expect(
      within(panel("signals")).getByRole("region", { name: "Confidence trajectory" }),
    ).toBeInTheDocument();
    expect(
      within(panel("signals")).getByRole("region", { name: "Confidence-spread flags" }),
    ).toBeInTheDocument();
    expect(
      within(panel("signals")).getByRole("region", { name: "Cost (estimated)" }),
    ).toBeInTheDocument();
    expect(
      within(panel("transcript")).getByRole("heading", { name: "Transcript" }),
    ).toBeInTheDocument();
    // Unique anchors: each response id appears once.
    expect(document.querySelectorAll("#r4-p-1")).toHaveLength(1);
    expect(screen.getAllByRole("region", { name: "Consensus score" })).toHaveLength(1);
    // No sweep → no compare table.
    expect(screen.queryByRole("region", { name: "Compare engines" })).not.toBeInTheDocument();
  });

  it("uses tabs below lg: Brief / Transcript / Signals", () => {
    useArenaStore.getState().loadSnapshot(FIXTURE_SNAPSHOT);
    render(<RunView {...props()} />);
    const tabs = screen.getByRole("tablist", { name: "Run sections" });
    expect(tabs).toHaveClass("lg:hidden");
    const names = within(tabs)
      .getAllByRole("tab")
      .map((t) => t.textContent);
    expect(names).toEqual(["Brief", "Transcript", "Signals"]);

    expect(panel("brief")).not.toHaveClass("hidden");
    expect(panel("transcript")).toHaveClass("hidden", "lg:block");
    expect(panel("signals")).toHaveClass("hidden", "lg:block");

    fireEvent.click(within(tabs).getByRole("tab", { name: "Transcript" }));
    expect(within(tabs).getByRole("tab", { name: "Transcript" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(panel("transcript")).not.toHaveClass("hidden");
    expect(panel("brief")).toHaveClass("hidden");

    fireEvent.keyDown(tabs, { key: "ArrowRight" });
    expect(panel("signals")).not.toHaveClass("hidden");
    expect(panel("transcript")).toHaveClass("hidden");
  });

  it("clicking a claim side opens the transcript at that response", () => {
    useArenaStore.getState().loadSnapshot(FIXTURE_SNAPSHOT);
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    render(<RunView {...props()} />);
    const split = within(panel("brief")).getByRole("region", { name: "Where they split" });
    const card = within(split)
      .getByText(/modern tooling reduces/)
      .closest("li")!;
    fireEvent.click(within(card).getByRole("button", { name: /Risk Analyst/ }));

    expect(panel("transcript")).not.toHaveClass("hidden");
    expect(screen.getByRole("radio", { name: /R2 Counter/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const target = document.getElementById("r2-p-1");
    expect(target).not.toBeNull();
    expect(spy.mock.contexts.at(-1)).toBe(target);
    spy.mockRestore();
  });

  it("clicking a confidence-spread flag opens that round", () => {
    useArenaStore.getState().loadSnapshot(FIXTURE_SNAPSHOT);
    render(<RunView {...props()} />);
    const flags = within(panel("signals")).getByRole("region", { name: "Confidence-spread flags" });
    fireEvent.click(within(flags).getByText("Confidence split of 22 points"));
    expect(screen.getByRole("radio", { name: /R3 Evidence/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(panel("transcript")).not.toHaveClass("hidden");
  });

  it("shows the compare table during a sweep and resets panes for a new run", () => {
    const s = useArenaStore.getState();
    useArenaStore.setState({ participants: FIXTURE_SNAPSHOT.participants, prompt: "q" });
    s.startSweep(["cvp", "blind-jury"]);
    s.pushSweepResult(FIXTURE_SNAPSHOT);
    s.setSweepCurrentIndex(1);
    s.startConsensus("blind-jury");
    const p = props();
    render(<RunView {...p} />);
    expect(screen.getByRole("region", { name: "Compare engines" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Engine 2 of 2 · Blind jury");
    expect(screen.getByText("Waiting for the first round to start…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(p.onCancel).toHaveBeenCalled();

    fireEvent.click(
      within(screen.getByRole("tablist", { name: "Run sections" })).getByRole("tab", {
        name: "Signals",
      }),
    );
    expect(panel("signals")).not.toHaveClass("hidden");
    expect(within(panel("signals")).getByText("Live")).toBeInTheDocument();
    act(() => {
      s.pushSweepResult(FIXTURE_SNAPSHOT_JURY);
      s.reset();
      s.startConsensus(); // new run → panes reset to the Brief
      useArenaStore.setState({ runStartedAt: 42 }); // distinct run identity, same-ms safe
    });
    expect(panel("brief")).not.toHaveClass("hidden");
  });

  it("shows a placeholder in Signals before anything lands", () => {
    useArenaStore.setState({ participants: FIXTURE_SNAPSHOT.participants, prompt: "q" });
    useArenaStore.getState().startConsensus();
    useArenaStore.getState().cancelConsensus();
    render(<RunView {...props()} />);
    expect(
      within(panel("signals")).getByText("Signals appear as rounds complete."),
    ).toBeInTheDocument();
  });
});
