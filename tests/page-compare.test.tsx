// Page: Compare attempts end to end — Setup (engine card, task, attempts
// editor) → POST /api/adjudicate → SSE → store → CompareView.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import HomePage from "@/app/page";
import { useArenaStore, DEFAULT_OPTIONS } from "@/lib/store";
import { clearHistory, listRuns } from "@/lib/history";
import type { CompareEvent, CompareRequest, CompareResult } from "@/lib/types";
import { MODELS, SEATS, liveStream } from "./helpers/page-harness";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div data-testid="md">{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));

function result(overrides: Partial<CompareResult> = {}): CompareResult {
  const ranked = (id: string, label: string, rank: number, points: number, extra = {}) => ({
    candidateId: id,
    label,
    rank,
    points,
    firstPlaceVotes: rank === 1 ? 2 : 0,
    findingWeight: 0,
    failedChecks: [],
    eligible: true,
    ...extra,
  });
  return {
    task: "Fix the off-by-one",
    candidates: [
      { id: "attempt-1", label: "A", checks: [] },
      { id: "attempt-2", label: "B", checks: [{ name: "tests", status: "failed" }] },
    ],
    verdict: "winner",
    recommended: "attempt-1",
    leader: "attempt-1",
    ranking: [
      ranked("attempt-1", "A", 1, 2),
      ranked("attempt-2", "B", 2, 0, {
        failedChecks: ["tests"],
        eligible: false,
        findingWeight: 3,
      }),
    ],
    agreement: { kendallW: 1, threshold: 0.3, votes: 2 },
    findings: [
      { candidateId: "attempt-1", label: "A", verified: [], dropped: 0 },
      {
        candidateId: "attempt-2",
        label: "B",
        verified: [
          {
            candidateId: "attempt-2",
            severity: "high",
            file: "src/range.ts",
            line: 12,
            quote: "for (let i = 0; i <= n; i++)",
            issue: "Iterates one past the end.",
            reportedBy: ["p-1", "p-2"],
          },
        ],
        dropped: 1,
      },
    ],
    droppedFindings: 1,
    dissent: [],
    rounds: [],
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, calls: 3, estimatedCalls: 0 },
    stopReason: "completed",
    startedAt: 0,
    completedAt: 0,
    durationMs: 0,
    ...overrides,
  } as CompareResult;
}

const JUDGE = {
  modelId: "gpt-4o",
  providerName: "OpenAI",
  content: "x",
  majorityPosition: "Both jurors chose the first attempt.",
  minorityPositions: "None.",
  unresolvedDisputes: "- None",
};

function events(r: CompareResult): CompareEvent[] {
  return [
    {
      type: "compare-start",
      attempts: [
        { id: "attempt-1", label: "Claude branch" },
        { id: "attempt-2", label: "Codex branch" },
      ],
      jurorIds: ["p-1", "p-2"],
    },
    { type: "compare-round-start", round: 1, kind: "blind" },
    { type: "juror-start", jurorId: "p-1", round: 1 },
    { type: "juror-start", jurorId: "p-2", round: 1 },
    {
      type: "juror-end",
      jurorId: "p-1",
      round: 1,
      status: "valid",
      ranking: [],
      verified: 1,
      dropped: 0,
      durationMs: 1,
    },
    {
      type: "juror-end",
      jurorId: "p-2",
      round: 1,
      status: "abstained",
      ranking: [],
      verified: 0,
      dropped: 1,
      reason: "output is not a single JSON object",
      durationMs: 1,
    },
    { type: "compare-round-end", round: 1, kendallW: 1, votes: 2 },
    { type: "judge-start", modelId: "gpt-4o", providerName: "OpenAI" },
    { type: "judge-end", result: JUDGE },
    {
      type: "compare-complete",
      result: r,
      tokenTotal: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUSD: 0.0123 },
    },
  ];
}

let requests: CompareRequest[] = [];
let script: CompareEvent[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  requests = [];
  script = events(result());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/providers")
        return { ok: true, status: 200, json: async () => ({ models: MODELS }) };
      if (url === "/api/adjudicate") {
        requests.push(JSON.parse(String(init?.body)) as CompareRequest);
        const live = liveStream(init?.signal);
        live.push(script.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""));
        live.close();
        return { ok: true, status: 200, body: live.stream };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
  useArenaStore.setState(useArenaStore.getInitialState(), true);
  useArenaStore.setState({
    participants: SEATS,
    prompt: "Fix the off-by-one",
    options: { ...DEFAULT_OPTIONS, judgeEnabled: true, judgeModelId: MODELS[0].id },
  });
  localStorage.clear();
  clearHistory();
});

