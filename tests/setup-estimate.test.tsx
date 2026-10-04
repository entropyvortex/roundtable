import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EstimateBar from "@/components/setup/EstimateBar";
import { getRunBlocker, type RunReadinessInput } from "@/lib/run-blocker";
import { SWEEP_ENGINES, combineEstimates, estimateSweep } from "@/lib/sweep";
import { DEFAULT_OPTIONS, useArenaStore } from "@/lib/store";
import { estimateRun, formatEstimate } from "@/lib/estimate";
import { DEFAULT_CUSTOM_SPEC, PERSONAS } from "@/lib/personas";
import type { ModelInfo } from "@/lib/types";

const MODELS: ModelInfo[] = [
  { id: "openai:gpt-4o", providerId: "openai", providerName: "OpenAI", modelId: "gpt-4o" },
  {
    id: "anthropic:claude-sonnet-4",
    providerId: "anthropic",
    providerName: "Anthropic",
    modelId: "claude-sonnet-4",
  },
  { id: "local:mystery", providerId: "local", providerName: "Local", modelId: "mystery-model" },
];

function seed({
  seats = 2,
  prompt = "Should we adopt a four-day week?",
  models = MODELS,
}: { seats?: number; prompt?: string; models?: ModelInfo[] } = {}) {
  useArenaStore.setState(useArenaStore.getInitialState(), true);
  useArenaStore.setState({ availableModels: models, modelsLoading: false, prompt });
  for (let i = 0; i < seats; i++) {
    useArenaStore.getState().addParticipant(MODELS[i % 2], PERSONAS[i]);
  }
}

function renderBar() {
  const handlers = { onRun: vi.fn(), onSweep: vi.fn(), onCancel: vi.fn() };
  render(<EstimateBar {...handlers} />);
  return handlers;
}

const runBtn = () => screen.getByRole("button", { name: "Run" });
const sweepBtn = () => screen.getByRole("button", { name: "Run all three engines" });

beforeEach(() => seed());

describe("getRunBlocker — custom personas", () => {
  it("blocks a custom persona whose spec is missing or invalid", () => {
    const seat = {
      modelInfo: MODELS[0],
      persona: { ...PERSONAS[0], id: "custom", name: "Mine" },
    };
    const base = {
      prompt: "q",
      availableModels: MODELS,
      modelsLoading: false,
      options: { judgeEnabled: false },
    };
    expect(getRunBlocker({ ...base, participants: [seat, seat] })).toBe(
      "Rebuild the custom persona",
    );
    const spec = { ...DEFAULT_CUSTOM_SPEC, name: "Mine" };
    expect(
      getRunBlocker({
        ...base,
        participants: [
          { ...seat, customPersonaSpec: spec },
          { ...seat, customPersonaSpec: spec },
        ],
      }),
    ).toBeNull();
  });
});

