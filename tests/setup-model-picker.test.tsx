import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ModelPicker, { groupModelsByProvider } from "@/components/setup/ModelPicker";
import type { ModelInfo } from "@/lib/types";

const m = (providerId: string, modelId: string, preferred?: boolean): ModelInfo => ({
  id: `${providerId}:${modelId}`,
  providerId,
  providerName:
    providerId === "openai" ? "OpenAI" : providerId === "anthropic" ? "Anthropic" : "Groq",
  modelId,
  ...(preferred ? { preferred } : {}),
});

const MODELS = [
  m("openai", "gpt-4o-mini"),
  m("openai", "gpt-4o", true),
  m("anthropic", "claude-sonnet-4", true),
  m("anthropic", "claude-haiku"),
  m("groq", "llama-3.3-70b"),
];

function Harness({
  models = MODELS,
  initial = null,
  onChange = () => {},
}: {
  models?: ModelInfo[];
  initial?: ModelInfo | null;
  onChange?: (m: ModelInfo) => void;
}) {
  const [value, setValue] = useState<ModelInfo | null>(initial);
  return (
    <ModelPicker
      label="Judge model"
      models={models}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

const trigger = () => screen.getByRole("button", { name: "Judge model" });

describe("groupModelsByProvider", () => {
  it("groups in first-appearance order with preferred models first", () => {
    const groups = groupModelsByProvider(MODELS);
    expect(groups.map((g) => g.id)).toEqual(["openai", "anthropic", "groq"]);
    expect(groups[0].models.map((x) => x.modelId)).toEqual(["gpt-4o", "gpt-4o-mini"]);
    expect(groups[1].name).toBe("Anthropic");
  });
});

describe("ModelPicker", () => {
  it("shows a placeholder, then the chosen provider / model", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(trigger()).toHaveTextContent("Choose a model");
    fireEvent.click(trigger());
    const menu = screen.getByRole("menu", { name: "Judge model" });
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(trigger()).toHaveAttribute("aria-controls", menu.id);
    // Provider level: model counts, single-model providers show the model.
    expect(screen.getByRole("menuitem", { name: /OpenAI.*2 models/ })).toHaveFocus();
    expect(screen.getByRole("menuitem", { name: /Groq.*llama-3.3-70b/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /Anthropic/ }));
    // Model level: preferred first with a marker, then a separator.
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map((i) => i.textContent)).toEqual(["claude-sonnet-4Recommended", "claude-haiku"]);
    expect(screen.getByRole("separator")).toBeInTheDocument();
    expect(items[0]).toHaveFocus();
    fireEvent.click(items[1]);
    expect(onChange).toHaveBeenCalledWith(MODELS[3]);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveTextContent("Anthropic / claude-haiku");
  });

  it("selects a single-model provider in one click", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("menuitem", { name: /Groq/ }));
    expect(onChange).toHaveBeenCalledWith(MODELS[4]);
  });

  it("goes back to the provider list and closes on a second trigger click", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("menuitem", { name: /OpenAI/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "All providers" }));
    // Focus returns to the provider we came from.
    expect(screen.getByRole("menuitem", { name: /OpenAI/ })).toHaveFocus();
    fireEvent.click(trigger());
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("is fully keyboard operable", () => {
    const onChange = vi.fn();
    render(<Harness initial={MODELS[2]} onChange={onChange} />);
    trigger().focus();
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    const menu = screen.getByRole("menu");
    // Opens on the current provider.
    expect(screen.getByRole("menuitem", { name: /Anthropic/ })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: /Groq/ })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: /OpenAI/ })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(screen.getByRole("menuitem", { name: /Groq/ })).toHaveFocus();
    // → on a single-model provider does nothing.
    fireEvent.keyDown(menu, { key: "ArrowRight" });
    expect(screen.getByRole("menuitem", { name: /Groq/ })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Home" });
    expect(screen.getByRole("menuitem", { name: /OpenAI/ })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "End" });
    expect(screen.getByRole("menuitem", { name: /Groq/ })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Home" });
    // ← on the provider level does nothing; → drills in.
    fireEvent.keyDown(menu, { key: "ArrowLeft" });
    fireEvent.keyDown(menu, { key: "ArrowRight" });
    // Drilling in focuses the first model (preferred first), not "All providers".
    expect(screen.getByRole("menuitemradio", { name: /^gpt-4oRecommended/ })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(screen.getByRole("menuitem", { name: "All providers" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowLeft" });
    expect(screen.getByRole("menuitem", { name: /OpenAI/ })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowRight" });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitemradio", { name: "gpt-4o-mini" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "x" }); // ignored
    fireEvent.click(document.activeElement as HTMLElement); // Enter on a button = click
    expect(onChange).toHaveBeenCalledWith(MODELS[0]);
    expect(trigger()).toHaveFocus();
  });

  it("↑ on the trigger opens on the last item; Tab and Escape close", () => {
    render(<Harness />);
    fireEvent.keyDown(trigger(), { key: "ArrowUp" });
    expect(screen.getByRole("menuitem", { name: /Groq/ })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Tab" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger()).toHaveFocus();

    fireEvent.keyDown(trigger(), { key: "Enter" });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.keyDown(trigger(), { key: "a" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens straight on the models when there is a single provider", () => {
    render(<Harness models={[MODELS[0], MODELS[1]]} initial={MODELS[0]} />);
    fireEvent.click(trigger());
    expect(screen.queryByRole("menuitem", { name: "All providers" })).toBeNull();
    const current = screen.getByRole("menuitemradio", { name: "gpt-4o-mini" });
    expect(current).toHaveAttribute("aria-checked", "true");
    expect(current).toHaveFocus();
    // ← has nowhere to go.
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowLeft" });
    expect(current).toHaveFocus();
  });

  it("is disabled when there are no models", () => {
    render(<Harness models={[]} />);
    expect(trigger()).toBeDisabled();
  });

  it("can be named by a visible label and show a fixed trigger label", () => {
    render(
      <>
        <span id="lbl">Model</span>
        <ModelPicker
          label="unused"
          labelledBy="lbl"
          models={MODELS}
          value={MODELS[1]}
          onChange={() => {}}
        />
        <ModelPicker
          label="Model for seat 1"
          triggerLabel="Model"
          models={MODELS}
          value={MODELS[1]}
          onChange={() => {}}
        />
      </>,
    );
    expect(screen.getByRole("button", { name: "Model OpenAI / gpt-4o" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Model for seat 1" })).toHaveTextContent(/^Model$/);
  });
});
