import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import PanelEditor, { suggestModel } from "@/components/setup/PanelEditor";
import { useArenaStore } from "@/lib/store";
import { PERSONAS, getPersona } from "@/lib/personas";
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
    id: "openai:gpt-4o-mini",
    providerId: "openai",
    providerName: "OpenAI",
    modelId: "gpt-4o-mini",
  },
  {
    id: "anthropic:claude-sonnet-4",
    providerId: "anthropic",
    providerName: "Anthropic",
    modelId: "claude-sonnet-4",
    preferred: true,
  },
  {
    id: "groq:llama-3.3-70b",
    providerId: "groq",
    providerName: "Groq",
    modelId: "llama-3.3-70b",
  },
];

function seed(opts: { participants?: number; modelsLoading?: boolean; models?: ModelInfo[] } = {}) {
  useArenaStore.setState(useArenaStore.getInitialState(), true);
  useArenaStore.setState({
    availableModels: opts.models ?? MODELS,
    modelsLoading: opts.modelsLoading ?? false,
  });
  const { addParticipant } = useArenaStore.getState();
  for (let i = 0; i < (opts.participants ?? 0); i++) {
    addParticipant(MODELS[i % MODELS.length], PERSONAS[i % PERSONAS.length]);
  }
}

const seats = () => useArenaStore.getState().participants;
const seatList = () => screen.getByRole("list", { name: "Seats" });

beforeEach(() => {
  localStorage.clear();
  seed();
});

