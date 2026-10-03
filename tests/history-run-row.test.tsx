import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import RunRow, { ParticipantDots } from "@/components/history/RunRow";
import { FIXTURE_PARTICIPANTS, FIXTURE_SNAPSHOT } from "./fixtures/snapshot";
import { entryOf as baseEntry } from "./helpers/history";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/session")>()),
  downloadBlob: vi.fn(),
}));

import { downloadBlob } from "@/lib/session";
import { toast } from "sonner";

const SAVED = new Date(2026, 8, 29, 12, 0, 0).getTime();
const TITLE = "Should an early-stage startup use microservices?";

const entryOf: typeof baseEntry = (snapshot, over = {}) =>
  baseEntry(snapshot, { title: TITLE, savedAt: SAVED, ...over });

function setup(props: Partial<Parameters<typeof RunRow>[0]> = {}) {
  const handlers = {
    onOpen: vi.fn(),
    onDelete: vi.fn(),
    onUpdateNote: vi.fn(),
    onToggleCompare: vi.fn(),
  };
  const entry = props.entry ?? entryOf(FIXTURE_SNAPSHOT);
  const utils = render(<RunRow entry={entry} now={SAVED + 5 * 60_000} {...handlers} {...props} />);
  return { ...utils, ...handlers, entry };
}

beforeEach(() => {
  vi.mocked(downloadBlob).mockClear();
  vi.mocked(toast.success).mockClear();
});

describe("RunRow", () => {
  it("shows title, engine, score label, cost, date and participants", () => {
    setup();
    const row = screen.getByRole("article", {
      name: "Should an early-stage startup use microservices?",
    });
    expect(within(row).getByText("Debate")).toBeInTheDocument();
    expect(within(row).getByText("80")).toBeInTheDocument();
    expect(within(row).getByText("Strong agreement")).toBeInTheDocument();
    expect(within(row).getByText("Estimated cost")).toHaveClass("sr-only");
    expect(within(row).getByText("$0.13")).toBeInTheDocument();
    const time = within(row).getByText("5 minutes ago");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("dateTime", new Date(SAVED).toISOString());
    expect(time.getAttribute("title")).toMatch(/2026/);
    expect(
      within(row).getByRole("img", {
        name: "3 participants: Risk Analyst, Optimistic Futurist, First-Principles Engineer",
      }),
    ).toBeInTheDocument();
  });

  it("shows participant names and models in a tooltip on focus", () => {
    setup();
    const dots = screen.getByRole("img", { name: /3 participants/ });
    const tip = screen.getByRole("tooltip", { hidden: true });
    expect(tip).not.toBeVisible();
    fireEvent.focus(dots);
    expect(tip).toBeVisible();
    expect(tip).toHaveTextContent("Risk Analyst · Grok / grok-4-fast-reasoning");
    expect(dots).toHaveAttribute("aria-describedby", tip.id);
  });

  it("caps the dots and shows the overflow count", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      ...FIXTURE_PARTICIPANTS[i % 3],
      id: `p-${i}`,
    }));
    render(<ParticipantDots participants={many} />);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("renders nothing for an empty panel, and handles no score / unknown cost", () => {
    const { container } = render(<ParticipantDots participants={[]} />);
    expect(container).toBeEmptyDOMElement();
    setup({
      entry: entryOf({ ...FIXTURE_SNAPSHOT, participants: [] }, { score: null, cost: 0 }),
    });
    expect(screen.getByText("No score")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("opens the run", () => {
    const { onOpen, entry } = setup();
    fireEvent.click(screen.getByRole("button", { name: /^Open/ }));
    expect(onOpen).toHaveBeenCalledWith(entry);
  });

  it("adds a note on Enter", () => {
    const { onUpdateNote } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Add a note/ }));
    const input = screen.getByRole("textbox", { name: /Note for/ });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "  Re-run with a judge  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onUpdateNote).toHaveBeenCalledWith("run-1", "Re-run with a judge");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: /Add a note/ })).toHaveFocus();
  });

  it("saves an edited note on blur, and skips unchanged notes", () => {
    const { onUpdateNote } = setup({ entry: entryOf(FIXTURE_SNAPSHOT, { note: "old" }) });
    const edit = screen.getByRole("button", { name: "Edit note: old" });
    expect(edit).toHaveTextContent("old");
    fireEvent.click(edit);
    let input = screen.getByRole("textbox");
    expect(input).toHaveValue("old");
    act(() => input.blur());
    expect(onUpdateNote).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Edit note: old" }));
    input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "" } });
    act(() => input.blur());
    expect(onUpdateNote).toHaveBeenCalledWith("run-1", "");
  });

  it("cancels note editing on Escape", () => {
    const { onUpdateNote } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Add a note/ }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "discard me" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onUpdateNote).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    // Unrelated keys do nothing.
    fireEvent.click(screen.getByRole("button", { name: /Add a note/ }));
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "a" });
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("asks for inline confirmation before deleting", () => {
    const { onDelete } = setup();
    const del = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(del);
    const group = screen.getByRole("group", { name: "Confirm delete" });
    expect(group).toHaveTextContent("Delete this run from history?");
    expect(within(group).getByRole("button", { name: "Cancel" })).toHaveFocus();
    fireEvent.click(within(group).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: "Confirm delete" })).toBeNull();
    expect(del).toHaveFocus();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(del);
    fireEvent.keyDown(screen.getByRole("group", { name: "Confirm delete" }), { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Confirm delete" })).toBeNull();
    fireEvent.click(del);
    fireEvent.click(screen.getByRole("button", { name: "Delete run" }));
    expect(onDelete).toHaveBeenCalledWith("run-1");
  });

  it("exports Markdown and JSON", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Markdown/ }));
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [mdName, md, mdType] = vi.mocked(downloadBlob).mock.calls[0];
    expect(mdName).toMatch(/^roundtable-should-an-early-stage-startup-.*\.md$/);
    expect(md).toContain("# RoundTable Session");
    expect(mdType).toBe("text/markdown");
    expect(toast.success).toHaveBeenCalledWith("Markdown downloaded");

    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /JSON/ }));
    const [jsonName, json, jsonType] = vi.mocked(downloadBlob).mock.calls[1];
    expect(jsonName).toMatch(/\.json$/);
    expect(JSON.parse(json).finalScore).toBe(80);
    expect(jsonType).toBe("application/json");
  });

  it("toggles comparison and respects the cap", () => {
    const { onToggleCompare, rerender, entry } = setup();
    const btn = screen.getByRole("button", { name: "Compare" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(btn);
    expect(onToggleCompare).toHaveBeenCalledWith("run-1");

    const common = {
      entry,
      onOpen: vi.fn(),
      onDelete: vi.fn(),
      onUpdateNote: vi.fn(),
      onToggleCompare,
    };
    rerender(<RunRow {...common} compareDisabled />);
    expect(screen.getByRole("button", { name: "Compare" })).toBeDisabled();
    rerender(<RunRow {...common} selected compareDisabled />);
    const on = screen.getByRole("button", { name: "Compare" });
    expect(on).toBeEnabled();
    expect(on).toHaveAttribute("aria-pressed", "true");
  });

  it("hides Compare when no toggle handler is given", () => {
    render(
      <RunRow
        entry={entryOf(FIXTURE_SNAPSHOT)}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onUpdateNote={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Compare" })).toBeNull();
    expect(screen.getByRole("article").querySelector("time")).not.toBeNull();
  });
});
