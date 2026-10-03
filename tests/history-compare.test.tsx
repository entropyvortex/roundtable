import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Participant, SessionSnapshot } from "@/lib/types";
import CompareRuns, { finalConfidences, matchParticipants } from "@/components/history/CompareRuns";
import { MINUS } from "@/lib/format";
import { FIXTURE_PARTICIPANTS, FIXTURE_SNAPSHOT, FIXTURE_SNAPSHOT_JURY } from "./fixtures/snapshot";
import { entryOf } from "./helpers/history";

const T = new Date(2026, 8, 20, 9, 30).getTime();

const CVP = entryOf(FIXTURE_SNAPSHOT, { id: "cvp", savedAt: T, title: "Debate run" });
const JURY = entryOf(FIXTURE_SNAPSHOT_JURY, {
  id: "jury",
  savedAt: T + 86_400_000,
  title: "Jury run",
});

/** The cells of the table row whose header matches `name`. */
function row(name: string | RegExp) {
  const header = screen.getByRole("rowheader", { name });
  const tr = header.closest("tr") as HTMLTableRowElement;
  const cells = within(tr).getAllByRole("cell");
  return { tr, a: cells[0], b: cells[1], change: cells[2] };
}

describe("CompareRuns", () => {
  it("compares the two fixture runs side by side", () => {
    const onClose = vi.fn();
    render(<CompareRuns a={CVP} b={JURY} onClose={onClose} />);

    const heading = screen.getByRole("heading", { name: "Compare runs" });
    expect(heading).toHaveFocus();
    const [colA, colB, colChange] = screen.getAllByRole("columnheader");
    expect(colA).toHaveTextContent("Run ADebate run");
    expect(colB).toHaveTextContent("Run BJury run");
    expect(colChange).toHaveTextContent("Change");

    // Same question → one merged cell.
    const q = screen.getByRole("rowheader", { name: "Question" }).closest("tr")!;
    expect(within(q).getByText("Same question")).toBeInTheDocument();
    expect(within(q).getAllByRole("cell")).toHaveLength(1);

    const engine = row("Engine");
    expect(engine.a).toHaveTextContent("Debate (CVP)");
    expect(engine.b).toHaveTextContent("Blind jury");

    const score = row("Final score");
    expect(score.a).toHaveTextContent("80Strong agreement");
    expect(score.b).toHaveTextContent("74Broad agreement with reservations");
    expect(score.change).toHaveTextContent(`${MINUS}6`);

    const judge = row("Judge majority");
    expect(judge.a).toHaveTextContent(/^Start with a modular monolith/);
    expect(judge.a.textContent!.length).toBeLessThanOrEqual(240);

    const claims = row(/Contradictions/);
    expect(
      within(claims.a)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "Whether decomposing a monolith later is cheap enough to defer",
      "Whether modern tooling reduces microservice operational burden",
    ]);
    expect(claims.a).toHaveTextContent(/^2/);
    expect(claims.b).toHaveTextContent(/^1/);
    expect(claims.change).toHaveTextContent(`${MINUS}1`);

    const flags = row(/Disagreement flags/);
    expect(flags.a).toHaveTextContent("4");
    expect(flags.b).toHaveTextContent("1");
    expect(flags.change).toHaveTextContent(`${MINUS}3`);

    const panel = row("Participants");
    expect(panel.a).toHaveTextContent("Risk AnalystGrok / grok-4-fast-reasoning");
    expect(within(panel.b).getAllByRole("listitem")).toHaveLength(3);

    // Final confidence per persona: CVP round 4 vs jury round 1.
    const risk = row("Risk Analyst");
    expect(risk.a).toHaveTextContent(/^91/);
    expect(risk.b).toHaveTextContent(/^85/);
    expect(risk.change).toHaveTextContent(`${MINUS}6`);
    const fut = row("Optimistic Futurist");
    expect(fut.a).toHaveTextContent(/^72/);
    expect(fut.b).toHaveTextContent(/^60/);
    expect(fut.change).toHaveTextContent(`${MINUS}12`);
    const fpe = row("First-Principles Engineer");
    expect(fpe.a).toHaveTextContent(/^93/);
    expect(fpe.b).toHaveTextContent(/^90/);
    expect(fpe.change).toHaveTextContent(`${MINUS}3`);

    const cost = row("Cost");
    expect(cost.a).toHaveTextContent("$0.13");
    expect(cost.b).toHaveTextContent("$0.03");
    expect(cost.change).toHaveTextContent(`${MINUS}$0.10`);

    const tokens = row("Tokens");
    expect(tokens.a).toHaveTextContent("42,700");
    expect(tokens.b).toHaveTextContent("7,230");
    expect(tokens.change).toHaveTextContent(`${MINUS}35,470`);

    const saved = row("Saved");
    expect(saved.a).toHaveTextContent("Sep 20, 2026");
    expect(saved.b).toHaveTextContent("Sep 21, 2026");

    fireEvent.click(screen.getByRole("button", { name: "Close comparison" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("always puts the older run in column A", () => {
    render(<CompareRuns a={JURY} b={CVP} onClose={vi.fn()} />);
    const score = row("Final score");
    expect(score.a).toHaveTextContent(/^80/);
    expect(score.change).toHaveTextContent(`${MINUS}6`);
    expect(row("Risk Analyst").a).toHaveTextContent(/^91/);
  });

  it("handles different questions, panels and missing data", () => {
    const newcomer: Participant = {
      ...FIXTURE_PARTICIPANTS[0],
      id: "p-9",
      persona: { ...FIXTURE_PARTICIPANTS[0].persona, id: "skeptic", name: "Skeptic" },
    };
    const other: SessionSnapshot = {
      ...FIXTURE_SNAPSHOT_JURY,
      prompt: "A completely different question",
      participants: [FIXTURE_PARTICIPANTS[0], newcomer],
      rounds: [
        {
          ...FIXTURE_SNAPSHOT_JURY.rounds[0],
          responses: [
            { ...FIXTURE_SNAPSHOT_JURY.rounds[0].responses[0], confidence: 95 },
            {
              participantId: "p-9",
              roundNumber: 1,
              content: "",
              confidence: 0,
              timestamp: 1,
              error: "Not Found (HTTP 404)",
            },
          ],
        },
      ],
      finalScore: null,
      judge: null,
      claims: null,
      disagreements: [],
      tokenTotal: null,
    };
    const b = entryOf(other, { id: "other", savedAt: T + 1000, title: "Run other", cost: 0 });
    render(<CompareRuns a={CVP} b={b} onClose={vi.fn()} />);

    const q = row("Question");
    expect(q.a).toHaveTextContent(/^Should an early-stage startup/);
    expect(q.b).toHaveTextContent("A completely different question");

    expect(row("Final score").b).toHaveTextContent("No score");
    expect(row("Final score").change).toHaveTextContent("—");
    expect(row("Judge majority").b).toHaveTextContent("No judge verdict");
    expect(row(/Contradictions/).b).toHaveTextContent("Not extracted");
    expect(row(/Contradictions/).change).toHaveTextContent("—");
    expect(row(/Disagreement flags/).change).toHaveTextContent(`${MINUS}4`);
    expect(row("Cost").b).toHaveTextContent("—");
    expect(row("Cost").change).toHaveTextContent("—");
    expect(row("Tokens").b).toHaveTextContent("—");
    expect(row("Tokens").change).toHaveTextContent("—");

    expect(row("Risk Analyst").b).toHaveTextContent(/^95/);
    expect(row("Risk Analyst").change).toHaveTextContent("+4");
    expect(row("Optimistic Futurist").b).toHaveTextContent("Not on this panel");
    expect(row("Optimistic Futurist").change).toHaveTextContent("—");
    const sk = row("Skeptic");
    expect(sk.a).toHaveTextContent("Not on this panel");
    expect(sk.b).toHaveTextContent("No answer");
  });

  it("shows an extraction error, judge content fallback and an empty panel", () => {
    const a: SessionSnapshot = {
      ...FIXTURE_SNAPSHOT,
      claims: { ...FIXTURE_SNAPSHOT.claims!, error: "timeout" },
      judge: { ...FIXTURE_SNAPSHOT.judge!, majorityPosition: "", content: "Only raw content." },
    };
    const b: SessionSnapshot = {
      ...FIXTURE_SNAPSHOT_JURY,
      participants: [],
      judge: { ...FIXTURE_SNAPSHOT.judge!, majorityPosition: "", content: "" },
    };
    render(
      <CompareRuns
        a={entryOf(a, { id: "a", savedAt: T, title: "Run a" })}
        b={entryOf(b, { id: "b", savedAt: T + 5, title: "Run b" })}
        onClose={vi.fn()}
      />,
    );
    expect(row(/Contradictions/).a).toHaveTextContent("Extraction failed");
    expect(row("Judge majority").a).toHaveTextContent("Only raw content.");
    expect(row("Judge majority").b).toHaveTextContent("No judge verdict");
    expect(row("Participants").b).toHaveTextContent("None");
  });

  it("shows a placeholder when neither run has participants", () => {
    const empty: SessionSnapshot = { ...FIXTURE_SNAPSHOT, participants: [], rounds: [] };
    render(
      <CompareRuns
        a={entryOf(empty, { id: "a", savedAt: T, title: "Run a" })}
        b={entryOf(empty, { id: "b", savedAt: T + 5, title: "Run b" })}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("No participants.")).toBeInTheDocument();
  });
});

describe("finalConfidences", () => {
  it("uses each participant's last non-errored answer", () => {
    const snap: SessionSnapshot = {
      ...FIXTURE_SNAPSHOT,
      rounds: [
        FIXTURE_SNAPSHOT.rounds[3],
        {
          ...FIXTURE_SNAPSHOT.rounds[0],
          number: 5,
          responses: [
            { ...FIXTURE_SNAPSHOT.rounds[0].responses[0], confidence: 10, error: "boom" },
          ],
        },
        FIXTURE_SNAPSHOT.rounds[0],
      ],
    };
    // Rounds are ordered by number, so round 4 wins over round 1 and the
    // errored round-5 answer is ignored.
    expect(Object.fromEntries(finalConfidences(snap))).toEqual({
      "p-1": 91,
      "p-2": 72,
      "p-3": 93,
    });
  });

  it("returns null for participants who never answered", () => {
    const snap = { ...FIXTURE_SNAPSHOT, rounds: undefined } as unknown as SessionSnapshot;
    expect(finalConfidences(snap).get("p-1")).toBeNull();
    const none = { ...FIXTURE_SNAPSHOT, participants: undefined } as unknown as SessionSnapshot;
    expect(finalConfidences(none).get("p-1")).toBe(91);
  });
});

describe("matchParticipants", () => {
  const custom = (id: string, name: string): Participant => ({
    ...FIXTURE_PARTICIPANTS[0],
    id,
    persona: { ...FIXTURE_PARTICIPANTS[0].persona, id: "custom", name, custom: true },
  });

  it("tells custom personas apart by name and pairs repeated personas in order", () => {
    const a: SessionSnapshot = {
      ...FIXTURE_SNAPSHOT,
      participants: [
        custom("c1", "Hawk"),
        FIXTURE_PARTICIPANTS[0],
        { ...FIXTURE_PARTICIPANTS[0], id: "p-1b" },
      ],
      rounds: [],
    };
    const b: SessionSnapshot = {
      ...FIXTURE_SNAPSHOT,
      participants: [custom("c2", "Dove"), FIXTURE_PARTICIPANTS[0]],
      rounds: [],
    };
    const m = matchParticipants(a, b);
    expect(m.map((x) => [x.key, !!x.a, !!x.b])).toEqual([
      ["pessimist#0", true, true],
      ["custom:Hawk#0", true, false],
      ["pessimist#1", true, false],
      ["custom:Dove#0", false, true],
    ]);
    expect(m[0].a?.participant.id).toBe("p-1");
    expect(m[0].b?.participant.id).toBe("p-1");
  });

  it("tolerates snapshots without participants", () => {
    const bare = { ...FIXTURE_SNAPSHOT, participants: undefined } as unknown as SessionSnapshot;
    expect(matchParticipants(bare, bare)).toEqual([]);
  });
});