describe("PanelEditor — states", () => {
  it("shows a loading state but keeps existing seats visible", () => {
    seed({ modelsLoading: true, participants: 2 });
    render(<PanelEditor />);
    expect(screen.getByRole("status")).toHaveTextContent("Fetching providers…");
    expect(within(seatList()).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Add seat" })).toBeNull();
    expect(screen.getByRole("button", { name: "Use a preset" })).toBeDisabled();
  });

  it("explains how to configure providers when no models are available", () => {
    seed({ models: [] });
    render(<PanelEditor />);
    expect(screen.getByText("No AI models available")).toBeInTheDocument();
    expect(screen.getByText("AI_PROVIDERS")).toBeInTheDocument();
    expect(screen.getByText(".env.local")).toBeInTheDocument();
    expect(screen.queryByText(/No seats yet/)).toBeNull();
  });

  it("shows an empty-panel hint and the seat count", () => {
    render(<PanelEditor />);
    expect(screen.getByText(/No seats yet/)).toBeInTheDocument();
    expect(screen.getByText("0 of 8 seats")).toBeInTheDocument();
  });

  it("flags a seat whose model this server does not offer", () => {
    seed({ participants: 1 });
    useArenaStore
      .getState()
      .addParticipant(
        { id: "gone:model", providerId: "gone", providerName: "Gone", modelId: "old-model" },
        getPersona("domain-expert"),
      );
    render(<PanelEditor />);
    expect(screen.getAllByText(/doesn't offer this model/)).toHaveLength(1);
  });
});

describe("PanelEditor — presets", () => {
  it("applies a preset straight away to an empty panel", () => {
    render(<PanelEditor />);
    fireEvent.click(screen.getByRole("button", { name: "Use a preset" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Balanced/ }));
    expect(seats().map((p) => p.persona.id)).toEqual([
      "pessimist",
      "optimistic-futurist",
      "first-principles",
    ]);
    // Preferred providers first, round-robin across providers.
    expect(seats().map((p) => p.modelInfo.providerId)).toEqual(["openai", "anthropic", "groq"]);
    expect(within(seatList()).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("3 of 8 seats")).toBeInTheDocument();
  });

  it("asks before replacing a non-empty panel, and can keep it", () => {
    seed({ participants: 2 });
    const before = seats().map((p) => p.id);
    render(<PanelEditor />);
    fireEvent.click(screen.getByRole("button", { name: "Use a preset" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Red team/ }));
    const confirm = screen.getByRole("group", {
      name: "Replace the 2 current seats with the Red team preset?",
    });
    expect(within(confirm).getByRole("button", { name: "Replace seats" })).toHaveFocus();
    expect(seats().map((p) => p.id)).toEqual(before);

    fireEvent.click(within(confirm).getByRole("button", { name: "Keep current" }));
    expect(screen.queryByRole("group", { name: /Replace the/ })).toBeNull();
    expect(seats().map((p) => p.id)).toEqual(before);
    expect(screen.getByRole("button", { name: "Use a preset" })).toHaveFocus();
  });

  it("replaces the panel after confirming", () => {
    seed({ participants: 1 });
    render(<PanelEditor />);
    fireEvent.click(screen.getByRole("button", { name: "Use a preset" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Investor lens/ }));
    expect(screen.getByText(/Replace the 1 current seat with/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Replace seats" }));
    expect(seats().map((p) => p.persona.id)).toEqual([
      "vc-specialist",
      "pessimist",
      "optimistic-futurist",
    ]);
    expect(screen.queryByRole("button", { name: "Replace seats" })).toBeNull();
    expect(screen.getByRole("button", { name: "Use a preset" })).toHaveFocus();
  });
});

describe("PanelEditor — seats", () => {
  it("adds seats with a diverse default model and the next unused persona", () => {
    render(<PanelEditor />);
    const add = screen.getByRole("button", { name: "Add seat" });
    fireEvent.click(add);
    fireEvent.click(add);
    fireEvent.click(add);
    expect(seats().map((p) => p.persona.id)).toEqual(PERSONAS.slice(0, 3).map((p) => p.id));
    expect(seats().map((p) => p.modelInfo.id)).toEqual([
      "openai:gpt-4o",
      "anthropic:claude-sonnet-4",
      "groq:llama-3.3-70b",
    ]);
    const rows = within(seatList()).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Risk Analyst");
    expect(rows[0]).toHaveTextContent("OpenAI / gpt-4o");
  });

  it("adds a seat with the model and persona the user picked", () => {
    render(<PanelEditor />);
    // Model: cascaded provider → model.
    // Named by its visible label followed by the current value.
    const modelTrigger = screen.getByRole("button", { name: "Model OpenAI / gpt-4o" });
    fireEvent.click(modelTrigger);
    fireEvent.click(screen.getByRole("menuitem", { name: /OpenAI/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "gpt-4o-mini" }));
    expect(screen.getByRole("button", { name: "Model OpenAI / gpt-4o-mini" })).toBeInTheDocument();
    // Persona.
    fireEvent.click(screen.getByRole("button", { name: "Persona Risk Analyst" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Devil's Advocate/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add seat" }));
    expect(seats()).toHaveLength(1);
    expect(seats()[0].modelInfo.id).toBe("openai:gpt-4o-mini");
    expect(seats()[0].persona.id).toBe("devils-advocate");
    // The explicit model pick sticks for the next seat; persona moves on.
    expect(screen.getByRole("button", { name: "Model OpenAI / gpt-4o-mini" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Persona Risk Analyst" })).toBeInTheDocument();
  });

  it("removes a seat", () => {
    seed({ participants: 3 });
    const [first] = seats();
    render(<PanelEditor />);
    fireEvent.click(screen.getByRole("button", { name: `Remove seat 1 (${first.persona.name})` }));
    expect(seats()).toHaveLength(2);
    expect(seats().some((p) => p.id === first.id)).toBe(false);
    expect(within(seatList()).getAllByRole("listitem")).toHaveLength(2);
  });

  it("changes a seat's persona from its menu", () => {
    seed({ participants: 2 });
    render(<PanelEditor />);
    const trigger = screen.getByRole("button", {
      name: "Persona for seat 2 (First-Principles Engineer)",
    });
    fireEvent.click(trigger);
    expect(
      screen.getByRole("menuitemradio", { name: /First-Principles Engineer/ }),
    ).toHaveAttribute("aria-checked", "true");
    // Re-picking the current persona is a no-op.
    fireEvent.click(screen.getByRole("menuitemradio", { name: /First-Principles Engineer/ }));
    expect(seats()[1].persona.id).toBe("first-principles");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Scientific Skeptic/ }));
    expect(seats()[1].persona.id).toBe("scientific-skeptic");
    expect(within(seatList()).getAllByRole("listitem")[1]).toHaveTextContent("Scientific Skeptic");
  });

  it("changes a seat's model through the provider → model cascade", () => {
    seed({ participants: 1 });
    render(<PanelEditor />);
    const trigger = screen.getByRole("button", { name: "Model for seat 1 (Risk Analyst)" });
    expect(trigger).toHaveTextContent("Model");
    fireEvent.click(trigger);
    // Provider list: current provider is marked and focused.
    const openai = screen.getByRole("menuitem", { name: /OpenAI/ });
    expect(openai).toHaveFocus();
    fireEvent.click(screen.getByRole("menuitem", { name: /Anthropic/ })); // single model → selects
    expect(seats()[0].modelInfo.id).toBe("anthropic:claude-sonnet-4");
    expect(screen.queryByRole("menu")).toBeNull();

    // Re-selecting the same model does nothing.
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: /Anthropic/ }));
    expect(seats()[0].modelInfo.id).toBe("anthropic:claude-sonnet-4");
  });

  it("caps the panel at 8 seats and says why", () => {
    seed({ participants: 8 });
    render(<PanelEditor />);
    const add = screen.getByRole("button", { name: "Add seat" });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription(/at most 8 seats/);
    expect(screen.getByText("8 of 8 seats")).toBeInTheDocument();
    fireEvent.click(add);
    expect(seats()).toHaveLength(8);
  });

  it("locks every control while a run is in progress", () => {
    seed({ participants: 2 });
    useArenaStore.setState({ isRunning: true });
    render(<PanelEditor />);
    expect(screen.getByRole("button", { name: "Add seat" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Use a preset" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Remove seat 1/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Persona for seat 1/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Model for seat 1/ })).toBeDisabled();
  });
});

describe("PanelEditor — custom persona", () => {
  it("builds a custom persona and seats it with its spec", () => {
    render(<PanelEditor />);
    fireEvent.click(screen.getByRole("button", { name: "Persona Risk Analyst" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Build a custom persona/ }));
    const builder = screen.getByRole("region", { name: "Custom persona" });
    fireEvent.change(within(builder).getByRole("textbox", { name: "Name" }), {
      target: { value: "Ada" },
    });
    fireEvent.click(within(builder).getByRole("button", { name: "Use persona" }));
    expect(screen.queryByRole("region", { name: "Custom persona" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Persona Ada" }));
    expect(screen.getByRole("menuitemradio", { name: /Ada \(custom\)/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: /Edit custom persona/ })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.click(screen.getByRole("button", { name: "Add seat" }));
    const [seat] = seats();
    expect(seat.persona.id).toBe("custom");
    expect(seat.persona.name).toBe("Ada");
    expect(seat.customPersonaSpec?.name).toBe("Ada");
    const row = within(seatList()).getAllByRole("listitem")[0];
    expect(row).toHaveTextContent("Custom");

    // The seat's own persona menu shows the custom persona as current.
    fireEvent.click(screen.getByRole("button", { name: "Persona for seat 1 (Ada)" }));
    const current = screen.getByRole("menuitemradio", { name: /Ada \(custom\)/ });
    expect(current).toHaveAttribute("aria-checked", "true");
    fireEvent.click(current);
    expect(seats()[0].persona.id).toBe("custom");

    // After adding, the default goes back to a built-in persona, but the
    // custom one can be picked again.
    fireEvent.click(screen.getByRole("button", { name: "Persona Risk Analyst" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Ada \(custom\)/ }));
    expect(screen.getByRole("button", { name: "Persona Ada" })).toBeInTheDocument();
  });

  it("can close the builder without changing the pick", () => {
    render(<PanelEditor />);
    fireEvent.click(screen.getByRole("button", { name: "Persona Risk Analyst" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Build a custom persona/ }));
    fireEvent.click(screen.getByRole("button", { name: "Close persona builder" }));
    expect(screen.queryByRole("region", { name: "Custom persona" })).toBeNull();
    expect(screen.getByRole("button", { name: "Persona Risk Analyst" })).toBeInTheDocument();
  });
});

describe("suggestModel", () => {
  it("returns null without models and prefers the least-used provider", () => {
    expect(suggestModel([], [])).toBeNull();
    expect(suggestModel(MODELS, [])?.id).toBe("openai:gpt-4o");
    expect(suggestModel(MODELS, [{ modelInfo: MODELS[0] }])?.id).toBe("anthropic:claude-sonnet-4");
  });
});
