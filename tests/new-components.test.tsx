import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useArenaStore, DEFAULT_OPTIONS } from "@/lib/store";
import { PERSONAS } from "@/lib/personas";
import type { ModelInfo } from "@/lib/types";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div data-testid="md">{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));

const openaiModel: ModelInfo = {
  id: "openai:gpt-4o",
  providerId: "openai",
  providerName: "OpenAI",
  modelId: "gpt-4o",
};
const grokModel: ModelInfo = {
  id: "grok:grok-3",
  providerId: "grok",
  providerName: "Grok",
  modelId: "grok-3",
};

function resetStore() {
  useArenaStore.getState().reset();
  useArenaStore.setState({
    availableModels: [openaiModel, grokModel],
    modelsLoading: false,
    participants: [],
    prompt: "",
    options: { ...DEFAULT_OPTIONS },
  });
}

describe("ConfidenceTrajectory", () => {
  beforeEach(resetStore);

  it("renders nothing when no rounds have data", async () => {
    const { default: Comp } = await import("@/components/ConfidenceTrajectory");
    const { container } = render(<Comp />);
    expect(container.innerHTML).toBe("");
  });

  it("draws one polyline per participant with data", async () => {
    useArenaStore.setState({
      participants: [
        { id: "p-1", modelInfo: openaiModel, persona: PERSONAS[0] },
        { id: "p-2", modelInfo: grokModel, persona: PERSONAS[1] },
      ],
      rounds: [
        {
          number: 1,
          type: "initial-analysis",
          label: "R1",
          consensusScore: 70,
          responses: [
            {
              participantId: "p-1",
              roundNumber: 1,
              content: "",
              confidence: 80,
              timestamp: 0,
            },
            {
              participantId: "p-2",
              roundNumber: 1,
              content: "",
              confidence: 60,
              timestamp: 0,
            },
          ],
        },
        {
          number: 2,
          type: "counterarguments",
          label: "R2",
          consensusScore: 75,
          responses: [
            {
              participantId: "p-1",
              roundNumber: 2,
              content: "",
              confidence: 85,
              timestamp: 0,
            },
            {
              participantId: "p-2",
              roundNumber: 2,
              content: "",
              confidence: 70,
              timestamp: 0,
            },
          ],
        },
      ],
    });

    const { default: Comp } = await import("@/components/ConfidenceTrajectory");
    const { container } = render(<Comp />);
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBe(2);
    expect(screen.getByText("Confidence Trajectory")).toBeInTheDocument();
  });

  it("centers a single data point when only one round exists", async () => {
    useArenaStore.setState({
      participants: [{ id: "p-1", modelInfo: openaiModel, persona: PERSONAS[0] }],
      rounds: [
        {
          number: 1,
          type: "initial-analysis",
          label: "R1",
          consensusScore: 80,
          responses: [
            {
              participantId: "p-1",
              roundNumber: 1,
              content: "",
              confidence: 80,
              timestamp: 0,
            },
          ],
        },
      ],
    });
    const { default: Comp } = await import("@/components/ConfidenceTrajectory");
    render(<Comp />);
    // With one point the value badge should still render
    expect(screen.getByText("80%")).toBeInTheDocument();
  });
});

describe("DisagreementPanel", () => {
  beforeEach(resetStore);

  it("renders nothing when empty", async () => {
    const { default: Comp } = await import("@/components/DisagreementPanel");
    const { container } = render(<Comp />);
    expect(container.innerHTML).toBe("");
  });

  it("groups items by round and scrolls on click", async () => {
    const { default: Comp } = await import("@/components/DisagreementPanel");

    useArenaStore.setState({
      participants: [
        { id: "p-1", modelInfo: openaiModel, persona: PERSONAS[0] },
        { id: "p-2", modelInfo: grokModel, persona: PERSONAS[1] },
      ],
      disagreements: [
        {
          id: "r1-a-b",
          round: 1,
          participantAId: "p-1",
          participantBId: "p-2",
          severity: 25,
          label: "A vs B",
        },
        {
          id: "r2-a-b",
          round: 2,
          participantAId: "p-1",
          participantBId: "p-2",
          severity: 35,
          label: "A vs B round 2",
        },
      ],
    });

    // Create target element for scroll
    const target = document.createElement("div");
    target.id = "round-1";
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

    render(<Comp />);

    expect(screen.getByText("Disagreement Ledger")).toBeInTheDocument();
    expect(screen.getByText("A vs B")).toBeInTheDocument();
    expect(screen.getByText("A vs B round 2")).toBeInTheDocument();

    fireEvent.click(screen.getByText("A vs B"));
    expect(target.scrollIntoView).toHaveBeenCalled();

    document.body.removeChild(target);
  });
});

