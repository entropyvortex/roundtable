import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useArenaStore } from "@/lib/store";
import { PERSONAS } from "@/lib/personas";
import type { ModelInfo } from "@/lib/types";

// Mock sonner
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

// Mock react-markdown to avoid ESM issues
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));

const mockModel: ModelInfo = {
  id: "test:model-1",
  providerId: "test",
  providerName: "TestProv",
  modelId: "model-1",
  preferred: true,
};

const mockModel2: ModelInfo = {
  id: "test:model-2",
  providerId: "test",
  providerName: "TestProv",
  modelId: "model-2",
};

describe("ResultPanel", () => {
  beforeEach(() => {
    useArenaStore.getState().reset();
    useArenaStore.setState({
      participants: [],
      options: { ...useArenaStore.getState().options, rounds: 3 },
      isRunning: false,
      rounds: [],
      finalScore: null,
    });
  });

  it("renders nothing when no rounds", async () => {
    const { default: ResultPanel } = await import("@/components/ResultPanel");
    const { container } = render(<ResultPanel />);
    expect(container.innerHTML).toBe("");
  });

  it("renders rounds and responses", async () => {
    const { default: ResultPanel } = await import("@/components/ResultPanel");

    useArenaStore.setState({
      participants: [{ id: "p-1", modelInfo: mockModel, persona: PERSONAS[0] }],
      rounds: [
        {
          number: 1,
          type: "initial-analysis",
          label: "Initial Analysis",
          responses: [
            {
              participantId: "p-1",
              roundNumber: 1,
              content: "Test response here",
              confidence: 80,
              timestamp: Date.now(),
            },
          ],
          consensusScore: 80,
        },
      ],
      currentRound: 2,
    });

    render(<ResultPanel />);
    expect(screen.getByText(/Round 1/)).toBeInTheDocument();
    expect(screen.getByText("Initial Analysis")).toBeInTheDocument();
    const badges = screen.getAllByText("80%");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it("renders final consensus when complete", async () => {
    const { default: ResultPanel } = await import("@/components/ResultPanel");

    useArenaStore.setState({
      participants: [{ id: "p-1", modelInfo: mockModel, persona: PERSONAS[0] }],
      rounds: [
        { number: 1, type: "initial-analysis", label: "A", responses: [], consensusScore: 0 },
      ],
      finalScore: 92,
      finalSummary: "Great consensus reached",
    });

    render(<ResultPanel />);
    expect(screen.getByText("Consensus Reached")).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
    expect(screen.getByText("Great consensus reached")).toBeInTheDocument();
  });

  it("shows progress bar with correct percentage", async () => {
    const { default: ResultPanel } = await import("@/components/ResultPanel");

    useArenaStore.setState({
      rounds: [
        { number: 1, type: "initial-analysis", label: "A", responses: [], consensusScore: 0 },
      ],
      progress: 0.6,
      isRunning: true,
      currentRound: 2,
      options: { ...useArenaStore.getState().options, rounds: 3 },
    });

    render(<ResultPanel />);
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText(/Round 2\/3/)).toBeInTheDocument();
  });

  it("shows cancel button when running", async () => {
    const { default: ResultPanel } = await import("@/components/ResultPanel");

    useArenaStore.setState({
      rounds: [
        { number: 1, type: "initial-analysis", label: "A", responses: [], consensusScore: 0 },
      ],
      isRunning: true,
      currentRound: 1,
    });

    render(<ResultPanel />);
    expect(screen.getByText("Stop")).toBeInTheDocument();
  });
});

describe("BackToTop", () => {
  it("renders nothing when no rounds", async () => {
    const { default: BackToTop } = await import("@/components/BackToTop");

    useArenaStore.setState({ rounds: [], finalScore: null });
    const { container } = render(<BackToTop />);
    expect(container.innerHTML).toBe("");
  });
});

describe("MessageFlowDiagram", () => {
  beforeEach(() => {
    useArenaStore.getState().reset();
  });

  it("renders nothing when no rounds", async () => {
    const { default: MessageFlowDiagram } = await import("@/components/MessageFlowDiagram");
    useArenaStore.setState({ rounds: [] });
    const { container } = render(<MessageFlowDiagram />);
    expect(container.innerHTML).toBe("");
  });

  it("renders flow events when rounds exist", async () => {
    const { default: MessageFlowDiagram } = await import("@/components/MessageFlowDiagram");

    useArenaStore.setState({
      participants: [{ id: "p-1", modelInfo: mockModel, persona: PERSONAS[0] }],
      rounds: [
        {
          number: 1,
          type: "initial-analysis",
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

    render(<MessageFlowDiagram />);
    expect(screen.getByText("Message Flow")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument(); // message count
  });
});

describe("AISelector", () => {
  beforeEach(() => {
    useArenaStore.getState().reset();
    useArenaStore.setState({
      availableModels: [mockModel, mockModel2],
      modelsLoading: false,
      participants: [],
    });
  });

  it("shows loading state", async () => {
    const { default: AISelector } = await import("@/components/AISelector");
    useArenaStore.setState({ modelsLoading: true });

    render(<AISelector />);
    expect(screen.getByText("Fetching providers...")).toBeInTheDocument();
  });

  it("shows error when no models available", async () => {
    const { default: AISelector } = await import("@/components/AISelector");
    useArenaStore.setState({ availableModels: [], modelsLoading: false });

    render(<AISelector />);
    expect(screen.getByText("No AI models available")).toBeInTheDocument();
  });

  it("renders model selector and persona selector", async () => {
    const { default: AISelector } = await import("@/components/AISelector");

    render(<AISelector />);
    expect(screen.getByText("Select model...")).toBeInTheDocument();
    expect(screen.getByText("Add to Arena")).toBeInTheDocument();
  });

  it("add button is disabled without model selection", async () => {
    const { default: AISelector } = await import("@/components/AISelector");

    render(<AISelector />);
    const addBtn = screen.getByText("Add to Arena").closest("button");
    expect(addBtn).toBeDisabled();
  });

  it("shows participants after adding", async () => {
    const { default: AISelector } = await import("@/components/AISelector");

    useArenaStore.getState().addParticipant(mockModel, PERSONAS[0]);
    useArenaStore.getState().addParticipant(mockModel2, PERSONAS[1]);

    render(<AISelector />);
    expect(screen.getByText("Participants (2)")).toBeInTheDocument();
  });
});
