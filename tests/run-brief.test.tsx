import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { useArenaStore } from "@/lib/store";
import { FIXTURE_SNAPSHOT } from "./fixtures/snapshot";
import { resetStore } from "./helpers/store";
import Brief from "@/components/run/Brief";
import WhoMoved, { computeMoves } from "@/components/run/WhoMoved";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div data-testid="md">{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));

const noop = () => {};

const region = (name: string) => screen.getByRole("region", { name });

describe("Brief — fixture run (3 participants, 4 rounds, judge, 2 claims)", () => {
  beforeEach(() => {
    resetStore();
    useArenaStore.getState().loadSnapshot(FIXTURE_SNAPSHOT);
  });

  it("leads with the final score and its plain-language label", () => {
    render(<Brief onJump={noop} />);
    const score = region("Consensus score");
    expect(within(score).getByText("80")).toBeInTheDocument();
    expect(within(score).getByText("Strong agreement")).toBeInTheDocument();
    expect(within(score).getByText("Final score after 4 rounds")).toBeInTheDocument();
    // Round-by-round scores.
    const byRound = within(score).getByRole("list", { name: "Score by round" });
    expect(
      within(byRound)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["R1 80", "R2 77", "R3 79", "R4 80"]);
    // Explainer tooltip is wired to a focusable trigger.
    const info = within(score).getByRole("button", { name: "How the score is computed" });
    fireEvent.focus(info);
    expect(screen.getByRole("tooltip")).toHaveTextContent(/self-reported confidence/);
  });

  it("shows the judge's majority / minority / unresolved positions", () => {
    render(<Brief onJump={noop} />);
    const judge = region("Judge synthesis");
    expect(within(judge).getByText("Majority")).toBeInTheDocument();
    expect(within(judge).getByText("Minority")).toBeInTheDocument();
    expect(within(judge).getByText("Unresolved")).toBeInTheDocument();
    expect(
      within(judge).getByText(/Start with a modular monolith with enforced module boundaries/),
    ).toBeInTheDocument();
    expect(within(judge).getByText(/conditional exception/)).toBeInTheDocument();
    expect(
      within(judge).getByText(/cost of later decomposition remains contested/),
    ).toBeInTheDocument();
    expect(within(judge).getByText(/Claude · claude-sonnet-4-20250514/)).toBeInTheDocument();

    // Full synthesis is one click away and only rendered when expanded.
    expect(within(judge).queryByText(/Synthesis Confidence/)).not.toBeInTheDocument();
    fireEvent.click(within(judge).getByRole("button", { name: "Show full synthesis" }));
    expect(within(judge).getByText(/Synthesis Confidence/)).toBeInTheDocument();
    fireEvent.click(within(judge).getByRole("button", { name: "Hide full synthesis" }));
    expect(within(judge).queryByText(/Synthesis Confidence/)).not.toBeInTheDocument();
  });

  it("renders both claim cards with each side's stance and verbatim quote", () => {
    render(<Brief onJump={noop} />);
    const split = region("Where they split");
    const cards = within(split)
      .getAllByRole("listitem")
      .filter((li) => li.parentElement?.tagName === "OL");
    expect(cards).toHaveLength(2);

    const [c1, c2] = cards;
    expect(
      within(c1).getByText("Whether decomposing a monolith later is cheap enough to defer"),
    ).toBeInTheDocument();
    expect(
      within(c1).getByText("Decomposition cost is routinely underestimated"),
    ).toBeInTheDocument();
    expect(
      within(c1).getByText("Manageable with discipline and boundary tests"),
    ).toBeInTheDocument();
    const quotes1 = c1.querySelectorAll("blockquote");
    expect(quotes1).toHaveLength(2);
    expect(quotes1[0].textContent).toContain("decomposing a monolith later is not free");
    expect(quotes1[1].textContent).toContain("mitigated with boundary tests from the start");
    // Multi-participant side lists both personas.
    expect(
      within(c1).getByRole("button", { name: /First-Principles Engineer/ }),
    ).toBeInTheDocument();
    expect(within(c1).getByRole("button", { name: /Risk Analyst/ })).toBeInTheDocument();

    expect(
      within(c2).getByText("Whether modern tooling reduces microservice operational burden"),
    ).toBeInTheDocument();
    expect(within(c2).getByText("Tooling has matured enough to absorb it")).toBeInTheDocument();
    expect(
      within(c2).getByText("Tooling trades complexity rather than removing it"),
    ).toBeInTheDocument();
    expect(c2.querySelectorAll("blockquote")[1].textContent).toContain("it is *traded* complexity");
    expect(within(split).getByText("2")).toBeInTheDocument(); // count badge
  });

  it("lists who moved, biggest shift first, with correct deltas", () => {
    render(<Brief onJump={noop} />);
    const moved = region("Who moved");
    const rows = within(moved).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      "Risk Analyst85 → 91+6",
      "Optimistic Futurist75 → 72−3",
      "First-Principles Engineer90 → 93+3",
    ]);
  });

  it("jumps to the round that contains a claim's quote", () => {
    const onJump = vi.fn();
    render(<Brief onJump={onJump} />);
    const split = region("Where they split");
    // "Kubernetes is not reduced complexity" was said by the Risk Analyst in round 2.
    const c2 = within(split)
      .getByText("Whether modern tooling reduces microservice operational burden")
      .closest("li")!;
    fireEvent.click(within(c2).getByRole("button", { name: /Risk Analyst/ }));
    expect(onJump).toHaveBeenLastCalledWith({ round: 2, participantId: "p-1" });
    // Futurist's "decomposing … is not free" quote is from round 2.
    const c1 = within(split)
      .getByText("Whether decomposing a monolith later is cheap enough to defer")
      .closest("li")!;
    fireEvent.click(within(c1).getByRole("button", { name: /Optimistic Futurist/ }));
    expect(onJump).toHaveBeenLastCalledWith({ round: 2, participantId: "p-2" });
    // The Risk Analyst didn't say side 2's quote → falls back to their latest answer.
    fireEvent.click(within(c1).getByRole("button", { name: /Risk Analyst/ }));
    expect(onJump).toHaveBeenLastCalledWith({ round: 4, participantId: "p-1" });
  });
});