afterEach(() => {
  useArenaStore.getState().cancelConsensus();
});

async function setUpCompare() {
  render(<HomePage />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument());
  fireEvent.click(screen.getByRole("radio", { name: /Compare attempts/ }));
  const editor = screen.getByRole("region", { name: "Attempts" });
  const labels = within(editor).getAllByRole("textbox", { name: "Label" });
  const solutions = within(editor).getAllByRole("textbox", { name: /Solution/ });
  fireEvent.change(labels[0]!, { target: { value: "Claude branch" } });
  fireEvent.change(solutions[0]!, { target: { value: "+ for (let i = 0; i < n; i++)" } });
  fireEvent.change(labels[1]!, { target: { value: "Codex branch" } });
  fireEvent.change(solutions[1]!, { target: { value: "+ for (let i = 0; i <= n; i++)" } });
  fireEvent.click(within(editor).getAllByRole("button", { name: "Add check result" })[1]!);
  fireEvent.change(within(editor).getByRole("textbox", { name: "Check" }), {
    target: { value: " tests " },
  });
  fireEvent.change(within(editor).getByRole("combobox", { name: "Result" }), {
    target: { value: "failed" },
  });
  return editor;
}

describe("Compare attempts — Setup", () => {
  it("turns the question into a task, shows the attempts editor and hides debate-only controls", async () => {
    await setUpCompare();
    expect(screen.getByRole("heading", { name: "Task" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run all three engines" })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /Claim extraction/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
  });

  it("blocks the run until every attempt is pasted", async () => {
    const editor = await setUpCompare();
    fireEvent.change(within(editor).getAllByRole("textbox", { name: /Solution/ })[1]!, {
      target: { value: " " },
    });
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(screen.getByText("Paste attempt 2")).toBeInTheDocument();
  });
});

describe("Compare attempts — run", () => {
  it("posts the comparison and shows the verdict, ranking, agreement, findings and synthesis", async () => {
    await setUpCompare();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => expect(screen.getByText("Recommended: Claude branch")).toBeInTheDocument());
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      task: "Fix the off-by-one",
      attempts: [
        { label: "Claude branch", content: "+ for (let i = 0; i < n; i++)", checks: [] },
        { label: "Codex branch", checks: [{ name: "tests", status: "failed" }] },
      ],
      options: { judgeEnabled: true, judgeModelId: MODELS[0].id },
    });
    expect(requests[0]!.participants.map((p) => p.id)).toEqual(["p-1", "p-2"]);

    const ranking = screen.getByRole("region", { name: "Ranking" });
    const rows = within(ranking).getAllByRole("row");
    const cells = (row: HTMLElement) =>
      within(row)
        .getAllByRole("cell")
        .map((c) => c.textContent);
    expect(cells(rows[1]!)).toEqual(["1", "Claude branchrecommended", "2", "2", "0", "—"]);
    expect(cells(rows[2]!)).toEqual(["2", "Codex branch", "0", "0", "3", "failed: tests"]);
    expect(within(ranking).getByText("1.00")).toBeInTheDocument();

    const findings = screen.getByRole("region", { name: "Findings" });
    expect(within(findings).getByText(/1 dropped in total/)).toBeInTheDocument();
    expect(within(findings).getByText("Iterates one past the end.")).toBeInTheDocument();
    expect(within(findings).getByText("src/range.ts:12")).toBeInTheDocument();
    expect(within(findings).getByText("reported by 2 jurors")).toBeInTheDocument();

    const jurors = screen.getByRole("region", { name: "Jurors" });
    expect(within(jurors).getByText("output is not a single JSON object")).toBeInTheDocument();
    expect(within(jurors).getByText("abstained")).toBeInTheDocument();

    expect(screen.getByText("Both jurors chose the first attempt.")).toBeInTheDocument();
    expect(screen.getByText(/est\. \$0\.0123/)).toBeInTheDocument();
    // Compare runs are not saved as debate snapshots.
    expect(listRuns()).toHaveLength(0);
  });

  it("explains a missing winner", async () => {
    script = events(
      result({
        verdict: "no-clear-winner",
        recommended: null,
        noClearWinnerReason: "low-agreement",
        agreement: { kendallW: 0.11, threshold: 0.3, votes: 3 },
        stopReason: "deadline",
      }),
    );
    await setUpCompare();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(screen.getByText("No clear winner")).toBeInTheDocument());
    expect(screen.getByText(/agreement \(Kendall's W\) is 0\.11, below 0\.30/)).toBeInTheDocument();
    expect(screen.getByText("Leading on points: Claude branch")).toBeInTheDocument();
    expect(screen.getByText(/Stopped at the time limit/)).toBeInTheDocument();
  });
});