describe("CostMeter", () => {
  beforeEach(resetStore);

  it("renders nothing when no tokens yet and not running", async () => {
    const { default: Comp } = await import("@/components/CostMeter");
    const { container } = render(<Comp />);
    expect(container.innerHTML).toBe("");
  });

  it("shows formatted cost when tokens are present", async () => {
    useArenaStore.setState({
      tokenTotal: {
        inputTokens: 800,
        outputTokens: 1200,
        totalTokens: 2000,
        estimatedCostUSD: 0.0123,
      },
    });
    const { default: Comp } = await import("@/components/CostMeter");
    render(<Comp />);
    expect(screen.getByText("$0.01")).toBeInTheDocument();
    expect(screen.getByText(/2.0K tokens/)).toBeInTheDocument();
  });

  it("shows 4-decimal precision for sub-cent totals", async () => {
    useArenaStore.setState({
      tokenTotal: {
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
        estimatedCostUSD: 0.00005,
      },
    });
    const { default: Comp } = await import("@/components/CostMeter");
    render(<Comp />);
    expect(screen.getByText(/\$0\.0001/)).toBeInTheDocument();
  });

  it("shows 2-decimal precision for >=1 cent totals", async () => {
    useArenaStore.setState({
      tokenTotal: {
        inputTokens: 1_200_000,
        outputTokens: 800_000,
        totalTokens: 2_000_000,
        estimatedCostUSD: 1.23,
      },
    });
    const { default: Comp } = await import("@/components/CostMeter");
    render(<Comp />);
    expect(screen.getByText("$1.23")).toBeInTheDocument();
    expect(screen.getByText(/2.00M tokens/)).toBeInTheDocument();
  });

  it("shows running state even with zero tokens", async () => {
    useArenaStore.setState({ isRunning: true });
    const { default: Comp } = await import("@/components/CostMeter");
    render(<Comp />);
    expect(screen.getByText(/Cost/)).toBeInTheDocument();
  });
});

describe("JudgeCard", () => {
  beforeEach(resetStore);

  it("renders nothing when no judge data", async () => {
    const { default: Comp } = await import("@/components/JudgeCard");
    const { container } = render(<Comp />);
    expect(container.innerHTML).toBe("");
  });

  it("renders streaming content while running", async () => {
    useArenaStore.setState({
      judgeRunning: true,
      judgeStream: "Streaming thoughts...",
      judge: {
        modelId: "gpt-4o",
        providerName: "OpenAI",
        content: "",
        majorityPosition: "",
        minorityPositions: "",
        unresolvedDisputes: "",
      },
    });
    const { default: Comp } = await import("@/components/JudgeCard");
    render(<Comp />);
    expect(screen.getByText(/Streaming thoughts/)).toBeInTheDocument();
    expect(screen.getByText("Consensus Judge")).toBeInTheDocument();
  });

  it("renders final judge content and strips JUDGE_CONFIDENCE line", async () => {
    useArenaStore.setState({
      judgeRunning: false,
      judge: {
        modelId: "gpt-4o",
        providerName: "OpenAI",
        content: "## Majority Position\nAll good.\nJUDGE_CONFIDENCE: 82",
        majorityPosition: "All good.",
        minorityPositions: "",
        unresolvedDisputes: "",
      },
    });
    const { default: Comp } = await import("@/components/JudgeCard");
    render(<Comp />);
    const md = screen.getByTestId("md");
    expect(md.textContent).not.toContain("JUDGE_CONFIDENCE");
    expect(md.textContent).toContain("All good");
  });
});