describe("computeMoves", () => {
  it("excludes errored answers and orders ties / single answers by panel order", () => {
    const [p1, p2, p3] = FIXTURE_SNAPSHOT.participants;
    const rounds = [
      {
        ...FIXTURE_SNAPSHOT.rounds[0],
        responses: [
          { participantId: "p-1", roundNumber: 1, content: "", confidence: 50, timestamp: 0 },
          { participantId: "p-2", roundNumber: 1, content: "", confidence: 60, timestamp: 0 },
          {
            participantId: "p-3",
            roundNumber: 1,
            content: "",
            confidence: 0,
            timestamp: 0,
            error: "HTTP 500",
          },
        ],
      },
      {
        ...FIXTURE_SNAPSHOT.rounds[1],
        responses: [
          { participantId: "p-1", roundNumber: 2, content: "", confidence: 50, timestamp: 0 },
          {
            participantId: "p-2",
            roundNumber: 2,
            content: "",
            confidence: 0,
            timestamp: 0,
            error: "x",
          },
          { participantId: "p-3", roundNumber: 2, content: "", confidence: 70, timestamp: 0 },
        ],
      },
    ];
    const ghost = { ...p3, id: "p-9" };
    const moves = computeMoves([p1, p2, p3, ghost], rounds);
    expect(moves.map((m) => [m.participant.id, m.first, m.last, m.delta])).toEqual([
      ["p-1", 50, 50, 0],
      ["p-2", 60, 60, null],
      ["p-3", 70, 70, null],
      ["p-9", null, null, null],
    ]);
  });

  it("renders a single answer without a delta, and an empty note before answers", () => {
    resetStore();
    const [p1] = FIXTURE_SNAPSHOT.participants;
    useArenaStore.setState({ participants: [p1], rounds: [] });
    const { unmount } = render(<WhoMoved />);
    expect(screen.getByText("Appears once participants have answered.")).toBeInTheDocument();
    unmount();
    useArenaStore.setState({ rounds: [FIXTURE_SNAPSHOT.rounds[0]] });
    render(<WhoMoved />);
    expect(screen.getByText("(one answer)")).toBeInTheDocument();
  });
});

