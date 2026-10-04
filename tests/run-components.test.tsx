import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { useArenaStore } from "@/lib/store";
import { FIXTURE_SNAPSHOT } from "./fixtures/snapshot";
import { resetStore } from "./helpers/store";
import ConfidenceTrajectory from "@/components/ConfidenceTrajectory";
import JudgeCard from "@/components/JudgeCard";
import ClaimsPanel from "@/components/ClaimsPanel";
import DisagreementPanel from "@/components/DisagreementPanel";
import CostMeter from "@/components/CostMeter";
import {
  excerpt,
  formatCost,
  formatDelta,
  formatDuration,
  formatTokens,
  stripConfidence,
  stripJudgeConfidence,
} from "@/lib/format";
import {
  findResponseTarget,
  isRoundComplete,
  prefersReducedMotion,
  scrollToAnchor,
} from "@/components/run/navigation";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div data-testid="md">{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));

describe("ConfidenceTrajectory", () => {
  beforeEach(resetStore);

  it("renders nothing without answers", () => {
    useArenaStore.setState({ participants: FIXTURE_SNAPSHOT.participants });
    const { container } = render(<ConfidenceTrajectory />);
    expect(container.innerHTML).toBe("");
  });

  it("draws one line per participant, round ticks and a latest-value legend", () => {
    useArenaStore.getState().loadSnapshot(FIXTURE_SNAPSHOT);
    const { container } = render(<ConfidenceTrajectory />);
    const chart = container.querySelector('svg[aria-label="Confidence trajectory chart"]')!;
    expect(chart.querySelectorAll("polyline")).toHaveLength(3);
    expect(chart.querySelector("desc")!.textContent).toContain(
      "Risk Analyst: R1 85, R2 88, R3 90, R4 91",
    );
    ["R1", "R2", "R3", "R4"].forEach((t) => expect(screen.getByText(t)).toBeInTheDocument());
    const legend = screen.getByRole("list", { name: "Latest confidence" });
    expect(within(legend).getByText("91%")).toBeInTheDocument();
    expect(within(legend).getByText("72%")).toBeInTheDocument();
    expect(within(legend).getByText("93%")).toBeInTheDocument();
    // 12 points (3 participants × 4 rounds), no glow filter.
    expect(container.querySelectorAll('span[title*="Round"]')).toHaveLength(12);
    expect(container.querySelector("filter")).toBeNull();
  });

  it("centres a single round and skips errored answers", () => {
    const [p1, p2] = FIXTURE_SNAPSHOT.participants;
    useArenaStore.setState({
      participants: [p1, p2],
      rounds: [
        {
          number: 1,
          type: "initial-analysis",
          label: "R1",
          consensusScore: 80,
          responses: [
            { participantId: "p-1", roundNumber: 1, content: "", confidence: 80, timestamp: 0 },
            {
              participantId: "p-2",
              roundNumber: 1,
              content: "",
              confidence: 0,
              timestamp: 0,
              error: "x",
            },
          ],
        },
      ],
    });
    const { container } = render(<ConfidenceTrajectory />);
    const dots = container.querySelectorAll<HTMLElement>('span[title*="Round"]');
    expect(dots).toHaveLength(1);
    expect(dots[0].style.left).toBe("50%");
    expect(container.querySelectorAll("polyline")).toHaveLength(0);
  });

  it("ignores a response whose confidence is not a number", () => {
    const [p1] = FIXTURE_SNAPSHOT.participants;
    useArenaStore.setState({
      participants: [p1],
      rounds: [
        {
          number: 1,
          type: "initial-analysis",
          label: "R1",
          consensusScore: 0,
          responses: [
            {
              participantId: "p-1",
              roundNumber: 1,
              content: "",
              confidence: Number.NaN,
              timestamp: 0,
            },
          ],
        },
      ],
    });
    const { container } = render(<ConfidenceTrajectory />);
    expect(container.innerHTML).toBe("");
  });
});

