import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { getRun, listRuns, saveRun, type StorageLike } from "@/lib/history";
import HistoryView from "@/components/history/HistoryView";
import { saveCompletedRun } from "@/components/history/useHistory";
import { FIXTURE_SNAPSHOT, FIXTURE_SNAPSHOT_JURY } from "./fixtures/snapshot";
import { FakeStorage } from "./helpers/history";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import { toast } from "sonner";

const NOW = new Date(2026, 8, 29, 12, 0, 0).getTime();

function seed(storage: StorageLike) {
  saveRun(FIXTURE_SNAPSHOT, { id: "cvp", title: "Debate run", savedAt: NOW - 7_200_000 }, storage);
  saveRun(FIXTURE_SNAPSHOT_JURY, { id: "jury", title: "Jury run", savedAt: NOW - 60_000 }, storage);
}

const pick = (title: string) =>
  fireEvent.click(
    within(screen.getByRole("article", { name: title })).getByRole("button", {
      name: "Compare",
    }),
  );

beforeEach(() => {
  vi.mocked(toast.error).mockClear();
});

describe("HistoryView", () => {
  it("shows the empty state with no saved runs", () => {
    render(<HistoryView onOpen={vi.fn()} storage={new FakeStorage()} />);
    expect(screen.getByRole("heading", { level: 1, name: "History" })).toBeInTheDocument();
    expect(
      screen.getByText("No runs yet — completed runs are saved here automatically"),
    ).toBeInTheDocument();
  });

  it("lists saved runs and opens one", () => {
    const storage = new FakeStorage();
    seed(storage);
    const onOpen = vi.fn();
    render(<HistoryView onOpen={onOpen} storage={storage} now={NOW} />);
    expect(screen.getAllByRole("article").map((a) => a.querySelector("h3")!.textContent)).toEqual([
      "Jury run",
      "Debate run",
    ]);
    expect(screen.getByText("1 minute ago")).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("article", { name: "Debate run" })).getByRole("button", {
        name: /^Open/,
      }),
    );
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "cvp" }));
    expect(onOpen.mock.calls[0][0].snapshot.finalScore).toBe(80);
  });

  it("shows runs saved while it is mounted", () => {
    const storage = new FakeStorage();
    render(<HistoryView onOpen={vi.fn()} storage={storage} />);
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    act(() => {
      saveCompletedRun(FIXTURE_SNAPSHOT_JURY, {}, storage);
    });
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("compares two runs, closes, and closes automatically when one is deleted", () => {
    const storage = new FakeStorage();
    seed(storage);
    render(<HistoryView onOpen={vi.fn()} storage={storage} now={NOW} />);
    pick("Jury run");
    pick("Debate run");
    fireEvent.click(screen.getByRole("button", { name: "Compare selected (2)" }));

    const heading = screen.getByRole("heading", { name: "Compare runs" });
    expect(heading).toHaveFocus();
    const scoreRow = screen.getByRole("rowheader", { name: "Final score" }).closest("tr")!;
    expect(scoreRow).toHaveTextContent("80");
    expect(scoreRow).toHaveTextContent("74");

    fireEvent.click(screen.getByRole("button", { name: "Close comparison" }));
    expect(screen.queryByRole("heading", { name: "Compare runs" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "History" })).toHaveFocus();

    // Reopen, then delete one of the compared runs.
    fireEvent.click(screen.getByRole("button", { name: "Compare selected (2)" }));
    expect(screen.getByRole("heading", { name: "Compare runs" })).toBeInTheDocument();
    const jury = screen.getByRole("article", { name: "Jury run" });
    fireEvent.click(within(jury).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(jury).getByRole("button", { name: "Delete run" }));
    expect(listRuns(storage).map((r) => r.id)).toEqual(["cvp"]);
    expect(screen.queryByRole("heading", { name: "Compare runs" })).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    // Focus lands on the (announced) run count, not on <body>.
    expect(screen.getByText("1 saved run")).toHaveFocus();

    // Deleting the last run leaves the heading focused above the empty state.
    const debate = screen.getByRole("article", { name: "Debate run" });
    fireEvent.click(within(debate).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(debate).getByRole("button", { name: "Delete run" }));
    expect(screen.getByRole("heading", { level: 1, name: "History" })).toHaveFocus();
  });

  it("persists notes", () => {
    const storage = new FakeStorage();
    seed(storage);
    render(<HistoryView onOpen={vi.fn()} storage={storage} now={NOW} />);
    const row = screen.getByRole("article", { name: "Debate run" });
    fireEvent.click(within(row).getByRole("button", { name: /Add a note/ }));
    const input = within(row).getByRole("textbox");
    fireEvent.change(input, { target: { value: "Try with a judge next time" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(getRun("cvp", storage)?.note).toBe("Try with a judge next time");
    expect(
      within(row).getByRole("button", { name: "Edit note: Try with a judge next time" }),
    ).toBeInTheDocument();
  });

  it("clears history and any open comparison", () => {
    const storage = new FakeStorage();
    seed(storage);
    render(<HistoryView onOpen={vi.fn()} storage={storage} now={NOW} />);
    pick("Jury run");
    pick("Debate run");
    fireEvent.click(screen.getByRole("button", { name: "Compare selected (2)" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete all" }));
    expect(listRuns(storage)).toEqual([]);
    expect(screen.queryByRole("heading", { name: "Compare runs" })).toBeNull();
    expect(
      screen.getByText("No runs yet — completed runs are saved here automatically"),
    ).toBeInTheDocument();
  });

  it("reports storage failures instead of failing silently", () => {
    const storage = new FakeStorage();
    seed(storage);
    render(<HistoryView onOpen={vi.fn()} storage={storage} now={NOW} />);
    storage.failWrites = true;

    const row = screen.getByRole("article", { name: "Debate run" });
    fireEvent.click(within(row).getByRole("button", { name: /Add a note/ }));
    const input = within(row).getByRole("textbox");
    fireEvent.change(input, { target: { value: "won't stick" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Couldn’t save the note/));

    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(row).getByRole("button", { name: "Delete run" }));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Couldn’t delete/));
    expect(screen.getAllByRole("article")).toHaveLength(2);

    // A refused clear keeps the list and reports it.
    pick("Jury run");
    pick("Debate run");
    fireEvent.click(screen.getByRole("button", { name: "Compare selected (2)" }));
    storage.removeItem = () => {
      throw new Error("denied");
    };
    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete all" }));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Couldn’t clear history/));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Compare runs" })).toBeInTheDocument();
  });
});
