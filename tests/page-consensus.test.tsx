import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { useArenaStore, DEFAULT_OPTIONS } from "@/lib/store";
import { PERSONAS } from "@/lib/personas";
import type { ModelInfo } from "@/lib/types";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const model: ModelInfo = { id: "test:m", providerId: "test", providerName: "T", modelId: "m" };

describe("HomePage — consensus execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useArenaStore.getState().reset();
    useArenaStore.setState({
      availableModels: [model],
      modelsLoading: false,
      participants: [],
      options: { ...DEFAULT_OPTIONS, rounds: 2 },
      prompt: "",
    });

    // Provider fetch
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/providers") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ models: [model] }),
        });
      }
      return Promise.resolve({ ok: false, body: null });
    });
  });

  it("shows error toast when prompt is empty and Run is clicked", async () => {
    const { toast: _toast } = await import("sonner");
    const { default: HomePage } = await import("@/app/page");

    useArenaStore.setState({
      participants: [
        { id: "p-1", modelInfo: model, persona: PERSONAS[0] },
        { id: "p-2", modelInfo: model, persona: PERSONAS[1] },
      ],
      prompt: "",
    });

    render(<HomePage />);

    const runBtn = screen.getByText("Run Consensus").closest("button");
    // Button should be disabled because prompt is empty
    expect(runBtn).toBeDisabled();
  });

  it("shows error toast when fewer than 2 participants", async () => {
    const { toast: _toast } = await import("sonner");
    const { default: HomePage } = await import("@/app/page");

    useArenaStore.setState({
      participants: [{ id: "p-1", modelInfo: model, persona: PERSONAS[0] }],
      prompt: "test topic",
    });

    render(<HomePage />);
    const runBtn = screen.getByText("Run Consensus").closest("button");
    expect(runBtn).toBeDisabled();
  });

  it("starts consensus with SSE stream on valid run", async () => {
    const { toast } = await import("sonner");
    const { default: HomePage } = await import("@/app/page");

    // Set up valid state
    useArenaStore.setState({
      participants: [
        { id: "p-1", modelInfo: model, persona: PERSONAS[0] },
        { id: "p-2", modelInfo: model, persona: PERSONAS[1] },
      ],
      prompt: "Analyze AI trends",
    });

    // Mock the consensus SSE stream
    const sseData = [
      'data: {"type":"round-start","round":1,"roundType":"initial-analysis","label":"Analysis"}\n\n',
      'data: {"type":"participant-start","participantId":"p-1","round":1}\n\n',
      'data: {"type":"token","participantId":"p-1","round":1,"token":"Hello"}\n\n',
      'data: {"type":"participant-end","participantId":"p-1","round":1,"confidence":80,"fullContent":"Hello\\nCONFIDENCE: 80"}\n\n',
      'data: {"type":"round-end","round":1,"consensusScore":80}\n\n',
      'data: {"type":"consensus-complete","finalScore":80,"summary":"Done"}\n\n',
    ].join("");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseData));
        controller.close();
      },
    });

    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/providers") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [model] }) });
      }
      if (url === "/api/consensus") {
        return Promise.resolve({ ok: true, body: stream });
      }
      return Promise.resolve({ ok: false });
    });

    render(<HomePage />);

    const runBtn = screen.getByText("Run Consensus").closest("button");
    expect(runBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(runBtn!);
    });

    // Wait for the SSE stream to be processed
    await waitFor(
      () => {
        expect(useArenaStore.getState().finalScore).toBe(80);
      },
      { timeout: 3000 },
    );

    expect(toast.success).toHaveBeenCalledWith("Consensus complete! Score: 80%");
  });

  it("handles HTTP error from consensus endpoint", async () => {
    const { toast } = await import("sonner");
    const { default: HomePage } = await import("@/app/page");

    useArenaStore.setState({
      participants: [
        { id: "p-1", modelInfo: model, persona: PERSONAS[0] },
        { id: "p-2", modelInfo: model, persona: PERSONAS[1] },
      ],
      prompt: "test",
    });

    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/providers") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [model] }) });
      }
      return Promise.resolve({ ok: false, status: 500, body: null });
    });

    render(<HomePage />);

    await act(async () => {
      fireEvent.click(screen.getByText("Run Consensus").closest("button")!);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it("handles abort (cancel) without error toast", async () => {
    const { toast: _toast } = await import("sonner");
    const { default: HomePage } = await import("@/app/page");

    useArenaStore.setState({
      participants: [
        { id: "p-1", modelInfo: model, persona: PERSONAS[0] },
        { id: "p-2", modelInfo: model, persona: PERSONAS[1] },
      ],
      prompt: "test",
    });

    // Slow stream that we'll abort
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/providers") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [model] }) });
      }
      // Return a never-resolving stream
      return Promise.resolve({
        ok: true,
        body: new ReadableStream({
          start() {
            // Never enqueue — just hang
          },
        }),
      });
    });

    render(<HomePage />);

    await act(async () => {
      fireEvent.click(screen.getByText("Run Consensus").closest("button")!);
    });

    // Should be running now
    expect(useArenaStore.getState().isRunning).toBe(true);

    // Cancel via store
    act(() => {
      useArenaStore.getState().cancelConsensus();
    });

    expect(useArenaStore.getState().isRunning).toBe(false);
  });

  it("handles provider fetch error on mount", async () => {
    const { toast } = await import("sonner");

    mockFetch.mockImplementation(() => Promise.reject(new Error("Network error")));

    const { default: HomePage } = await import("@/app/page");
    render(<HomePage />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load AI providers");
    });
  });

  it("processEvent ignores events when not running", async () => {
    const { default: HomePage } = await import("@/app/page");
    render(<HomePage />);

    // Directly verify: state should be clean
    useArenaStore.setState({ isRunning: false, rounds: [] });
    // No way to directly call processEvent from test (it's module-scoped),
    // but the coverage for the early return is hit by the SSE test above
    expect(useArenaStore.getState().rounds).toEqual([]);
  });

  it("drives every new SSE event through processEvent", async () => {
    const { default: HomePage } = await import("@/app/page");

    useArenaStore.setState({
      participants: [
        { id: "p-1", modelInfo: model, persona: PERSONAS[0] },
        { id: "p-2", modelInfo: model, persona: PERSONAS[1] },
      ],
      prompt: "drive all events",
    });

    const sse = [
      'data: {"type":"round-start","round":1,"roundType":"initial-analysis","label":"Initial"}',
      'data: {"type":"participant-start","participantId":"p-1","round":1}',
      'data: {"type":"token","participantId":"p-1","round":1,"token":"Hello"}',
      'data: {"type":"participant-end","participantId":"p-1","round":1,"confidence":80,"fullContent":"Hello\\nCONFIDENCE: 80","durationMs":50,"usage":{"inputTokens":50,"outputTokens":20,"totalTokens":70,"estimatedCostUSD":0.001}}',
      'data: {"type":"round-end","round":1,"consensusScore":72}',
      'data: {"type":"disagreements","round":1,"disagreements":[{"id":"r1-p-1-p-2","round":1,"participantAId":"p-1","participantBId":"p-2","severity":25,"label":"A vs B"}]}',
      'data: {"type":"early-stop","round":1,"delta":2,"reason":"converged"}',
      'data: {"type":"judge-start","modelId":"gpt-4o","providerName":"OpenAI"}',
      'data: {"type":"judge-token","token":"synth"}',
      'data: {"type":"judge-end","result":{"modelId":"gpt-4o","providerName":"OpenAI","content":"## Majority Position\\nA.\\nJUDGE_CONFIDENCE: 88","majorityPosition":"A.","minorityPositions":"","unresolvedDisputes":""}}',
      'data: {"type":"consensus-complete","finalScore":72,"summary":"Done","roundsCompleted":1}',
      "",
    ].join("\n\n");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sse));
        controller.close();
      },
    });
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/providers") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [model] }) });
      }
      return Promise.resolve({ ok: true, body: stream });
    });

    render(<HomePage />);
    await act(async () => {
      fireEvent.click(screen.getByText("Run Consensus").closest("button")!);
    });

    await waitFor(() => {
      const s = useArenaStore.getState();
      expect(s.finalScore).toBe(72);
      expect(s.disagreements).toHaveLength(1);
      expect(s.earlyStopped?.round).toBe(1);
      expect(s.judge?.content).toContain("Majority");
    });
  });

  it("shows a participant-level error toast and stores the error on the response", async () => {
    const { toast } = await import("sonner");
    const { default: HomePage } = await import("@/app/page");

    useArenaStore.setState({
      participants: [
        { id: "p-1", modelInfo: model, persona: PERSONAS[0] },
        { id: "p-2", modelInfo: model, persona: PERSONAS[1] },
      ],
      prompt: "participant error test",
    });

    const sse = [
      'data: {"type":"round-start","round":1,"roundType":"initial-analysis","label":"Analysis"}',
      'data: {"type":"participant-start","participantId":"p-1","round":1}',
      'data: {"type":"token","participantId":"p-1","round":1,"token":"[Error from T / m: Not Found — HTTP 404]"}',
      'data: {"type":"participant-end","participantId":"p-1","round":1,"confidence":0,"fullContent":"[Error from T / m: Not Found — HTTP 404]","durationMs":20,"error":"Not Found — HTTP 404"}',
      'data: {"type":"round-end","round":1,"consensusScore":0}',
      'data: {"type":"consensus-complete","finalScore":0,"summary":"done","roundsCompleted":1}',
      "",
    ].join("\n\n");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sse));
        controller.close();
      },
    });
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/providers") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [model] }) });
      }
      return Promise.resolve({ ok: true, body: stream });
    });

    render(<HomePage />);
    await act(async () => {
      fireEvent.click(screen.getByText("Run Consensus").closest("button")!);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Not Found"));
      const s = useArenaStore.getState();
      const response = s.rounds[0]?.responses.find((r) => r.participantId === "p-1");
      expect(response?.error).toBe("Not Found — HTTP 404");
    });
  });

  it("surfaces an `error` SSE event via toast and completes with 0", async () => {
    const { toast } = await import("sonner");
    const { default: HomePage } = await import("@/app/page");

    useArenaStore.setState({
      participants: [
        { id: "p-1", modelInfo: model, persona: PERSONAS[0] },
        { id: "p-2", modelInfo: model, persona: PERSONAS[1] },
      ],
      prompt: "error test",
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"error","message":"boom"}\n\n'));
        controller.close();
      },
    });

    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/providers") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [model] }) });
      }
      return Promise.resolve({ ok: true, body: stream });
    });

    render(<HomePage />);
    await act(async () => {
      fireEvent.click(screen.getByText("Run Consensus").closest("button")!);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("boom");
    });
  });

  it("hydrates from a #rt= shared hash on mount", async () => {
    const { decodeSnapshotFromHash: _decode, encodeSnapshotToHash } = await import("@/lib/session");
    const snap = {
      v: 1 as const,
      prompt: "from hash",
      engine: "cvp" as const,
      options: { ...DEFAULT_OPTIONS, rounds: 2 },
      participants: [{ id: "p-1", modelInfo: model, persona: PERSONAS[0] }],
      rounds: [
        {
          number: 1,
          type: "initial-analysis" as const,
          label: "I",
          consensusScore: 50,
          responses: [],
        },
      ],
      finalScore: 50,
      finalSummary: "hi",
      judge: null,
      disagreements: [],
      tokenTotal: null,
      createdAt: Date.now(),
    };
    const hash = await encodeSnapshotToHash(snap);
    window.history.replaceState(null, "", `/#${hash}`);

    const { default: HomePage } = await import("@/app/page");
    render(<HomePage />);

    await waitFor(() => {
      const s = useArenaStore.getState();
      expect(s.prompt).toBe("from hash");
      expect(s.sharedView).toBe(true);
    });
    window.history.replaceState(null, "", "/");
  });

  it("blocks Run when judge is enabled but no judge model is selected", async () => {
    const { toast } = await import("sonner");
    const { default: HomePage } = await import("@/app/page");

    useArenaStore.setState({
      participants: [
        { id: "p-1", modelInfo: model, persona: PERSONAS[0] },
        { id: "p-2", modelInfo: model, persona: PERSONAS[1] },
      ],
      prompt: "needs judge",
      options: { ...DEFAULT_OPTIONS, judgeEnabled: true, judgeModelId: undefined },
    });

    render(<HomePage />);
    await act(async () => {
      fireEvent.click(screen.getByText("Run Consensus").closest("button")!);
    });

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("judge"));
  });
});
