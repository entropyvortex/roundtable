import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import QuestionEditor from "@/components/setup/QuestionEditor";
import { useArenaStore } from "@/lib/store";
import { PROMPT_LIBRARY } from "@/lib/prompt-library";

beforeEach(() => {
  useArenaStore.setState(useArenaStore.getInitialState(), true);
});

const textbox = () => screen.getByRole("textbox", { name: "Question" });

describe("QuestionEditor", () => {
  it("binds the textarea to the store prompt and counts characters", () => {
    render(<QuestionEditor />);
    expect(screen.getByRole("heading", { name: "Question" })).toBeInTheDocument();
    expect(screen.getByText(/^0 \/ 10,000/)).toBeInTheDocument();
    fireEvent.change(textbox(), { target: { value: "Should we ship?" } });
    expect(useArenaStore.getState().prompt).toBe("Should we ship?");
    expect(textbox()).toHaveValue("Should we ship?");
    expect(screen.getByText(/^15 \/ 10,000/)).toBeInTheDocument();
  });

  it("shows example chips grouped by category and fills the textarea on click", () => {
    render(<QuestionEditor />);
    const categories = [...new Set(PROMPT_LIBRARY.map((p) => p.category))];
    for (const c of categories) {
      expect(screen.getByRole("group", { name: `${c} examples` })).toBeInTheDocument();
    }
    const first = PROMPT_LIBRARY[0];
    const chip = screen.getByRole("button", { name: first.label });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(chip);
    expect(useArenaStore.getState().prompt).toBe(first.prompt);
    expect(textbox()).toHaveValue(first.prompt);
    expect(screen.getByRole("button", { name: first.label })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Still visible after picking one, so the user can switch examples.
    const second = PROMPT_LIBRARY[1];
    fireEvent.click(screen.getByRole("button", { name: second.label }));
    expect(useArenaStore.getState().prompt).toBe(second.prompt);
  });

  it("folds the examples away once the user writes their own question", () => {
    render(<QuestionEditor />);
    fireEvent.change(textbox(), { target: { value: "My own question" } });
    const toggle = screen.getByRole("button", { name: "Show examples" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: PROMPT_LIBRARY[0].label })).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide examples" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("Picking an example replaces your question.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: PROMPT_LIBRARY[0].label }));
    expect(useArenaStore.getState().prompt).toBe(PROMPT_LIBRARY[0].prompt);
  });

  it("flags a question over the 10,000 character limit", () => {
    useArenaStore.setState({ prompt: "x".repeat(10_005) });
    render(<QuestionEditor />);
    expect(screen.getByText(/^10,005 \/ 10,000/)).toHaveClass("text-danger");
    expect(textbox()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/Remove 5 to run/)).toBeInTheDocument();
  });

  it("accepts exactly 10,000 characters", () => {
    useArenaStore.setState({ prompt: "x".repeat(10_000) });
    render(<QuestionEditor />);
    expect(textbox()).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText(/to run\./)).toBeNull();
  });

  it("is disabled while a run is in progress", () => {
    useArenaStore.setState({ isRunning: true });
    render(<QuestionEditor />);
    expect(textbox()).toBeDisabled();
    expect(screen.getByRole("button", { name: PROMPT_LIBRARY[0].label })).toBeDisabled();
  });

  it("calls onSubmit on Ctrl/⌘ + Enter only", () => {
    const onSubmit = vi.fn();
    render(<QuestionEditor onSubmit={onSubmit} />);
    fireEvent.keyDown(textbox(), { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(textbox(), { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(textbox(), { key: "Enter", metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("ignores Ctrl + Enter without an onSubmit handler", () => {
    render(<QuestionEditor />);
    expect(() => fireEvent.keyDown(textbox(), { key: "Enter", ctrlKey: true })).not.toThrow();
  });
});