describe("Brief — progressive and edge states", () => {
  beforeEach(resetStore);

  it("shows a skeleton before any round lands, then the score so far", () => {
    const store = useArenaStore.getState();
    useArenaStore.setState({
      participants: FIXTURE_SNAPSHOT.participants,
      prompt: FIXTURE_SNAPSHOT.prompt,
      options: { ...FIXTURE_SNAPSHOT.options, judgeEnabled: true, extractClaimsEnabled: true },
    });
    store.startConsensus();
    store.startRound(1, "initial-analysis", "Initial Analysis");
    const { rerender } = render(<Brief onJump={noop} />);
    expect(screen.getByText("The score appears when round 1 finishes.")).toBeInTheDocument();
    expect(
      screen.getByText("The judge writes its verdict after the final round."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Contradictions are extracted after the final round."),
    ).toBeInTheDocument();

    store.completeParticipantRound("p-1", 1, 85, "a\nCONFIDENCE: 85");
    store.completeParticipantRound("p-2", 1, 75, "b\nCONFIDENCE: 75");
    store.endRound(1, 72);
    store.startRound(2, "counterarguments", "Counterarguments");
    store.completeParticipantRound("p-1", 2, 88, "c");
    store.endRound(2, 64);
    store.startRound(3, "evidence-assessment", "Evidence");
    rerender(<Brief onJump={noop} />);
    const score = region("Consensus score");
    expect(within(score).getByText("64")).toBeInTheDocument();
    expect(within(score).getByText("Broad agreement with reservations")).toBeInTheDocument();
    expect(within(score).getByText("So far, after round 2")).toBeInTheDocument();
    expect(within(score).getByText("R1 72")).toBeInTheDocument();
    expect(within(score).getByText("R2 64")).toBeInTheDocument();
  });

  it("streams the judge while it writes, and shows a claims skeleton", () => {
    useArenaStore.getState().loadSnapshot({ ...FIXTURE_SNAPSHOT, judge: null, claims: null });
    useArenaStore.setState({ isRunning: true });
    useArenaStore.getState().startJudge("gpt-4o", "OpenAI");
    useArenaStore.getState().appendJudgeToken("## Majority Position\nLeaning monolith");
    useArenaStore.getState().startClaims("gpt-4o", "OpenAI");
    render(<Brief onJump={noop} />);
    const judge = region("Judge synthesis");
    expect(within(judge).getByText(/Leaning monolith/)).toBeInTheDocument();
    expect(within(judge).getByText("Writing…")).toBeInTheDocument();
    expect(
      within(region("Where they split")).getByText("Extracting contradictions…"),
    ).toBeInTheDocument();
  });

  it("nudges instead of faking a verdict when judge and claims were off", () => {
    useArenaStore.getState().loadSnapshot(
      {
        ...FIXTURE_SNAPSHOT,
        options: { ...FIXTURE_SNAPSHOT.options, judgeEnabled: false, extractClaimsEnabled: false },
        judge: null,
        claims: null,
      },
      { sharedView: false },
    );
    render(<Brief onJump={noop} />);
    expect(
      screen.getByText("Enable judge synthesis to get a written verdict."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Enable claim extraction/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Judge synthesis" })).not.toBeInTheDocument();
  });

  it("words the nudges for a read-only shared run", () => {
    useArenaStore.getState().loadSnapshot({
      ...FIXTURE_SNAPSHOT,
      options: { ...FIXTURE_SNAPSHOT.options, judgeEnabled: false, extractClaimsEnabled: false },
      judge: null,
      claims: null,
    });
    render(<Brief onJump={noop} />);
    expect(screen.getByText(/Judge synthesis was off for this run/)).toBeInTheDocument();
    expect(screen.getByText("Claim extraction was off for this run.")).toBeInTheDocument();
  });

  it("says so when the judge was on but produced nothing", () => {
    useArenaStore.getState().loadSnapshot({ ...FIXTURE_SNAPSHOT, judge: null });
    render(<Brief onJump={noop} />);
    expect(screen.getByText("No judge verdict was produced for this run.")).toBeInTheDocument();
  });

  it("shows claim-extraction errors inline and the empty-contradictions note", () => {
    useArenaStore.getState().loadSnapshot({
      ...FIXTURE_SNAPSHOT,
      claims: { ...FIXTURE_SNAPSHOT.claims!, contradictions: [], error: "Rate limited (HTTP 429)" },
    });
    const { unmount } = render(<Brief onJump={noop} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Claim extraction failed");
    expect(screen.getByText("Rate limited (HTTP 429)")).toBeInTheDocument();
    unmount();

    useArenaStore.getState().loadSnapshot({
      ...FIXTURE_SNAPSHOT,
      claims: { ...FIXTURE_SNAPSHOT.claims!, contradictions: [] },
    });
    render(<Brief onJump={noop} />);
    expect(screen.getByText(/No substantive contradictions found/)).toBeInTheDocument();
  });

  it("reports a failed run instead of a zero score", () => {
    useArenaStore.setState({ participants: FIXTURE_SNAPSHOT.participants });
    useArenaStore.getState().startConsensus();
    useArenaStore.getState().failConsensus("Cost cap of $0.50 reached");
    render(<Brief onJump={noop} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The run failed");
    expect(alert).toHaveTextContent("Cost cap of $0.50 reached");
    expect(screen.queryByText("Deep disagreement")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Who moved" })).not.toBeInTheDocument();
  });

  it("marks a stopped run's score as partial, and notes early convergence", () => {
    const store = useArenaStore.getState();
    useArenaStore.setState({ participants: FIXTURE_SNAPSHOT.participants });
    store.startConsensus();
    store.startRound(1, "initial-analysis", "Initial");
    store.completeParticipantRound("p-1", 1, 40, "x");
    store.endRound(1, 38);
    store.setEarlyStopped({ round: 1, delta: 0, reason: "flat" });
    store.startRound(2, "counterarguments", "Counter");
    store.cancelConsensus();
    render(<Brief onJump={noop} />);
    const score = region("Consensus score");
    expect(within(score).getByText("38")).toBeInTheDocument();
    expect(within(score).getByText("Deep disagreement")).toBeInTheDocument();
    expect(
      within(score).getByText("Run stopped — score after round 1 · converged early after round 1"),
    ).toBeInTheDocument();
  });

  it("says when a run stopped before any round finished", () => {
    useArenaStore.setState({ participants: FIXTURE_SNAPSHOT.participants });
    useArenaStore.getState().startConsensus();
    useArenaStore.getState().startRound(1, "initial-analysis", "Initial");
    useArenaStore.getState().cancelConsensus();
    render(<Brief onJump={noop} />);
    expect(screen.getByText("No round finished before the run stopped.")).toBeInTheDocument();
  });
});
