import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import PersonaBuilder, { STORAGE_KEY } from "@/components/PersonaBuilder";
import { AXIS_META, DEFAULT_CUSTOM_SPEC, composeCustomPersona } from "@/lib/personas";
import type { CustomPersonaSpec } from "@/lib/types";

const nameBox = () => screen.getByRole("textbox", { name: "Name" });
const useBtn = () => screen.getByRole("button", { name: "Use persona" });

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PersonaBuilder", () => {
  it("starts from the default spec and is a labelled region", () => {
    render(<PersonaBuilder onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Custom persona" })).toBeInTheDocument();
    expect(nameBox()).toHaveValue(DEFAULT_CUSTOM_SPEC.name);
    // One radio group per axis, each on the middle level.
    for (const meta of Object.values(AXIS_META)) {
      const group = screen.getByRole("radiogroup", { name: meta.label });
      expect(within(group).getByRole("radio", { name: meta.levels.mid })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    }
  });

  it("uses the initial spec over the cached one", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_CUSTOM_SPEC, name: "Cached" }));
    render(
      <PersonaBuilder
        initial={{ ...DEFAULT_CUSTOM_SPEC, name: "Given" }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(nameBox()).toHaveValue("Given");
  });

  it("restores the last saved spec from localStorage", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_CUSTOM_SPEC, name: "Cached" }));
    render(<PersonaBuilder onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(nameBox()).toHaveValue("Cached");
  });

  it("ignores a cache entry that no longer passes validation", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: "custom" }));
    render(<PersonaBuilder onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(nameBox()).toHaveValue(DEFAULT_CUSTOM_SPEC.name);
  });

  it("ignores a corrupt or foreign cache entry", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    const { unmount } = render(<PersonaBuilder onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(nameBox()).toHaveValue(DEFAULT_CUSTOM_SPEC.name);
    unmount();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: "other", name: "Nope" }));
    render(<PersonaBuilder onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(nameBox()).toHaveValue(DEFAULT_CUSTOM_SPEC.name);
  });

  it("edits name, emoji, colour and axes, then saves a sanitised spec and caches it", () => {
    const onSave = vi.fn();
    render(<PersonaBuilder onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(nameBox(), { target: { value: "  Ada <b>" } });
    fireEvent.click(screen.getByRole("button", { name: "Pick emoji 🦉" }));
    fireEvent.click(screen.getByRole("button", { name: "Pick color #3b82f6" }));
    expect(screen.getByRole("button", { name: "Pick emoji 🦉" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Pick color #3b82f6" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const risk = screen.getByRole("radiogroup", { name: AXIS_META.riskTolerance.label });
    fireEvent.click(within(risk).getByRole("radio", { name: "Risk-averse" }));
    const evidence = screen.getByRole("radiogroup", { name: AXIS_META.evidenceBar.label });
    fireEvent.click(within(evidence).getByRole("radio", { name: "Rigorous" }));
    expect(screen.getByText(/Risk-averse · Neutral · Rigorous/)).toBeInTheDocument();

    fireEvent.click(useBtn());
    const saved = onSave.mock.calls[0][0] as CustomPersonaSpec;
    expect(saved.name).toBe("Ada b");
    expect(saved.emoji).toBe("🦉");
    expect(saved.color).toBe("#3b82f6");
    expect(saved.axes.riskTolerance).toBe("low");
    expect(saved.axes.evidenceBar).toBe("high");
    expect(() => composeCustomPersona(saved)).not.toThrow();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(saved);
  });

  it("caps the name at 32 characters", () => {
    render(<PersonaBuilder onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(nameBox(), { target: { value: "x".repeat(50) } });
    expect(nameBox()).toHaveValue("x".repeat(32));
    expect(screen.getByText("32 / 32")).toBeInTheDocument();
  });

  it("blocks names that sanitise to nothing, with a reason", () => {
    const onSave = vi.fn();
    render(<PersonaBuilder onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(nameBox(), { target: { value: "!!!" } });
    expect(useBtn()).toBeDisabled();
    expect(nameBox()).toHaveAttribute("aria-invalid", "true");
    expect(nameBox()).toHaveAccessibleDescription(/at least one letter or number/);
    fireEvent.change(nameBox(), { target: { value: "   " } });
    expect(screen.getByText("Enter a name.")).toBeInTheDocument();
    fireEvent.click(useBtn());
    expect(onSave).not.toHaveBeenCalled();
  });

  it("still saves when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const onSave = vi.fn();
    render(<PersonaBuilder onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.click(useBtn());
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("Cancel and the close button both call onCancel", () => {
    const onCancel = vi.fn();
    render(<PersonaBuilder onSave={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Close persona builder" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