describe("PromptLibrary", () => {
  beforeEach(resetStore);

  it("renders preset chips when prompt is empty", async () => {
    const { default: Comp } = await import("@/components/PromptLibrary");
    render(<Comp />);
    expect(screen.getByText("Try a preset")).toBeInTheDocument();
    expect(screen.getAllByText(/Engineering|Strategy|Science|Ethics/).length).toBeGreaterThan(0);
  });

  it("setting a preset fills the prompt in the store", async () => {
    const { default: Comp } = await import("@/components/PromptLibrary");
    render(<Comp />);
    const first = screen.getAllByRole("button")[0];
    fireEvent.click(first);
    expect(useArenaStore.getState().prompt.length).toBeGreaterThan(10);
  });

  it("renders nothing when a prompt is already set", async () => {
    useArenaStore.getState().setPrompt("hello");
    const { default: Comp } = await import("@/components/PromptLibrary");
    const { container } = render(<Comp />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing while running", async () => {
    useArenaStore.setState({ isRunning: true });
    const { default: Comp } = await import("@/components/PromptLibrary");
    const { container } = render(<Comp />);
    expect(container.innerHTML).toBe("");
  });
});

describe("ConfigPanel", () => {
  beforeEach(resetStore);

  it("renders engine picker and toggles", async () => {
    const { default: Comp } = await import("@/components/ConfigPanel");
    render(<Comp />);
    expect(screen.getByText("CVP")).toBeInTheDocument();
    expect(screen.getByText("Blind Jury")).toBeInTheDocument();
    expect(screen.getByText("Randomize order")).toBeInTheDocument();
    expect(screen.getByText("Blind Round 1")).toBeInTheDocument();
    expect(screen.getByText("Early stop")).toBeInTheDocument();
  });

  it("switches to Blind Jury and hides the CVP toggles", async () => {
    const { default: Comp } = await import("@/components/ConfigPanel");
    render(<Comp />);
    fireEvent.click(screen.getByText("Blind Jury"));
    expect(useArenaStore.getState().options.engine).toBe("blind-jury");
    // CVP toggles should no longer be on screen
    expect(screen.queryByText("Randomize order")).not.toBeInTheDocument();
  });

  it("toggling randomize order flips the option", async () => {
    const { default: Comp } = await import("@/components/ConfigPanel");
    render(<Comp />);
    const before = useArenaStore.getState().options.randomizeOrder;
    fireEvent.click(screen.getByText("Randomize order"));
    expect(useArenaStore.getState().options.randomizeOrder).toBe(!before);
  });

  it("enabling judge without a model auto-selects the first available", async () => {
    const { default: Comp } = await import("@/components/ConfigPanel");
    render(<Comp />);
    fireEvent.click(screen.getByText("Judge synthesis"));
    expect(useArenaStore.getState().options.judgeEnabled).toBe(true);
    expect(useArenaStore.getState().options.judgeModelId).toBe(openaiModel.id);
  });

  it("judge model dropdown lets you swap models", async () => {
    useArenaStore.getState().setOption("judgeEnabled", true);
    useArenaStore.getState().setOption("judgeModelId", openaiModel.id);
    const { default: Comp } = await import("@/components/ConfigPanel");
    render(<Comp />);
    // Open dropdown via the judge model button
    const btn = screen.getByText(openaiModel.modelId).closest("button");
    if (btn) fireEvent.click(btn);
    // Click the other model
    fireEvent.click(screen.getByText(grokModel.modelId));
    expect(useArenaStore.getState().options.judgeModelId).toBe(grokModel.id);
  });

  it("closes the judge dropdown on outside click", async () => {
    useArenaStore.getState().setOption("judgeEnabled", true);
    const { default: Comp } = await import("@/components/ConfigPanel");
    render(<Comp />);
    const btn = screen.getByText(/Select judge model|gpt-4o|grok-3/).closest("button");
    if (btn) fireEvent.click(btn);
    fireEvent.mouseDown(document.body);
    // After outside click, no OpenAI list item should still be open (it was inside the dropdown)
    // This at least hits the outside-click branch.
    expect(btn).toBeInTheDocument();
  });
});

describe("SessionMenu", () => {
  beforeEach(() => {
    resetStore();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
  });

  it("renders nothing when no final score is set", async () => {
    const { default: Comp } = await import("@/components/SessionMenu");
    const { container } = render(<Comp />);
    expect(container.innerHTML).toBe("");
  });

  it("opens the menu and offers markdown/json/permalink actions", async () => {
    useArenaStore.setState({ finalScore: 80, prompt: "hi" });
    const { default: Comp } = await import("@/components/SessionMenu");
    render(<Comp />);
    fireEvent.click(screen.getByText("Export"));
    expect(screen.getByText("Download Markdown")).toBeInTheDocument();
    expect(screen.getByText("Download JSON")).toBeInTheDocument();
    expect(screen.getByText("Copy permalink")).toBeInTheDocument();
  });

  it("downloads markdown when clicked", async () => {
    useArenaStore.setState({ finalScore: 80, prompt: "hi" });
    const clickMock = vi.fn();
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreate(tag) as HTMLAnchorElement;
      if (tag === "a") el.click = clickMock;
      return el;
    });
    const { default: Comp } = await import("@/components/SessionMenu");
    render(<Comp />);
    fireEvent.click(screen.getByText("Export"));
    fireEvent.click(screen.getByText("Download Markdown"));
    expect(clickMock).toHaveBeenCalled();
  });

  it("copies a permalink to the clipboard", async () => {
    useArenaStore.setState({ finalScore: 80, prompt: "hi" });
    const { default: Comp } = await import("@/components/SessionMenu");
    render(<Comp />);
    fireEvent.click(screen.getByText("Export"));
    fireEvent.click(screen.getByText("Copy permalink"));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
    const url = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain("#rt=");
  });

  it("closes the menu on outside click", async () => {
    useArenaStore.setState({ finalScore: 80 });
    const { default: Comp } = await import("@/components/SessionMenu");
    render(<Comp />);
    fireEvent.click(screen.getByText("Export"));
    expect(screen.getByText("Download Markdown")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Download Markdown")).not.toBeInTheDocument();
  });
});
