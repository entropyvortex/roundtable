import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { HistoryEntry } from "@/lib/history";
import type { SessionSnapshot } from "@/lib/types";
import RunList, { filterRuns, type RunListProps } from "@/components/history/RunList";
import { FIXTURE_SNAPSHOT, FIXTURE_SNAPSHOT_JURY } from "./fixtures/snapshot";
import { entryOf } from "./helpers/history";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const NOW = new Date(2026, 8, 29, 12, 0, 0).getTime();

const PRICING: SessionSnapshot = {
  ...FIXTURE_SNAPSHOT,
  engine: "adversarial",
  prompt: "How should we price the enterprise tier?",
  participants: [FIXTURE_SNAPSHOT.participants[0]],
};

// Deliberately not in date order.
const RUNS: HistoryEntry[] = [
  entryOf(FIXTURE_SNAPSHOT, { id: "cvp", savedAt: NOW - 3 * 3_600_000 }),
  entryOf(FIXTURE_SNAPSHOT_JURY, {
    id: "jury",
    savedAt: NOW - 60_000,
    title: "Jury take",
    note: "cheap rerun",
  }),
  entryOf(PRICING, { id: "red", savedAt: NOW - 86_400_000, title: "Pricing" }),
];

function setup(runs: HistoryEntry[] = RUNS, props: Partial<RunListProps> = {}) {
  const handlers = {
    onOpen: vi.fn(),
    onDelete: vi.fn(),
    onUpdateNote: vi.fn(),
    onClear: vi.fn(),
    onCompare: vi.fn(),
  };
  const utils = render(<RunList runs={runs} now={NOW} {...handlers} {...props} />);
  return { ...utils, ...handlers };
}

const rowTitles = () =>
  screen.queryAllByRole("article").map((a) => a.querySelector("h3")?.textContent);

