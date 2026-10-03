import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import {
  HISTORY_KEY,
  getRun,
  listRuns,
  saveRun,
  type HistoryEntry,
  type StorageLike,
} from "@/lib/history";
import type { SessionSnapshot } from "@/lib/types";
import { runKey, saveCompletedRun, useHistory } from "@/components/history/useHistory";
import {
  MINUS,
  excerpt,
  formatAbsoluteTime,
  formatCost,
  formatChange,
  formatRelativeTime,
  formatTokens,
} from "@/lib/format";
import { FIXTURE_SNAPSHOT, FIXTURE_SNAPSHOT_JURY } from "./fixtures/snapshot";
import { FakeStorage } from "./helpers/history";

const throwingSet: StorageLike = {
  getItem: () => null,
  setItem: () => {
    throw new Error("denied");
  },
  removeItem: () => {},
};

const throwingGet: StorageLike = {
  getItem: () => {
    throw new Error("denied");
  },
  setItem: () => {
    throw new Error("denied");
  },
  removeItem: () => {},
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveCompletedRun", () => {
  it("saves a completed run and returns the entry", () => {
    const storage = new FakeStorage();
    const entry = saveCompletedRun(FIXTURE_SNAPSHOT, { savedAt: 1000 }, storage);
    expect(entry).not.toBeNull();
    expect(entry).toMatchObject({
      engine: "cvp",
      score: 80,
      cost: 0.1327,
      savedAt: 1000,
      title: expect.stringMatching(/^Should an early-stage startup use a microservices/),
    });
    expect(entry!.id).toBe(runKey(FIXTURE_SNAPSHOT));
    expect(listRuns(storage).map((e) => e.id)).toEqual([entry!.id]);
  });

  it("defaults to localStorage", () => {
    const entry = saveCompletedRun(FIXTURE_SNAPSHOT_JURY);
    expect(entry?.engine).toBe("blind-jury");
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY)!)).toHaveLength(1);
  });

  it("re-saving the same run replaces it and keeps its note", () => {
    const storage = new FakeStorage();
    const first = saveCompletedRun(FIXTURE_SNAPSHOT, { note: "keep me" }, storage)!;
    // Same run, fresh snapshot object (as getSnapshot() would produce).
    const again = saveCompletedRun({ ...FIXTURE_SNAPSHOT, createdAt: 99 }, {}, storage)!;
    expect(again.id).toBe(first.id);
    expect(again.note).toBe("keep me");
    expect(listRuns(storage)).toHaveLength(1);
    // A different run is a different entry.
    saveCompletedRun(FIXTURE_SNAPSHOT_JURY, {}, storage);
    expect(listRuns(storage)).toHaveLength(2);
  });

  it("honours an explicit id and note", () => {
    const storage = new FakeStorage();
    const e = saveCompletedRun(FIXTURE_SNAPSHOT, { id: "mine", note: "n" }, storage)!;
    expect(e.id).toBe("mine");
    expect(getRun("mine", storage)?.note).toBe("n");
  });

  it("returns null when there is nothing to save", () => {
    const storage = new FakeStorage();
    expect(saveCompletedRun({ ...FIXTURE_SNAPSHOT, rounds: [] }, {}, storage)).toBeNull();
    expect(saveCompletedRun(null as unknown as SessionSnapshot, {}, storage)).toBeNull();
    expect(listRuns(storage)).toEqual([]);
  });

  it("returns null when storage is unavailable or throws", () => {
    expect(saveCompletedRun(FIXTURE_SNAPSHOT, {}, null)).toBeNull();
    expect(saveCompletedRun(FIXTURE_SNAPSHOT, {}, throwingSet)).toBeNull();
    expect(saveCompletedRun(FIXTURE_SNAPSHOT, {}, throwingGet)).toBeNull();
  });

  it("never throws, even if the snapshot is malformed", () => {
    const storage = new FakeStorage();
    const bad = { ...FIXTURE_SNAPSHOT } as SessionSnapshot;
    Object.defineProperty(bad, "prompt", {
      get() {
        throw new Error("boom");
      },
    });
    expect(saveCompletedRun(bad, {}, storage)).toBeNull();
  });
});

describe("runKey", () => {
  it("is stable for the same run and differs across runs", () => {
    expect(runKey(FIXTURE_SNAPSHOT)).toBe(runKey({ ...FIXTURE_SNAPSHOT, createdAt: 1 }));
    expect(runKey(FIXTURE_SNAPSHOT)).not.toBe(runKey(FIXTURE_SNAPSHOT_JURY));
    expect(runKey(FIXTURE_SNAPSHOT)).toMatch(/^run-[0-9a-z]+$/);
  });

  it("tolerates missing fields", () => {
    const odd = { v: 1, rounds: [{ responses: undefined }] } as unknown as SessionSnapshot;
    expect(runKey(odd)).toMatch(/^run-/);
    expect(runKey({ v: 1 } as unknown as SessionSnapshot)).toMatch(/^run-/);
  });
});

