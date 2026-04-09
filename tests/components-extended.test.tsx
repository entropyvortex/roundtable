import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useArenaStore } from "@/lib/store";
import { PERSONAS } from "@/lib/personas";
import type { ModelInfo } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));

const model1: ModelInfo = {
  id: "prov:m1",
  providerId: "prov",
  providerName: "Prov",
  modelId: "m1",
  preferred: true,
};
const model2: ModelInfo = {
  id: "prov:m2",
  providerId: "prov",
  providerName: "Prov",
  modelId: "m2",
};
const model3: ModelInfo = {
  id: "other:m3",
  providerId: "other",
  providerName: "Other",
  modelId: "m3",
};

describe("AISelector — interactions", () => {
  beforeEach(() => {
    useArenaStore.getState().reset();
    useArenaStore.setState({
      availableModels: [model1, model2, model3],
      modelsLoading: false,
      participants: [],
    });
  });

  it("opens provider dropdown on click", async () => {
    const { default: AISelector } = await import("@/components/AISelector");
    render(<AISelector />);

    fireEvent.click(screen.getByText("Select model..."));
    expect(screen.getByText("Providers")).toBeInTheDocument();
  });

  it("shows provider names in dropdown", async () => {
    const { default: AISelector } = await import("@/components/AISelector");
    render(<AISelector />);

    fireEvent.click(screen.getByText("Select model..."));
    expect(screen.getByText("Prov")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  it("opens persona dropdown on click", async () => {
    const { default: AISelector } = await import("@/components/AISelector");
    render(<AISelector />);

    // Click the persona button (shows default persona name)
    const personaBtn = screen.getByText("First-Principles Engineer").closest("button");
    if (personaBtn) fireEvent.click(personaBtn);

    expect(screen.getByText("Choose Persona")).toBeInTheDocument();
  });

  it("removes participant on X click", async () => {
    const { default: AISelector } = await import("@/components/AISelector");
    useArenaStore.getState().addParticipant(model1, PERSONAS[0]);
    expect(useArenaStore.getState().participants).toHaveLength(1);

    render(<AISelector />);

    // Find and click the remove button (X icon)
    const removeButtons = screen.getAllByRole("button");
    const xButton = removeButtons.find((b) => b.querySelector(".lucide-x"));
    if (xButton) fireEvent.click(xButton);

    expect(useArenaStore.getState().participants).toHaveLength(0);
  });

  it("closes dropdown on Escape key", async () => {
    const { default: AISelector } = await import("@/components/AISelector");
    render(<AISelector />);

    fireEvent.click(screen.getByText("Select model..."));
    expect(screen.getByText("Providers")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    // Portal dropdown should be removed
    expect(screen.queryByText("Providers")).not.toBeInTheDocument();
  });

  it("disables controls when running", async () => {
    const { default: AISelector } = await import("@/components/AISelector");
    useArenaStore.setState({ isRunning: true });

    render(<AISelector />);
    const addBtn = screen.getByText("Add to Arena").closest("button");
    expect(addBtn).toBeDisabled();
  });

  it("shows model count per provider", async () => {
    const { default: AISelector } = await import("@/components/AISelector");
    render(<AISelector />);

    fireEvent.click(screen.getByText("Select model..."));
    expect(screen.getByText("2 models")).toBeInTheDocument(); // prov has 2
    expect(screen.getByText("1 model")).toBeInTheDocument(); // other has 1
  });
});

describe("ResultPanel — copy button", () => {
  beforeEach(() => {
    useArenaStore.getState().reset();
    // Mock clipboard
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("has a copy button on completed response cards", async () => {
    const { default: ResultPanel } = await import("@/components/ResultPanel");

    useArenaStore.setState({
      participants: [{ id: "p-1", modelInfo: model1, persona: PERSONAS[0] }],
      rounds: [
        {
          number: 1,
          type: "initial-analysis" as const,
          label: "Analysis",
          responses: [
            {
              participantId: "p-1",
              roundNumber: 1,
              content: "Response content\nCONFIDENCE: 70",
              confidence: 70,
              timestamp: Date.now(),
            },
          ],
          consensusScore: 70,
        },
      ],
      currentRound: 2,
    });

    render(<ResultPanel />);
    const copyBtn = screen.getByTitle("Copy to clipboard");
    expect(copyBtn).toBeInTheDocument();

    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Response content");
  });
});

describe("ResultPanel — streaming state", () => {
  beforeEach(() => {
    useArenaStore.getState().reset();
  });

  it("shows streaming cards with cursor for active streams", async () => {
    const { default: ResultPanel } = await import("@/components/ResultPanel");

    useArenaStore.setState({
      participants: [{ id: "p-1", modelInfo: model1, persona: PERSONAS[0] }],
      isRunning: true,
      currentRound: 1,
      rounds: [
        {
          number: 1,
          type: "initial-analysis" as const,
          label: "Analysis",
          responses: [],
          consensusScore: 0,
        },
      ],
      activeStreams: { "p-1": "Streaming content here..." },
    });

    render(<ResultPanel />);
    expect(screen.getByText("Streaming content here...")).toBeInTheDocument();
  });
});

describe("ResultPanel — back to top", () => {
  it("renders back to top button when rounds exist", async () => {
    const { default: ResultPanel } = await import("@/components/ResultPanel");

    useArenaStore.setState({
      rounds: [
        {
          number: 1,
          type: "initial-analysis" as const,
          label: "A",
          responses: [],
          consensusScore: 0,
        },
      ],
    });

    render(<ResultPanel />);
    expect(screen.getByText("Back to top")).toBeInTheDocument();
  });

  it("calls scrollTo on click", async () => {
    const { default: ResultPanel } = await import("@/components/ResultPanel");

    useArenaStore.setState({
      rounds: [
        {
          number: 1,
          type: "initial-analysis" as const,
          label: "A",
          responses: [],
          consensusScore: 0,
        },
      ],
    });

    render(<ResultPanel />);
    fireEvent.click(screen.getByText("Back to top"));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });
});

describe("MessageFlowDiagram — click to scroll", () => {
  beforeEach(() => {
    useArenaStore.getState().reset();
  });

  it("clicking a message row calls scrollIntoView on the target element", async () => {
    const { default: MessageFlowDiagram } = await import("@/components/MessageFlowDiagram");

    useArenaStore.setState({
      participants: [{ id: "p-1", modelInfo: model1, persona: PERSONAS[0] }],
      rounds: [
        {
          number: 1,
          type: "initial-analysis" as const,
          label: "Initial Analysis",
          responses: [
            {
              participantId: "p-1",
              roundNumber: 1,
              content: "Some analysis",
              confidence: 75,
              timestamp: Date.now(),
            },
          ],
          consensusScore: 75,
        },
      ],
    });

    // Create mock target element
    const mockEl = document.createElement("div");
    mockEl.id = "r1-p-1";
    mockEl.scrollIntoView = vi.fn();
    mockEl.classList.add = vi.fn();
    mockEl.classList.remove = vi.fn();
    document.body.appendChild(mockEl);

    render(<MessageFlowDiagram />);

    // Click the message row (find by model name — multiple matches, get the flow row one)
    const matches = screen.getAllByText("m1");
    const row = matches.find((el) => el.closest("button[class*='rounded-lg']"))?.closest("button");
    if (row) fireEvent.click(row);

    expect(mockEl.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });

    document.body.removeChild(mockEl);
  });

  it("toggles collapsed state on header click", async () => {
    const { default: MessageFlowDiagram } = await import("@/components/MessageFlowDiagram");

    useArenaStore.setState({
      participants: [{ id: "p-1", modelInfo: model1, persona: PERSONAS[0] }],
      rounds: [
        {
          number: 1,
          type: "initial-analysis" as const,
          label: "Analysis",
          responses: [
            {
              participantId: "p-1",
              roundNumber: 1,
              content: "X",
              confidence: 50,
              timestamp: Date.now(),
            },
          ],
          consensusScore: 50,
        },
      ],
    });

    render(<MessageFlowDiagram />);

    // Click header to collapse
    const header = screen.getByText("Message Flow").closest("button");
    if (header) fireEvent.click(header);

    // Content should be hidden after collapse
    expect(screen.queryByText("CVP")).not.toBeInTheDocument();

    // Click again to expand
    if (header) fireEvent.click(header);
    expect(screen.getByText("CVP")).toBeInTheDocument();
  });

  it("shows running indicator", async () => {
    const { default: MessageFlowDiagram } = await import("@/components/MessageFlowDiagram");

    useArenaStore.setState({
      participants: [{ id: "p-1", modelInfo: model1, persona: PERSONAS[0] }],
      isRunning: true,
      currentRound: 2,
      rounds: [
        {
          number: 1,
          type: "initial-analysis" as const,
          label: "A",
          responses: [],
          consensusScore: 0,
        },
      ],
    });

    render(<MessageFlowDiagram />);
    expect(screen.getByText(/Round 2/)).toBeInTheDocument();
  });
});

describe("BackToTop — visibility logic", () => {
  it("renders nothing when no rounds and not scrolled", async () => {
    const { default: BackToTop } = await import("@/components/BackToTop");
    useArenaStore.setState({ rounds: [], finalScore: null });
    const { container } = render(<BackToTop />);
    expect(container.innerHTML).toBe("");
  });

  it("shows with consensus score when complete and scrolled", async () => {
    const { default: BackToTop } = await import("@/components/BackToTop");

    useArenaStore.setState({
      rounds: [
        {
          number: 1,
          type: "initial-analysis" as const,
          label: "A",
          responses: [],
          consensusScore: 0,
        },
      ],
      finalScore: 95,
    });

    // Simulate scroll
    Object.defineProperty(window, "scrollY", { value: 700, writable: true });
    render(<BackToTop />);
    act(() => {
      fireEvent.scroll(window);
    });

    // Should now be visible and show score
    expect(screen.getByText("Back to top")).toBeInTheDocument();
    expect(screen.getByText("95%")).toBeInTheDocument();
  });

  it("calls scrollTo when clicked", async () => {
    const { default: BackToTop } = await import("@/components/BackToTop");

    useArenaStore.setState({
      rounds: [
        {
          number: 1,
          type: "initial-analysis" as const,
          label: "A",
          responses: [],
          consensusScore: 0,
        },
      ],
      finalScore: 80,
    });

    Object.defineProperty(window, "scrollY", { value: 700, writable: true });
    render(<BackToTop />);
    act(() => {
      fireEvent.scroll(window);
    });

    fireEvent.click(screen.getByText("Back to top"));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });
});
