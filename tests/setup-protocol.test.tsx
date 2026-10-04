import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProtocolPicker, { parseCostCap, suggestJudgeModel } from "@/components/setup/ProtocolPicker";
import { useArenaStore } from "@/lib/store";
import { getPersona } from "@/lib/personas";
import type { ModelInfo } from "@/lib/types";

const MODELS: ModelInfo[] = [
  {
    id: "openai:gpt-4o",
    providerId: "openai",
    providerName: "OpenAI",
    modelId: "gpt-4o",
    preferred: true,
  },
  {
    id: "anthropic:claude-sonnet-4",
    providerId: "anthropic",
    providerName: "Anthropic",
    modelId: "claude-sonnet-4",
    preferred: true,
  },
  { id: "groq:llama-3.3-70b", providerId: "groq", providerName: "Groq", modelId: "llama-3.3-70b" },
];

const options = () => useArenaStore.getState().options;

beforeEach(() => {
  useArenaStore.setState(useArenaStore.getInitialState(), true);
  useArenaStore.setState({ availableModels: MODELS, modelsLoading: false });
});

/** Render with the Advanced section expanded. */
function renderOpen() {
  const utils = render(<ProtocolPicker />);
  fireEvent.click(screen.getByRole("button", { name: /Advanced/ }));
  return utils;
}