describe("useHistory", () => {
  it("hydrates from storage and updates on lib mutations", () => {
    const storage = new FakeStorage();
    saveRun(FIXTURE_SNAPSHOT, { id: "a", savedAt: 1 }, storage);
    const { result } = renderHook(() => useHistory(storage));
    expect(result.current.runs.map((r) => r.id)).toEqual(["a"]);

    act(() => {
      saveCompletedRun(FIXTURE_SNAPSHOT_JURY, { id: "b", savedAt: 2 }, storage);
    });
    expect(result.current.runs.map((r) => r.id)).toEqual(["b", "a"]);

    let updated: HistoryEntry | null = null;
    act(() => {
      updated = result.current.updateNote("a", "  second look  ");
    });
    expect(updated).toMatchObject({ id: "a", note: "second look" });
    expect(result.current.runs.find((r) => r.id === "a")?.note).toBe("second look");

    let removed = false;
    act(() => {
      removed = result.current.remove("b");
    });
    expect(removed).toBe(true);
    expect(result.current.runs.map((r) => r.id)).toEqual(["a"]);

    act(() => result.current.clear());
    expect(result.current.runs).toEqual([]);
  });

  it("returns a stable array between renders when nothing changed", () => {
    const storage = new FakeStorage();
    saveRun(FIXTURE_SNAPSHOT, { id: "a" }, storage);
    const { result, rerender } = renderHook(() => useHistory(storage));
    const first = result.current.runs;
    const api = result.current;
    rerender();
    expect(result.current.runs).toBe(first);
    expect(result.current).toBe(api);
  });

  it("re-reads on a storage event from another tab", () => {
    const { result } = renderHook(() => useHistory());
    const other = new FakeStorage();
    saveRun(FIXTURE_SNAPSHOT, { id: "tab2" }, other);
    localStorage.setItem(HISTORY_KEY, other.getItem(HISTORY_KEY)!);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "unrelated" }));
    });
    expect(result.current.runs).toEqual([]);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: HISTORY_KEY }));
    });
    expect(result.current.runs.map((r) => r.id)).toEqual(["tab2"]);
  });

  it("is empty with no storage at all", () => {
    const { result } = renderHook(() => useHistory(null));
    expect(result.current.runs).toEqual([]);
    expect(result.current.remove("nope")).toBe(false);
    expect(result.current.updateNote("nope", "x")).toBeNull();
    expect(() => result.current.clear()).not.toThrow();
  });

  it("unsubscribes on unmount and re-reads on the next mount", () => {
    const storage = new FakeStorage();
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const a = renderHook(() => useHistory(storage));
    const b = renderHook(() => useHistory(storage));
    // One shared subscription per storage, however many components use it.
    expect(add.mock.calls.filter(([t]) => t === "storage")).toHaveLength(1);
    a.unmount();
    expect(remove.mock.calls.filter(([t]) => t === "storage")).toHaveLength(0);
    b.unmount();
    expect(remove.mock.calls.filter(([t]) => t === "storage")).toHaveLength(1);

    // While unmounted, lib mutations are not observed…
    saveRun(FIXTURE_SNAPSHOT, { id: "later" }, storage);
    // …but the next mount reads fresh data.
    const c = renderHook(() => useHistory(storage));
    expect(c.result.current.runs.map((r) => r.id)).toEqual(["later"]);
    c.unmount();
  });

  it("renders empty on the server, then hydrates on the client", () => {
    saveRun(FIXTURE_SNAPSHOT, { id: "ssr" });
    function Count() {
      const { runs } = useHistory();
      return <p>{`${runs.length} runs`}</p>;
    }
    expect(renderToString(<Count />)).toContain("0 runs");
    render(<Count />);
    expect(screen.getByText("1 runs")).toBeInTheDocument();
  });
});

describe("format helpers", () => {
  const NOW = new Date(2026, 8, 29, 12, 0, 0).getTime();

  it("formats relative times", () => {
    expect(formatRelativeTime(NOW - 10_000, NOW)).toBe("just now");
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe("5 minutes ago");
    expect(formatRelativeTime(NOW - 3 * 3_600_000, NOW)).toBe("3 hours ago");
    expect(formatRelativeTime(NOW - 24 * 3_600_000, NOW)).toBe("yesterday");
    expect(formatRelativeTime(NOW - 4 * 86_400_000, NOW)).toBe("4 days ago");
    expect(formatRelativeTime(new Date(2026, 8, 1).getTime(), NOW)).toBe("Sep 1");
    expect(formatRelativeTime(new Date(2025, 0, 5).getTime(), NOW)).toBe("Jan 5, 2025");
    expect(typeof formatRelativeTime(Date.now())).toBe("string");
  });

  it("formats absolute times, costs, tokens, deltas and excerpts", () => {
    expect(formatAbsoluteTime(NOW)).toMatch(/Sep 29, 2026/);
    expect(formatCost(0)).toBe("—");
    expect(formatCost(null)).toBe("—");
    expect(formatCost(0.0042)).toBe("$0.0042");
    expect(formatCost(0.1327)).toBe("$0.13");
    expect(formatTokens(42_700)).toBe("42,700");
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(null)).toBe("—");
    expect(formatChange(80, 74)).toBe(`${MINUS}6`);
    expect(formatChange(74, 80)).toBe("+6");
    expect(formatChange(5, 5)).toBe("±0");
    expect(formatChange(null, 5)).toBe("—");
    expect(formatChange(0.1327, 0.0311, formatCost)).toBe(`${MINUS}$0.10`);
    expect(excerpt("short  text", 50)).toBe("short text");
    expect(excerpt("alpha beta gamma delta", 12)).toBe("alpha beta…");
    expect(excerpt("abcdefghijklmnop", 8)).toBe("abcdefg…");
  });
});
