import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import { useArenaStore, DEFAULT_OPTIONS } from "@/lib/store";
import { FIXTURE_SNAPSHOT } from "./fixtures/snapshot";
import { resetStore } from "./helpers/store";
import Transcript from "@/components/run/Transcript";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div data-testid="md">{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));

const roundRadio = (name: RegExp) => screen.getByRole("radio", { name });
const cards = () => Array.from(document.querySelectorAll<HTMLElement>("article[data-response-id]"));

describe("Transcript — completed run", () => {
  beforeEach(() => {
    resetStore();
    useArenaStore.getState().loadSnapshot(FIXTURE_SNAPSHOT);
  });

  it("opens on the final round with one card per participant, anchors intact", () => {
    render(<Transcript />);
    expect(roundRadio(/R4 Synthesis/)).toHaveAttribute("aria-checked", "true");
    expect(document.getElementById("round-4")).not.toBeNull();
    expect(cards().map((c) => c.id)).toEqual(["r4-p-1", "r4-p-2", "r4-p-3"]);
    expect(cards().map((c) => c.dataset.responseId)).toEqual(["r4-p-1", "r4-p-2", "r4-p-3"]);
    const first = cards()[0];
    expect(within(first).getByText("Risk Analyst")).toBeInTheDocument();
    expect(within(first).getByText("Grok · grok-4-fast-reasoning")).toBeInTheDocument();
    expect(within(first).getByText("91%")).toBeInTheDocument();
    expect(within(first).getByText("8s")).toBeInTheDocument();
    expect(within(first).getByText("3,320 tok")).toBeInTheDocument();
    // CONFIDENCE line stripped from the markdown body.
    expect(within(first).getByTestId("md").textContent).not.toMatch(/CONFIDENCE/);
    expect(screen.getByText("Score 80")).toBeInTheDocument();
  });

  it("shows each round's score under its label and switches rounds", () => {
    render(<Transcript />);
    const r2 = roundRadio(/R2 Counter/);
    expect(r2).toHaveTextContent("77");
    fireEvent.click(r2);
    expect(r2).toHaveAttribute("aria-checked", "true");
    expect(cards().map((c) => c.id)).toEqual(["r2-p-1", "r2-p-2", "r2-p-3"]);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
      "Round 2 · Counterarguments",
    );
    // Arrow keys move through the radiogroup.
    fireEvent.keyDown(screen.getByRole("radiogroup", { name: "Rounds" }), { key: "ArrowRight" });
    expect(roundRadio(/R3 Evidence/)).toHaveAttribute("aria-checked", "true");
  });

  it("'Final positions' jumps back to the last completed round", () => {
    render(<Transcript />);
    fireEvent.click(roundRadio(/R1 Initial/));
    expect(cards()[0].id).toBe("r1-p-1");
    fireEvent.click(screen.getByRole("button", { name: "Final positions" }));
    expect(roundRadio(/R4 Synthesis/)).toHaveAttribute("aria-checked", "true");
    expect(cards()[0].id).toBe("r4-p-1");
  });

  it("filters to one participant across every round", () => {
    render(<Transcript />);
    const group = screen.getByRole("group", { name: "Show participant" });
    fireEvent.click(within(group).getByRole("button", { name: /Optimistic Futurist/ }));
    expect(within(group).getByRole("button", { name: /Optimistic Futurist/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(cards().map((c) => c.id)).toEqual(["r1-p-2", "r2-p-2", "r3-p-2", "r4-p-2"]);
    expect(screen.getByText("· R3 Evidence")).toBeInTheDocument();
    ["round-1", "round-2", "round-3", "round-4"].forEach((id) =>
      expect(document.getElementById(id)).not.toBeNull(),
    );
    // No round is "selected" while reading one persona; picking a round exits the filter.
    expect(
      screen.getAllByRole("radio").every((r) => r.getAttribute("aria-checked") === "false"),
    ).toBe(true);
    fireEvent.click(roundRadio(/R2 Counter/));
    expect(within(group).getByRole("button", { name: "Everyone" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(cards().map((c) => c.id)).toEqual(["r2-p-1", "r2-p-2", "r2-p-3"]);
    // Toggling a chip twice returns to everyone.
    fireEvent.click(within(group).getByRole("button", { name: /Risk Analyst/ }));
    fireEvent.click(within(group).getByRole("button", { name: /Risk Analyst/ }));
    expect(cards()).toHaveLength(3);
    fireEvent.click(within(group).getByRole("button", { name: /Risk Analyst/ }));
    fireEvent.click(within(group).getByRole("button", { name: "Everyone" }));
    expect(cards()).toHaveLength(3);
  });

  it("copies a response without its CONFIDENCE line", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    vi.useFakeTimers();
    try {
      render(<Transcript />);
      const btn = within(cards()[0]).getByRole("button", { name: "Copy response" });
      await act(async () => {
        fireEvent.click(btn);
      });
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("**Final position.** Monolith first."),
      );
      expect(writeText.mock.calls[0][0]).not.toMatch(/CONFIDENCE/);
      expect(
        within(cards()[0]).getByRole("button", { name: "Copied to clipboard" }),
      ).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(2100);
      });
      expect(within(cards()[0]).getByRole("button", { name: "Copy response" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Transcript — live run", () => {
  beforeEach(resetStore);
  afterEach(() => vi.useRealTimers());

  function startLive() {
    const store = useArenaStore.getState();
    useArenaStore.setState({
      participants: FIXTURE_SNAPSHOT.participants,
      prompt: "q",
      options: { ...DEFAULT_OPTIONS, rounds: 3 },
    });
    store.startConsensus();
    return store;
  }

  it("waits for the first round, then streams text into the active round", () => {
    const store = startLive();
    const { rerender } = render(<Transcript />);
    expect(screen.getByText("Waiting for the first round to start…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Final positions" })).toBeDisabled();

    act(() => {
      store.startRound(1, "initial-analysis", "Initial Analysis");
      store.appendToken("p-1", 1, "");
      store.appendToken("p-2", 1, "Scaling from day one");
    });
    rerender(<Transcript />);
    expect(screen.getByText("Scaling from day one")).toBeInTheDocument();
    expect(screen.getByText("Writing…")).toBeInTheDocument();
    expect(screen.getByText("Thinking…")).toBeInTheDocument(); // p-1 started, no tokens
    expect(screen.getByText("Waiting…")).toBeInTheDocument(); // p-3 queued
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(roundRadio(/R1 Initial/)).toHaveTextContent("live");
  });

  it("auto-follows the newest round unless the user picked an earlier one", () => {
    const store = startLive();
    act(() => {
      store.startRound(1, "initial-analysis", "Initial Analysis");
      store.completeParticipantRound("p-1", 1, 80, "one");
      store.endRound(1, 70);
      store.startRound(2, "counterarguments", "Counterarguments");
    });
    render(<Transcript />);
    expect(roundRadio(/R2 Counter/)).toHaveAttribute("aria-checked", "true");

    // Pin round 1; a new round must not steal focus.
    fireEvent.click(roundRadio(/R1 Initial/));
    act(() => {
      store.endRound(2, 72);
      store.startRound(3, "synthesis", "Synthesis");
    });
    expect(roundRadio(/R1 Initial/)).toHaveAttribute("aria-checked", "true");
    // Final positions = last *completed* round while running.
    fireEvent.click(screen.getByRole("button", { name: "Final positions" }));
    expect(roundRadio(/R2 Counter/)).toHaveAttribute("aria-checked", "true");
    // Picking the live round resumes following.
    fireEvent.click(roundRadio(/R3 Synthesis/));
    act(() => {
      store.endRound(3, 75);
      store.startRound(4, "synthesis", "Synthesis 2");
    });
    expect(roundRadio(/R4 Synthesis/)).toHaveAttribute("aria-checked", "true");
  });

  it("renders a provider error as a danger card with the upstream message", () => {
    const store = startLive();
    act(() => {
      store.startRound(1, "initial-analysis", "Initial Analysis");
      store.completeParticipantRound(
        "p-2",
        1,
        0,
        "[Error from Claude / claude-sonnet-4: Not Found — HTTP 404]",
        undefined,
        300,
        "Not Found — HTTP 404",
      );
    });
    render(<Transcript />);
    const card = document.getElementById("r1-p-2")!;
    expect(card).toHaveAttribute("data-response-id", "r1-p-2");
    expect(within(card).getByText("Provider error")).toBeInTheDocument();
    expect(within(card).getByText("Not Found — HTTP 404")).toBeInTheDocument();
    expect(within(card).getByText("Error")).toBeInTheDocument();
    expect(within(card).queryByTestId("md")).not.toBeInTheDocument();
  });

  it("scrolls to a response requested through shared navigation", async () => {
    const { useTranscriptNav } = await import("@/components/run/navigation");
    useArenaStore.getState().loadSnapshot(FIXTURE_SNAPSHOT);
    function Harness() {
      const nav = useTranscriptNav();
      return (
        <>
          <button onClick={() => nav.jumpTo({ round: 2, participantId: "p-1" })}>
            jump-response
          </button>
          <button onClick={() => nav.jumpTo({ round: 3 })}>jump-round</button>
          <Transcript nav={nav} />
        </>
      );
    }
    vi.useFakeTimers();
    render(<Harness />);
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    fireEvent.click(screen.getByRole("button", { name: "jump-response" }));
    const target = document.getElementById("r2-p-1")!;
    expect(roundRadio(/R2 Counter/)).toHaveAttribute("aria-checked", "true");
    expect(spy.mock.contexts.at(-1)).toBe(target);
    expect(target).toHaveClass("ring-2");
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(target).not.toHaveClass("ring-2");
    // Jump to a whole round.
    fireEvent.click(screen.getByRole("button", { name: "jump-round" }));
    expect(spy.mock.contexts.at(-1)).toBe(document.getElementById("round-3"));
    spy.mockRestore();
  });
});
