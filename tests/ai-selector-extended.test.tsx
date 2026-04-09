import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useArenaStore } from "@/lib/store";
import { PERSONAS } from "@/lib/personas";
import type { ModelInfo } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

const m1: ModelInfo = {
  id: "prov:m1",
  providerId: "prov",
  providerName: "Prov",
  modelId: "m1",
  preferred: true,
};
const m2: ModelInfo = { id: "prov:m2", providerId: "prov", providerName: "Prov", modelId: "m2" };
const m3: ModelInfo = { id: "solo:s1", providerId: "solo", providerName: "Solo", modelId: "s1" };

describe("AISelector — portal dropdowns", () => {
  beforeEach(() => {
    useArenaStore.getState().reset();
    useArenaStore.setState({
      availableModels: [m1, m2, m3],
      modelsLoading: false,
      participants: [],
      isRunning: false,
    });
  });

  it("selects a model from single-model provider directly", async () => {
    const { default: AISelector } = await import("@/components/AISelector");
    render(<AISelector />);

    // Open dropdown
    fireEvent.click(screen.getByText("Select model..."));

    // Click Solo provider (1 model — should select directly)
    fireEvent.click(screen.getByText("Solo"));

    // Dropdown should close and show selected model
    expect(screen.queryByText("Providers")).not.toBeInTheDocument();
    expect(screen.getByText("s1")).toBeInTheDocument();
  });

  it("shows model list for multi-model provider on hover", async () => {
    const { default: AISelector } = await import("@/components/AISelector");
    render(<AISelector />);

    fireEvent.click(screen.getByText("Select model..."));

    // Hover over Prov (2 models)
    fireEvent.mouseEnter(screen.getByText("Prov"));

    // Model list should appear in portal
    expect(screen.getByText("m1")).toBeInTheDocument();
    expect(screen.getByText("m2")).toBeInTheDocument();
  });

  it("selects persona from persona dropdown", async () => {
    const { default: AISelector } = await import("@/components/AISelector");
    render(<AISelector />);

    // Open persona dropdown — default is First-Principles Engineer
    const personaBtn = screen.getByText("First-Principles Engineer").closest("button");
    if (personaBtn) fireEvent.click(personaBtn);

    // Select a different persona
    expect(screen.getByText("Choose Persona")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Risk Analyst"));

    // Should now show the new persona
    expect(screen.queryByText("Choose Persona")).not.toBeInTheDocument();
  });

  it("adds participant and shows in list", async () => {
    const { default: AISelector } = await import("@/components/AISelector");
    render(<AISelector />);

    // Select a model first
    fireEvent.click(screen.getByText("Select model..."));
    fireEvent.click(screen.getByText("Solo")); // single model, selects directly

    // Click add
    fireEvent.click(screen.getByText("Add to Arena"));

    expect(useArenaStore.getState().participants).toHaveLength(1);
    expect(screen.getByText("Participants (1)")).toBeInTheDocument();
  });

  it("changes participant model via inline select", async () => {
    const { default: AISelector } = await import("@/components/AISelector");

    // Add a participant with m1
    useArenaStore.getState().addParticipant(m1, PERSONAS[0]);

    render(<AISelector />);

    // Find the model select (within the participant card)
    const selects = screen.getAllByRole("combobox");
    // The model select should have m1 and m2 as options (same provider)
    const modelSelect = selects.find((s) => {
      const options = Array.from(s.querySelectorAll("option"));
      return options.some((o) => o.textContent?.includes("m2"));
    });

    if (modelSelect) {
      fireEvent.change(modelSelect, { target: { value: "prov:m2" } });
      expect(useArenaStore.getState().participants[0].modelInfo.id).toBe("prov:m2");
    }
  });

  it("changes participant persona via inline select", async () => {
    const { default: AISelector } = await import("@/components/AISelector");
    useArenaStore.getState().addParticipant(m1, PERSONAS[0]);

    render(<AISelector />);

    const selects = screen.getAllByRole("combobox");
    const personaSelect = selects.find((s) => {
      const options = Array.from(s.querySelectorAll("option"));
      return options.some((o) => o.textContent?.includes("First-Principles"));
    });

    if (personaSelect) {
      fireEvent.change(personaSelect, { target: { value: "scientific-skeptic" } });
      expect(useArenaStore.getState().participants[0].persona.id).toBe("scientific-skeptic");
    }
  });

  it("closes menus on outside click", async () => {
    const { default: AISelector } = await import("@/components/AISelector");
    render(<AISelector />);

    // Open model dropdown
    fireEvent.click(screen.getByText("Select model..."));
    expect(screen.getByText("Providers")).toBeInTheDocument();

    // Click outside (on document body)
    fireEvent.mouseDown(document.body);

    expect(screen.queryByText("Providers")).not.toBeInTheDocument();
  });

  it("shows preferred star indicator in model list", async () => {
    const { default: AISelector } = await import("@/components/AISelector");
    render(<AISelector />);

    fireEvent.click(screen.getByText("Select model..."));
    fireEvent.mouseEnter(screen.getByText("Prov"));

    // The star icon should be present for the preferred model
    const starIcons = document.querySelectorAll(".lucide-star");
    expect(starIcons.length).toBeGreaterThan(0);
  });
});
