import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SetupView from "@/components/setup/SetupView";
import { PROMPT_LIBRARY } from "@/lib/prompt-library";
import { useArenaStore } from "@/lib/store";
import { PERSONAS } from "@/lib/personas";
import type { ModelInfo } from "@/lib/types";

const MODELS: ModelInfo[] = [
  { id: "openai:gpt-4o", providerId: "openai", providerName: "OpenAI", modelId: "gpt-4o" },
  {
    id: "anthropic:claude-sonnet-4",
    providerId: "anthropic",
    providerName: "Anthropic",
    modelId: "claude-sonnet-4",
  },
];

beforeEach(() => {
  localStorage.clear();
  useArenaStore.setState(useArenaStore.getInitialState(), true);
  useArenaStore.setState({ availableModels: MODELS, modelsLoading: false });
});

function renderView(showGettingStarted = false) {
  const handlers = { onRun: vi.fn(), onSweep: vi.fn(), onCancel: vi.fn() };
  render(<SetupView {...handlers} showGettingStarted={showGettingStarted} />);
  return handlers;
}

describe("SetupView", () => {
  it("composes question, panel, protocol and the run bar in one column", () => {
    renderView();
    expect(screen.getByRole("heading", { level: 1, name: "Ask the table" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Question" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Panel" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Protocol" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Estimate and run" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "How it works" })).toBeNull();
  });

  it("shows the getting-started explainer when asked", () => {
    renderView(true);
    const intro = screen.getByRole("region", { name: "How it works" });
    const steps = intro.querySelectorAll("li");
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent("Ask");
    expect(steps[1]).toHaveTextContent("Pick a panel");
    expect(steps[2]).toHaveTextContent("Run and read the brief");
  });

  it("goes from empty to runnable: example question + preset panel → Run", () => {
    const { onRun, onSweep } = renderView();
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(screen.getByText("Write a question")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: PROMPT_LIBRARY[0].label }));
    expect(screen.getByText("Add at least 2 seats")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Use a preset" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Balanced/ }));
    expect(useArenaStore.getState().participants).toHaveLength(3);

    const run = screen.getByRole("button", { name: "Run" });
    expect(run).toBeEnabled();
    fireEvent.click(run);
    fireEvent.click(screen.getByRole("button", { name: "Run all three engines" }));
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onSweep).toHaveBeenCalledTimes(1);
  });

  it("Ctrl + Enter in the question runs only when the run is allowed", () => {
    const { onRun } = renderView();
    const box = screen.getByRole("textbox", { name: "Question" });
    fireEvent.change(box, { target: { value: "Is it worth it?" } });
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    expect(onRun).not.toHaveBeenCalled(); // no seats yet

    useArenaStore.getState().addParticipant(MODELS[0], PERSONAS[0]);
    useArenaStore.getState().addParticipant(MODELS[1], PERSONAS[1]);
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("wires Stop to onCancel while running", () => {
    useArenaStore.setState({ isRunning: true });
    const { onCancel } = renderView();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