describe("JudgeCard", () => {
  beforeEach(resetStore);

  it("streams the verdict as plain text while the judge writes", () => {
    useArenaStore.getState().startConsensus();
    useArenaStore.getState().startJudge("gpt-4o", "OpenAI");
    useArenaStore.getState().appendJudgeToken("Streaming **thoughts**");
    render(<JudgeCard />);
    expect(screen.getByText("Writing…")).toBeInTheDocument();
    expect(screen.getByText("Streaming **thoughts**")).toBeInTheDocument();
    expect(screen.queryByTestId("md")).not.toBeInTheDocument();
  });

  it("renders nothing without a judge", () => {
    const { container } = render(<JudgeCard />);
    expect(container.innerHTML).toBe("");
  });

  it("falls back to the full text when the verdict could not be parsed", () => {
    useArenaStore.setState({
      judge: {
        modelId: "gpt-4o",
        providerName: "OpenAI",
        content: "Free-form verdict.\nJUDGE_CONFIDENCE: 70",
        majorityPosition: "",
        minorityPositions: "",
        unresolvedDisputes: "",
      },
    });
    render(<JudgeCard />);
    expect(screen.getByTestId("md").textContent).toBe("Free-form verdict.");
    expect(screen.queryByText("Majority")).not.toBeInTheDocument();
  });

  it("marks empty sections as 'None noted.'", () => {
    useArenaStore.setState({
      judge: {
        modelId: "gpt-4o",
        providerName: "OpenAI",
        content: "",
        majorityPosition: "Ship it.",
        minorityPositions: "",
        unresolvedDisputes: "",
      },
    });
    render(<JudgeCard />);
    expect(screen.getAllByText("None noted.")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Show full synthesis" })).not.toBeInTheDocument();
  });
});

describe("ClaimsPanel", () => {
  beforeEach(resetStore);
  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("renders nothing without claims", () => {
    const { container } = render(<ClaimsPanel onJumpToResponse={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("hands a side's participant and quote to the jump callback", () => {
    useArenaStore.getState().loadSnapshot(FIXTURE_SNAPSHOT);
    const onJump = vi.fn();
    render(<ClaimsPanel onJumpToResponse={onJump} />);
    const card = screen.getByText(/modern tooling reduces/).closest("li")!;
    fireEvent.click(within(card).getByRole("button", { name: /Risk Analyst/ }));
    expect(onJump).toHaveBeenCalledWith(["p-1"], expect.any(String));
  });

  it("shows the raw participant id when a persona is unknown", () => {
    useArenaStore.getState().loadSnapshot(FIXTURE_SNAPSHOT);
    useArenaStore.setState({
      claims: {
        ...FIXTURE_SNAPSHOT.claims!,
        contradictions: [
          { id: "x", claim: "C", sides: [{ stance: "S", participantIds: ["ghost"], quote: "q" }] },
        ],
      },
    });
    const onJump = vi.fn();
    render(<ClaimsPanel onJumpToResponse={onJump} />);
    fireEvent.click(screen.getByRole("button", { name: /ghost/ }));
    expect(onJump).toHaveBeenCalledWith(["ghost"], "q");
  });
});

describe("DisagreementPanel", () => {
  beforeEach(resetStore);

  it("renders nothing without flags", () => {
    const { container } = render(<DisagreementPanel onSelectRound={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("groups by round, shows the gap, and opens a round", () => {
    useArenaStore.getState().loadSnapshot(FIXTURE_SNAPSHOT);
    const onSelectRound = vi.fn();
    render(<DisagreementPanel onSelectRound={onSelectRound} />);
    expect(screen.getByRole("heading", { name: "Round 2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Round 4" })).toBeInTheDocument();
    expect(screen.getAllByText("23 pts")).toHaveLength(2);
    fireEvent.click(screen.getByText("Confidence split of 22 points"));
    expect(onSelectRound).toHaveBeenCalledWith(3);
    // Round headings are plain text; every flag row is the control.
    expect(screen.queryByRole("button", { name: "Round 2" })).not.toBeInTheDocument();
  });
});

describe("CostMeter", () => {
  beforeEach(resetStore);

  it("shows while a run streams even before any tokens arrive", () => {
    useArenaStore.getState().startConsensus();
    render(<CostMeter />);
    expect(screen.getByRole("region", { name: "Cost (estimated)" })).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("breaks cost down by seat, judge and claim extraction", () => {
    useArenaStore.getState().loadSnapshot(FIXTURE_SNAPSHOT);
    render(<CostMeter />);
    expect(screen.getByText("$0.13")).toBeInTheDocument();
    expect(screen.getByText("42,700 tok")).toBeInTheDocument();
    expect(screen.getByText("39,580 in · 3,120 out")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Usage by seat, judge and claim extraction" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getByRole("rowheader").textContent)).toEqual([
      "Risk Analyst",
      "Optimistic Futurist",
      "First-Principles Engineer",
      "Judge",
      "Claim extraction",
    ]);
    // p-1: 0.0021 + 0.0029 + 0.0044 + 0.0049 = 0.0143
    expect(within(rows[0]).getByText("$0.01")).toBeInTheDocument();
    expect(within(rows[3]).getByText("$0.02")).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
  });
});

describe("format helpers", () => {
  it("formats cost, tokens, durations and deltas", () => {
    expect(formatCost(0)).toBe("—");
    expect(formatCost(null)).toBe("—");
    expect(formatCost(Number.NaN)).toBe("—");
    expect(formatCost(0.00123)).toBe("$0.0012");
    expect(formatCost(0.5612)).toBe("$0.56");
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(2_000)).toBe("2,000");
    expect(formatTokens(1_250_000)).toBe("1,250,000");
    expect(formatTokens(undefined)).toBe("—");
    expect(formatDuration(-1)).toBe("0s");
    expect(formatDuration(850)).toBe("850ms");
    expect(formatDuration(42_000)).toBe("42s");
    expect(formatDuration(102_000)).toBe("1m 42s");
    expect(formatDuration(3_780_000)).toBe("1h 3m");
    expect(formatDelta(6)).toBe("+6");
    expect(formatDelta(-3)).toBe("−3");
    expect(formatDelta(0)).toBe("0");
  });

  it("strips confidence trailers and shortens text on word boundaries", () => {
    expect(stripConfidence("Answer\n\nCONFIDENCE: 80")).toBe("Answer");
    expect(stripJudgeConfidence("Verdict\nJUDGE_CONFIDENCE: 9")).toBe("Verdict");
    expect(excerpt("short")).toBe("short");
    const long = "word ".repeat(80);
    const out = excerpt(long, 200);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith("…")).toBe(true);
    expect(excerpt("x".repeat(300), 200)).toBe(`${"x".repeat(199)}…`);
    expect(excerpt("alpha beta gamma delta", 12)).toBe("alpha beta…");
  });
});

describe("navigation helpers", () => {
  afterEach(() => {
    // @ts-expect-error test cleanup
    delete window.matchMedia;
  });

  it("decides round completion", () => {
    const r = { ...FIXTURE_SNAPSHOT.rounds[1], consensusScore: 0 };
    expect(isRoundComplete(r, { isRunning: true, currentRound: 3, roundsCompleted: 0 })).toBe(true);
    expect(isRoundComplete(r, { isRunning: true, currentRound: 2, roundsCompleted: 0 })).toBe(
      false,
    );
    expect(isRoundComplete(r, { isRunning: false, currentRound: 2, roundsCompleted: 2 })).toBe(
      true,
    );
    expect(isRoundComplete(r, { isRunning: false, currentRound: 2, roundsCompleted: 0 })).toBe(
      false,
    );
  });

  it("finds the response behind a quote, with fallbacks", () => {
    const rounds = FIXTURE_SNAPSHOT.rounds;
    expect(findResponseTarget(rounds, [])).toBeNull();
    expect(findResponseTarget(rounds, ["p-404"], "anything")).toBeNull();
    expect(findResponseTarget(rounds, ["p-3"])).toEqual({ round: 4, participantId: "p-3" });
    // Line breaks / markdown in the answer don't break the match.
    expect(
      findResponseTarget(rounds, ["p-1", "p-3"], "Axioms: 1. Coordination cost grows"),
    ).toEqual({ round: 1, participantId: "p-3" });
    // Unmatched quote → first listed participant's latest answer.
    expect(findResponseTarget(rounds, ["p-2", "p-3"], "never said")).toEqual({
      round: 4,
      participantId: "p-2",
    });
    expect(
      findResponseTarget(rounds, ["p-1"], "Premature architecture is a top-5 startup killer."),
    ).toEqual({
      round: 1,
      participantId: "p-1",
    });
  });

  it("respects reduced motion when scrolling", () => {
    expect(prefersReducedMotion()).toBe(false);
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(true);
    const el = document.createElement("div");
    el.id = "anchor-x";
    const spy = vi.fn();
    el.scrollIntoView = spy;
    document.body.appendChild(el);
    expect(scrollToAnchor("anchor-x")).toBe(true);
    expect(spy).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    expect(scrollToAnchor("missing")).toBe(false);
    el.remove();
  });
});
