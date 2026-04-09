import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useArenaStore } from "@/lib/store";

// Mock sonner
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

// Mock react-markdown
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useArenaStore.getState().reset();
    useArenaStore.setState({
      availableModels: [],
      modelsLoading: true,
      participants: [],
      roundCount: 5,
      prompt: "",
    });

    // Default: providers fetch returns models
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          models: [
            {
              id: "grok:grok-3",
              providerId: "grok",
              providerName: "Grok",
              modelId: "grok-3",
              preferred: true,
            },
          ],
        }),
      body: null,
    });
  });

  it("renders header with RoundTable branding", async () => {
    const { default: HomePage } = await import("@/app/page");
    render(<HomePage />);
    expect(screen.getByText("RoundTable")).toBeInTheDocument();
    expect(screen.getByText("Multi-AI Consensus Playground")).toBeInTheDocument();
  });

  it("renders sidebar with configuration section", async () => {
    const { default: HomePage } = await import("@/app/page");
    render(<HomePage />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Rounds")).toBeInTheDocument();
  });

  it("renders prompt textarea", async () => {
    const { default: HomePage } = await import("@/app/page");
    render(<HomePage />);
    expect(screen.getByPlaceholderText(/Enter a topic/)).toBeInTheDocument();
  });

  it("shows Run Consensus button disabled when no participants", async () => {
    const { default: HomePage } = await import("@/app/page");
    render(<HomePage />);
    const btn = screen.getByText("Run Consensus").closest("button");
    expect(btn).toBeDisabled();
  });

  it("shows onboarding overlay on first visit", async () => {
    const { default: HomePage } = await import("@/app/page");
    render(<HomePage />);
    expect(screen.getByText("Add Participants to Begin")).toBeInTheDocument();
  });

  it("dismisses onboarding on click", async () => {
    const { default: HomePage } = await import("@/app/page");
    render(<HomePage />);
    const overlay = screen.getByText("Add Participants to Begin").closest("[class*='fixed']");
    if (overlay) fireEvent.click(overlay);
    await waitFor(() => {
      expect(screen.queryByText("Add Participants to Begin")).not.toBeInTheDocument();
    });
  });

  it("increments and decrements round count", async () => {
    const { default: HomePage } = await import("@/app/page");
    render(<HomePage />);

    // Find the round count display
    expect(screen.getByText("5")).toBeInTheDocument();

    // Click + button (second button after the minus)
    const buttons = screen.getAllByRole("button");
    const plusBtn = buttons.find((b) => b.querySelector(".lucide-plus"));
    const minusBtn = buttons.find((b) => b.querySelector(".lucide-minus"));

    if (plusBtn) {
      fireEvent.click(plusBtn);
      expect(useArenaStore.getState().roundCount).toBe(6);
    }
    if (minusBtn) {
      fireEvent.click(minusBtn);
      expect(useArenaStore.getState().roundCount).toBe(5);
    }
  });

  it("updates prompt in store on textarea change", async () => {
    const { default: HomePage } = await import("@/app/page");
    render(<HomePage />);
    const textarea = screen.getByPlaceholderText(/Enter a topic/);
    fireEvent.change(textarea, { target: { value: "Test prompt" } });
    expect(useArenaStore.getState().prompt).toBe("Test prompt");
  });

  it("shows running state with cancel button", async () => {
    const { default: HomePage } = await import("@/app/page");
    useArenaStore.setState({ isRunning: true, currentRound: 2, progress: 0.4 });
    render(<HomePage />);

    expect(screen.getByText(/Round 2 of/)).toBeInTheDocument();
    // Cancel button should be visible
    const cancelBtns = screen.getAllByText("Cancel");
    expect(cancelBtns.length).toBeGreaterThan(0);
  });

  it("shows final score when consensus is complete", async () => {
    const { default: HomePage } = await import("@/app/page");
    useArenaStore.setState({ finalScore: 88 });
    render(<HomePage />);

    expect(screen.getByText("Final Consensus: 88%")).toBeInTheDocument();
  });

  it("fetches providers on mount", async () => {
    const { default: HomePage } = await import("@/app/page");
    render(<HomePage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/providers");
    });
  });

  it("handles Escape key for cancellation", async () => {
    const { default: HomePage } = await import("@/app/page");
    useArenaStore.getState().startConsensus();
    render(<HomePage />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(useArenaStore.getState().isRunning).toBe(false);
  });

  it("shows askgrokmcp link in header", async () => {
    const { default: HomePage } = await import("@/app/page");
    render(<HomePage />);
    const link = screen.getByText("Protocol inspired by askgrokmcp");
    expect(link).toHaveAttribute("href", "https://github.com/marceloceccon/askgrokmcp");
  });

  it("shows participant count and round count in status line", async () => {
    const { default: HomePage } = await import("@/app/page");
    render(<HomePage />);
    expect(screen.getByText(/0 participants/)).toBeInTheDocument();
    expect(screen.getByText(/5 rounds/)).toBeInTheDocument();
  });

  it("shows reset button when consensus is complete", async () => {
    const { default: HomePage } = await import("@/app/page");
    useArenaStore.setState({ finalScore: 90 });
    render(<HomePage />);
    expect(screen.getByText("Reset")).toBeInTheDocument();
  });
});