describe("ProtocolPicker — engine cards", () => {
  it("offers three engines in plain language with Debate selected by default", () => {
    render(<ProtocolPicker />);
    expect(screen.getByRole("radiogroup", { name: "Engine" })).toBeInTheDocument();
    const debate = screen.getByRole("radio", { name: "Debate (CVP)" });
    expect(debate).toBeChecked();
    expect(debate).toHaveAccessibleDescription(/see and answer each other.*1–10 rounds/);
    expect(screen.getByRole("radio", { name: /Blind jury/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Red team/ })).not.toBeChecked();
    expect(screen.getByText(/Models see and answer each other over N rounds/)).toBeInTheDocument();
    expect(screen.getByText(/Cheapest and immune to anchoring/)).toBeInTheDocument();
    expect(screen.getByText(/rotating attacker/)).toBeInTheDocument();
  });

  it("switching engine shows / hides the Debate-only toggles and the rounds stepper", () => {
    renderOpen();
    for (const name of ["Randomize order", "Blind round 1", "Early stop"]) {
      expect(screen.getByRole("switch", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("group", { name: "Rounds" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Blind jury/ }));
    expect(options().engine).toBe("blind-jury");
    for (const name of ["Randomize order", "Blind round 1", "Early stop"]) {
      expect(screen.queryByRole("switch", { name })).toBeNull();
    }
    expect(screen.queryByRole("group", { name: "Rounds" })).toBeNull();
    expect(screen.getByText("Blind jury always runs a single round.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Red team/ }));
    expect(options().engine).toBe("adversarial");
    expect(screen.queryByRole("switch", { name: "Early stop" })).toBeNull();
    expect(screen.getByRole("group", { name: "Rounds" })).toBeInTheDocument();
    expect(screen.getByText(/Red team needs at least 3/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Debate/ }));
    expect(screen.getByRole("switch", { name: "Early stop" })).toBeInTheDocument();
  });

  it("raises rounds to 3 when switching to Red team", () => {
    useArenaStore.getState().setRoundCount(2);
    render(<ProtocolPicker />);
    fireEvent.click(screen.getByRole("radio", { name: /Red team/ }));
    expect(options().rounds).toBe(3);
  });

  it("nudges Blind jury users to turn on the judge", () => {
    render(<ProtocolPicker />);
    fireEvent.click(screen.getByRole("radio", { name: /Blind jury/ }));
    fireEvent.click(screen.getByRole("button", { name: "Turn on judge" }));
    expect(options().judgeEnabled).toBe(true);
    expect(options().judgeModelId).toBe("openai:gpt-4o");
    expect(screen.queryByRole("button", { name: "Turn on judge" })).toBeNull();
  });
});

describe("ProtocolPicker — advanced", () => {
  it("is a disclosure with a summary of the current settings", () => {
    render(<ProtocolPicker />);
    const toggle = screen.getByRole("button", { name: /Advanced/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("5 rounds · judge off · claims on · no cost cap");
    expect(screen.queryByRole("switch", { name: "Early stop" })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toBeVisible();
    expect(screen.getByRole("switch", { name: "Early stop" })).toBeInTheDocument();
  });

  it("summary reflects the engine, judge, claims and cap", () => {
    useArenaStore.setState({
      options: {
        ...options(),
        engine: "blind-jury",
        judgeEnabled: true,
        judgeModelId: "openai:gpt-4o",
        extractClaimsEnabled: false,
        costCapUSD: 2,
      },
    });
    render(<ProtocolPicker />);
    expect(screen.getByRole("button", { name: /Advanced/ })).toHaveTextContent(
      "1 round · judge on · claims off · $2.00 cap",
    );
  });

  it("each toggle has a one-line explanation and writes to the store", () => {
    renderOpen();
    const cases: Array<[string, keyof ReturnType<typeof options>]> = [
      ["Randomize order", "randomizeOrder"],
      ["Blind round 1", "blindFirstRound"],
      ["Early stop", "earlyStop"],
      ["Claim extraction", "extractClaimsEnabled"],
    ];
    for (const [name, key] of cases) {
      const sw = screen.getByRole("switch", { name });
      expect(sw).toHaveAccessibleDescription(/.{20,}/);
      const before = options()[key];
      fireEvent.click(sw);
      expect(options()[key]).toBe(!before);
    }
  });

  it("rounds stepper clamps to 1–10 for Debate", () => {
    renderOpen();
    const fewer = screen.getByRole("button", { name: "Fewer rounds" });
    const more = screen.getByRole("button", { name: "More rounds" });
    fireEvent.click(more);
    expect(options().rounds).toBe(6);
    for (let i = 0; i < 10; i++) if (!more.hasAttribute("disabled")) fireEvent.click(more);
    expect(options().rounds).toBe(10);
    expect(more).toBeDisabled();
    for (let i = 0; i < 12; i++) if (!fewer.hasAttribute("disabled")) fireEvent.click(fewer);
    expect(options().rounds).toBe(1);
    expect(fewer).toBeDisabled();
    expect(screen.getByRole("group", { name: "Rounds" })).toHaveTextContent("1");
  });

  it("rounds stepper will not go below 3 for Red team", () => {
    useArenaStore.setState({ options: { ...options(), engine: "adversarial", rounds: 4 } });
    renderOpen();
    const fewer = screen.getByRole("button", { name: "Fewer rounds" });
    fireEvent.click(fewer);
    expect(options().rounds).toBe(3);
    expect(fewer).toBeDisabled();
  });

  it("warns when a loaded Red team run has fewer than 3 rounds", () => {
    useArenaStore.setState({ options: { ...options(), engine: "adversarial", rounds: 2 } });
    renderOpen();
    expect(screen.getByText(/Red team needs at least 3/)).toHaveClass("text-warning");
    fireEvent.click(screen.getByRole("button", { name: "More rounds" }));
    expect(options().rounds).toBe(3);
  });

  it("explains the rounds help for Debate with and without early stop", () => {
    renderOpen();
    expect(screen.getByText(/Early stop may end it sooner/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Early stop" }));
    expect(screen.getByText(/More rounds cost more/)).toBeInTheDocument();
  });

  it("cost cap clamps to 0–50 and empty means no cap", () => {
    renderOpen();
    const cap = screen.getByRole("spinbutton", { name: "Cost cap (USD)" });
    expect(cap).toHaveAccessibleDescription(/at most \$50/);
    fireEvent.change(cap, { target: { value: "1.5" } });
    expect(options().costCapUSD).toBe(1.5);
    fireEvent.change(cap, { target: { value: "75" } });
    expect(options().costCapUSD).toBe(50);
    expect(cap).toHaveValue(50);
    fireEvent.change(cap, { target: { value: "-3" } });
    expect(options().costCapUSD).toBe(0);
    fireEvent.change(cap, { target: { value: "" } });
    expect(options().costCapUSD).toBeUndefined();
  });

  it("turning the judge on picks a sensible default model and shows the picker", () => {
    useArenaStore.getState().addParticipant(MODELS[0], getPersona("pessimist"));
    renderOpen();
    expect(screen.queryByRole("button", { name: /^Judge model/ })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Judge synthesis" }));
    expect(options().judgeEnabled).toBe(true);
    // Preferred model not already on the panel.
    expect(options().judgeModelId).toBe("anthropic:claude-sonnet-4");
    const picker = screen.getByRole("button", { name: "Judge model Anthropic / claude-sonnet-4" });
    fireEvent.click(picker);
    fireEvent.click(screen.getByRole("menuitem", { name: /Groq/ }));
    expect(options().judgeModelId).toBe("groq:llama-3.3-70b");
    // Turning it off and on again keeps the chosen judge.
    fireEvent.click(screen.getByRole("switch", { name: "Judge synthesis" }));
    fireEvent.click(screen.getByRole("switch", { name: "Judge synthesis" }));
    expect(options().judgeModelId).toBe("groq:llama-3.3-70b");
  });

  it("explains a missing or unavailable judge model", () => {
    useArenaStore.setState({ availableModels: [], options: { ...options(), judgeEnabled: false } });
    const { unmount } = renderOpen();
    fireEvent.click(screen.getByRole("switch", { name: "Judge synthesis" }));
    expect(options().judgeModelId).toBeUndefined();
    expect(screen.getByText(/Pick a judge model, or turn the judge off/)).toBeInTheDocument();
    unmount();

    useArenaStore.setState({
      availableModels: MODELS,
      options: { ...options(), judgeEnabled: true, judgeModelId: "gone:model" },
    });
    renderOpen();
    expect(screen.getByText(/doesn't offer that judge model/)).toBeInTheDocument();
  });

  it("locks the controls while a run is in progress", () => {
    useArenaStore.setState({ isRunning: true });
    renderOpen();
    expect(screen.getByRole("radio", { name: /Blind jury/ })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Early stop" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "More rounds" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "Cost cap (USD)" })).toBeDisabled();
    // The disclosure itself still works so settings can be read.
    expect(screen.getByRole("button", { name: /Advanced/ })).toBeEnabled();
  });
});

describe("ProtocolPicker helpers", () => {
  it("parseCostCap", () => {
    expect(parseCostCap("")).toBeUndefined();
    expect(parseCostCap("  ")).toBeUndefined();
    expect(parseCostCap("abc")).toBe(0);
    expect(parseCostCap("0.25")).toBe(0.25);
    expect(parseCostCap("51")).toBe(50);
    expect(parseCostCap("-1")).toBe(0);
  });

  it("suggestJudgeModel falls back sensibly", () => {
    const seat = (m: ModelInfo) => ({ modelInfo: m });
    expect(suggestJudgeModel([], [])).toBeUndefined();
    expect(suggestJudgeModel(MODELS, [])?.id).toBe("openai:gpt-4o");
    expect(suggestJudgeModel(MODELS, [seat(MODELS[0]), seat(MODELS[1])])?.id).toBe(
      "groq:llama-3.3-70b",
    );
    expect(suggestJudgeModel(MODELS, MODELS.map(seat))?.id).toBe("openai:gpt-4o");
    expect(suggestJudgeModel([MODELS[2]], [seat(MODELS[2])])?.id).toBe("groq:llama-3.3-70b");
  });
});