describe("getRunBlocker", () => {
  const ok: RunReadinessInput = {
    prompt: "Question?",
    participants: [{ modelInfo: MODELS[0] }, { modelInfo: MODELS[1] }],
    availableModels: MODELS,
    modelsLoading: false,
    options: { judgeEnabled: false },
  };

  it("returns null when the run can start", () => {
    expect(getRunBlocker(ok)).toBeNull();
    expect(getRunBlocker({ ...ok, prompt: "x".repeat(10_000) })).toBeNull();
  });

  it("explains each blocking condition in plain words", () => {
    expect(getRunBlocker({ ...ok, modelsLoading: true })).toBe("Fetching providers…");
    expect(getRunBlocker({ ...ok, availableModels: [] })).toMatch(/No models available/);
    expect(getRunBlocker({ ...ok, prompt: "   " })).toBe("Write a question");
    expect(getRunBlocker({ ...ok, prompt: "x".repeat(10_001) })).toBe(
      "Shorten the question to 10,000 characters",
    );
    expect(getRunBlocker({ ...ok, participants: [ok.participants[0]] })).toBe(
      "Add at least 2 seats",
    );
    expect(
      getRunBlocker({ ...ok, participants: Array.from({ length: 9 }, () => ok.participants[0]) }),
    ).toMatch(/8 is the maximum/);
    expect(
      getRunBlocker({
        ...ok,
        participants: [...ok.participants, { modelInfo: { ...MODELS[0], id: "gone:x" } }],
      }),
    ).toMatch(/doesn't offer/);
    expect(getRunBlocker({ ...ok, options: { judgeEnabled: true } })).toMatch(/Pick a judge model/);
    expect(
      getRunBlocker({ ...ok, options: { judgeEnabled: true, judgeModelId: "gone:judge" } }),
    ).toMatch(/judge model this server offers/);
    expect(
      getRunBlocker({ ...ok, options: { judgeEnabled: true, judgeModelId: MODELS[1].id } }),
    ).toBeNull();
  });
});

describe("combineEstimates", () => {
  it("sums the engines of a sweep", () => {
    const { participants, options } = useArenaStore.getState();
    const parts = SWEEP_ENGINES.map((engine) => estimateRun(participants, { ...options, engine }));
    const total = combineEstimates(parts);
    expect(total.calls).toBe(parts.reduce((s, e) => s + e.calls, 0));
    expect(total.estCostUSD.high).toBeCloseTo(
      parts.reduce((s, e) => s + e.estCostUSD.high, 0),
      10,
    );
    expect(combineEstimates([]).calls).toBe(0);
    const withUnpriced = combineEstimates([
      { ...parts[0], unpricedModels: ["a"], exceedsCostCap: true },
      { ...parts[1], unpricedModels: ["a", "b"] },
    ]);
    expect(withUnpriced.unpricedModels).toEqual(["a", "b"]);
    expect(withUnpriced.exceedsCostCap).toBe(true);
  });
});

describe("estimateSweep", () => {
  const seats = [{ modelInfo: { modelId: "gpt-4o" } }, { modelInfo: { modelId: "gpt-4o" } }];
  const base = { ...DEFAULT_OPTIONS, extractClaimsEnabled: false, earlyStop: false };

  it("estimates the Red team leg at 3 rounds when Debate is set to fewer", () => {
    const options = { ...base, rounds: 2 };
    const sweep = estimateSweep(seats, options, 120);
    const expected = combineEstimates([
      estimateRun(seats, { ...options, engine: "cvp" }, 120),
      estimateRun(seats, { ...options, engine: "blind-jury" }, 120),
      estimateRun(seats, { ...options, engine: "adversarial", rounds: 3 }, 120),
    ]);
    expect(sweep).toEqual(expected);
    // Debate 2 + Blind jury 1 + Red team 3.
    expect(sweep.maxRounds).toBe(6);
    expect(sweep.calls).toBe(12);
  });

  it("matches a plain per-engine sum when rounds are already ≥ 3", () => {
    const options = { ...base, rounds: 4 };
    expect(estimateSweep(seats, options)).toEqual(
      combineEstimates(SWEEP_ENGINES.map((engine) => estimateRun(seats, { ...options, engine }))),
    );
  });
});

describe("EstimateBar", () => {
  it("renders the formatted estimate for the current setup", () => {
    renderBar();
    const { participants, options, prompt } = useArenaStore.getState();
    const expected = formatEstimate(estimateRun(participants, options, prompt.length));
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(expected).toMatch(/^≈ .* calls · .* · .*min$/);
    expect(screen.getByText("Debate (CVP) · 2 seats")).toBeInTheDocument();
  });

  it("lists its assumptions in a tooltip", () => {
    renderBar();
    const info = screen.getByRole("button", { name: "How the estimate is worked out" });
    const tip = screen.getByRole("tooltip", { hidden: true });
    expect(info).toHaveAttribute("aria-describedby", tip.id);
    expect(tip).toHaveTextContent(/1,200 output tokens per answer/);
    expect(tip).toHaveTextContent(/Later rounds re-read earlier answers/);
    expect(tip).toHaveTextContent(/Early stop may end the debate after round 2/);
    expect(tip).toHaveTextContent(/Includes claim extraction/);
    expect(tip).toHaveTextContent(/Run all three engines: ≈/);
    fireEvent.focus(info);
    expect(screen.getByRole("tooltip")).toBeVisible();
  });

  it("mentions the judge and unpriced models in the assumptions", () => {
    seed({ seats: 0 });
    useArenaStore.getState().addParticipant(MODELS[2], PERSONAS[0]);
    useArenaStore.getState().addParticipant(MODELS[0], PERSONAS[1]);
    useArenaStore.getState().setOption("judgeEnabled", true);
    useArenaStore.getState().setOption("judgeModelId", MODELS[0].id);
    useArenaStore.getState().setOption("extractClaimsEnabled", false);
    renderBar();
    const tip = screen.getByRole("tooltip", { hidden: true });
    expect(tip).toHaveTextContent(/Includes the judge\./);
    expect(tip).toHaveTextContent(/No price data for mystery-model; counted as \$0/);
  });

  it("asks for seats instead of estimating an empty panel", () => {
    seed({ seats: 0 });
    renderBar();
    expect(screen.getByText("Add seats to see an estimate")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /How the estimate/ })).toBeNull();
  });

  it.each([
    [
      "while providers load",
      () => useArenaStore.setState({ modelsLoading: true }),
      "Fetching providers…",
    ],
    ["without a question", () => useArenaStore.setState({ prompt: "" }), "Write a question"],
    ["with fewer than 2 seats", () => seed({ seats: 1 }), "Add at least 2 seats"],
  ])("disables Run and Sweep %s, with a visible reason", (_label, arrange, reason) => {
    arrange();
    const { onRun, onSweep } = renderBar();
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(runBtn()).toBeDisabled();
    expect(sweepBtn()).toBeDisabled();
    expect(runBtn()).toHaveAccessibleDescription(reason);
    expect(sweepBtn()).toHaveAccessibleDescription(reason);
    fireEvent.click(runBtn());
    fireEvent.click(sweepBtn());
    expect(onRun).not.toHaveBeenCalled();
    expect(onSweep).not.toHaveBeenCalled();
  });

  it("fires onRun and onSweep when ready", () => {
    const { onRun, onSweep, onCancel } = renderBar();
    expect(runBtn()).toBeEnabled();
    fireEvent.click(runBtn());
    fireEvent.click(sweepBtn());
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onSweep).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("warns when the high estimate is above the cost cap", () => {
    useArenaStore.getState().setOption("costCapUSD", 0.01);
    renderBar();
    expect(screen.getByText(/above your \$0.01 cost cap/)).toBeInTheDocument();
  });

  it("shows Stop while a run is in flight and reports the round", () => {
    useArenaStore.getState().startConsensus();
    useArenaStore.setState({ currentRound: 2 });
    const { onCancel, onRun } = renderBar();
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Running round 2 of 5");
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onRun).not.toHaveBeenCalled();
  });

  it("says Starting… before the first round begins", () => {
    useArenaStore.setState({ isRunning: true, currentRound: 0 });
    renderBar();
    expect(screen.getByRole("status")).toHaveTextContent("Starting…");
  });

  it("shows sweep progress and a Stop sweep button", () => {
    useArenaStore.setState({
      isRunning: true,
      sweepActive: true,
      sweepEngines: ["cvp", "blind-jury", "adversarial"],
      sweepCurrentIndex: 1,
    });
    const { onCancel } = renderBar();
    expect(screen.getByRole("status")).toHaveTextContent("Engine 2 of 3 · Blind jury");
    fireEvent.click(screen.getByRole("button", { name: "Stop sweep" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("handles a sweep flag without an engine list", () => {
    useArenaStore.setState({ isRunning: true, sweepActive: true, sweepEngines: [] });
    renderBar();
    expect(screen.getByRole("status")).toHaveTextContent(/^Engine 1 of 3$/);
  });
});