describe("RunList", () => {
  it("shows the empty state when there are no runs", () => {
    setup([]);
    expect(
      screen.getByText("No runs yet — completed runs are saved here automatically"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear history" })).toBeNull();
  });

  it("lists runs newest first with a count", () => {
    setup();
    expect(rowTitles()).toEqual(["Jury take", RUNS[0].title, "Pricing"]);
    expect(screen.getByText("3 saved runs")).toBeInTheDocument();
  });

  it("uses the singular for one run", () => {
    setup([RUNS[0]]);
    expect(screen.getByText("1 saved run")).toBeInTheDocument();
  });

  it("searches title, question, note and persona names", () => {
    setup();
    const search = screen.getByRole("searchbox", { name: "Search runs" });
    fireEvent.change(search, { target: { value: "enterprise" } }); // question text only
    expect(rowTitles()).toEqual(["Pricing"]);
    expect(screen.getByText("Showing 1 of 3 runs")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "CHEAP" } }); // note, case-insensitive
    expect(rowTitles()).toEqual(["Jury take"]);

    fireEvent.change(search, { target: { value: "optimistic futurist" } }); // persona, two terms
    expect(rowTitles()).toEqual(["Jury take", RUNS[0].title]);

    fireEvent.change(search, { target: { value: "nothing-matches-this" } });
    expect(screen.getByText("No runs match your search.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(search).toHaveValue("");
    expect(rowTitles()).toHaveLength(3);
  });

  it("filters by engine", () => {
    setup();
    const group = screen.getByRole("radiogroup", { name: "Filter by engine" });
    expect(within(group).getByRole("radio", { name: "All" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(within(group).getByRole("radio", { name: "Blind jury" }));
    expect(rowTitles()).toEqual(["Jury take"]);
    fireEvent.click(within(group).getByRole("radio", { name: "Red team" }));
    expect(rowTitles()).toEqual(["Pricing"]);
    fireEvent.click(within(group).getByRole("radio", { name: "Debate" }));
    expect(rowTitles()).toEqual([RUNS[0].title]);
    // Combined with a search that excludes it.
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "jury" } });
    expect(screen.getByText("No runs match your search.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(within(group).getByRole("radio", { name: "All" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("passes row actions through", () => {
    const { onOpen, onDelete } = setup();
    const row = screen.getByRole("article", { name: "Pricing" });
    fireEvent.click(within(row).getByRole("button", { name: /^Open/ }));
    expect(onOpen).toHaveBeenCalledWith(RUNS[2]);
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(row).getByRole("button", { name: "Delete run" }));
    expect(onDelete).toHaveBeenCalledWith("red");
  });

  it("clears history only after confirmation", () => {
    const { onClear } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
    const group = screen.getByRole("group", { name: "Confirm clear history" });
    expect(group).toHaveTextContent("Delete all 3 saved runs?");
    expect(within(group).getByRole("button", { name: "Cancel" })).toHaveFocus();
    fireEvent.click(within(group).getByRole("button", { name: "Cancel" }));
    expect(onClear).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
    fireEvent.keyDown(screen.getByRole("group", { name: "Confirm clear history" }), {
      key: "Escape",
    });
    expect(screen.queryByRole("group", { name: "Confirm clear history" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete all" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("uses the singular in the clear confirmation for one run", () => {
    setup([RUNS[0]]);
    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
    expect(screen.getByRole("group")).toHaveTextContent("Delete all 1 saved run?");
  });

  it("selects at most two runs and hands them over in pick order", () => {
    const { onCompare } = setup();
    const compareIn = (title: string) =>
      within(screen.getByRole("article", { name: title })).getByRole("button", {
        name: "Compare",
      });

    expect(screen.queryByRole("region", { name: "Comparison selection" })).toBeNull();
    fireEvent.click(compareIn("Jury take"));
    const bar = screen.getByRole("region", { name: "Comparison selection" });
    expect(bar).toHaveTextContent("1 run selected — pick one more to compare.");
    expect(within(bar).getByRole("button", { name: "Compare selected (1)" })).toBeDisabled();

    fireEvent.click(compareIn(RUNS[0].title));
    expect(bar).toHaveTextContent("2 runs selected.");
    // Cap: the third run can't be added.
    expect(compareIn("Pricing")).toBeDisabled();
    expect(compareIn("Jury take")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(bar).getByRole("button", { name: "Compare selected (2)" }));
    expect(onCompare).toHaveBeenCalledWith([RUNS[1], RUNS[0]]);

    // Deselect one, pick another.
    fireEvent.click(compareIn("Jury take"));
    expect(compareIn("Pricing")).toBeEnabled();
    fireEvent.click(compareIn("Pricing"));
    fireEvent.click(screen.getByRole("button", { name: "Compare selected (2)" }));
    expect(onCompare).toHaveBeenLastCalledWith([RUNS[0], RUNS[2]]);

    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("region", { name: "Comparison selection" })).toBeNull();
  });

  it("drops a selected run that gets deleted", () => {
    const handlers = {
      onOpen: vi.fn(),
      onDelete: vi.fn(),
      onUpdateNote: vi.fn(),
      onClear: vi.fn(),
      onCompare: vi.fn(),
    };
    const { rerender } = render(<RunList runs={RUNS} now={NOW} {...handlers} />);
    const compareIn = (title: string) =>
      within(screen.getByRole("article", { name: title })).getByRole("button", {
        name: "Compare",
      });
    fireEvent.click(compareIn("Jury take"));
    fireEvent.click(compareIn("Pricing"));
    expect(compareIn(RUNS[0].title)).toBeDisabled();

    rerender(<RunList runs={[RUNS[0], RUNS[2]]} now={NOW} {...handlers} />);
    expect(screen.getByRole("region", { name: "Comparison selection" })).toHaveTextContent(
      "1 run selected",
    );
    expect(compareIn(RUNS[0].title)).toBeEnabled();
    // Toggling after a deletion prunes the stale id.
    fireEvent.click(compareIn(RUNS[0].title));
    expect(screen.getByRole("button", { name: "Compare selected (2)" })).toBeEnabled();
  });

  it("clears the selection when history is cleared", () => {
    setup();
    fireEvent.click(
      within(screen.getByRole("article", { name: "Pricing" })).getByRole("button", {
        name: "Compare",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete all" }));
    expect(screen.queryByRole("region", { name: "Comparison selection" })).toBeNull();
  });
});

describe("filterRuns", () => {
  it("filters and sorts without mutating the input", () => {
    const input = [...RUNS];
    expect(filterRuns(input, "", "all").map((r) => r.id)).toEqual(["jury", "cvp", "red"]);
    expect(filterRuns(input, "  ", "blind-jury").map((r) => r.id)).toEqual(["jury"]);
    expect(filterRuns(input, "microservices monolith", "all").map((r) => r.id)).toEqual([
      "jury",
      "cvp",
    ]);
    expect(input.map((r) => r.id)).toEqual(["cvp", "jury", "red"]);
  });

  it("ignores accents and case when searching", () => {
    const accented = entryOf(
      { ...FIXTURE_SNAPSHOT, prompt: "Devrions-nous relancer le résumé exécutif ?" },
      { id: "fr", savedAt: NOW },
    );
    expect(filterRuns([accented], "resume", "all")).toHaveLength(1);
    expect(filterRuns([accented], "RÉSUMÉ", "all")).toHaveLength(1);
    expect(filterRuns([accented], "resumed", "all")).toEqual([]);
  });

  it("tolerates snapshots without participants", () => {
    const bare = entryOf(
      { ...FIXTURE_SNAPSHOT, participants: undefined as never },
      { id: "bare", savedAt: NOW },
    );
    expect(filterRuns([bare], "futurist", "all")).toEqual([]);
    expect(filterRuns([bare], "startup", "all")).toHaveLength(1);
  });
});
