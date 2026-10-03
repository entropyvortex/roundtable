import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  HISTORY_KEY,
  HISTORY_LIMIT,
  clearHistory,
  deleteRun,
  getRun,
  listRuns,
  saveRun,
  subscribeHistory,
  titleFromPrompt,
  updateRunNote,
  type HistoryEntry,
  type StorageLike,
} from "@/lib/history";
import type { SessionSnapshot } from "@/lib/types";
import { DEFAULT_OPTIONS } from "@/lib/store";
import { FakeStorage } from "./helpers/history";

/** Throws a quota error whenever the serialised value is longer than `max`. */
class TinyStorage extends FakeStorage {
  constructor(private max: number) {
    super();
  }
  setItem(k: string, v: string) {
    if (v.length > this.max) {
      const err = new Error("full");
      err.name = "QuotaExceededError";
      throw err;
    }
    super.setItem(k, v);
  }
}

const snap = (over: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  v: 1,
  prompt: "Should we adopt a four-day work week?\nMore context here.",
  engine: "cvp",
  options: { ...DEFAULT_OPTIONS },
  participants: [],
  rounds: [],
  finalScore: 72,
  finalSummary: "done",
  judge: null,
  disagreements: [],
  claims: null,
  tokenTotal: { inputTokens: 10, outputTokens: 20, totalTokens: 30, estimatedCostUSD: 0.42 },
  createdAt: 1_700_000_000_000,
  ...over,
});

let store: FakeStorage;
beforeEach(() => {
  store = new FakeStorage();
});

describe("titleFromPrompt", () => {
  it("uses the first non-empty line, collapsing whitespace", () => {
    expect(titleFromPrompt("\n\n  Hello   world \nsecond")).toBe("Hello world");
  });
  it("truncates long titles with an ellipsis", () => {
    const t = titleFromPrompt("x".repeat(200));
    expect(t.length).toBe(80);
    expect(t.endsWith("…")).toBe(true);
  });
  it("falls back for empty prompts", () => {
    expect(titleFromPrompt("   \n  ")).toBe("Untitled run");
  });
});

describe("saveRun / listRuns / getRun", () => {
  it("saves a run with derived metadata", () => {
    const entry = saveRun(snap(), { savedAt: 1000 }, store)!;
    expect(entry).toMatchObject({
      title: "Should we adopt a four-day work week?",
      savedAt: 1000,
      engine: "cvp",
      score: 72,
      cost: 0.42,
    });
    expect(entry.id).toMatch(/^run-/);
    expect(entry.note).toBeUndefined();
    expect(listRuns(store)).toEqual([entry]);
    expect(getRun(entry.id, store)).toEqual(entry);
    expect(getRun("missing", store)).toBeNull();
    expect(JSON.parse(store.getItem(HISTORY_KEY)!)).toHaveLength(1);
  });

  it("honours extras and handles missing score / cost", () => {
    const entry = saveRun(
      snap({ finalScore: null, tokenTotal: null, engine: "blind-jury" }),
      { id: "fixed", title: "  Custom  ", note: "hello", savedAt: 5 },
      store,
    )!;
    expect(entry).toMatchObject({
      id: "fixed",
      title: "Custom",
      note: "hello",
      score: null,
      cost: 0,
      engine: "blind-jury",
    });
  });

  it("lists newest first and replaces an entry saved with the same id", () => {
    saveRun(snap(), { id: "a", savedAt: 1 }, store);
    saveRun(snap(), { id: "b", savedAt: 2 }, store);
    saveRun(snap({ finalScore: 10 }), { id: "a", savedAt: 3 }, store);
    const runs = listRuns(store);
    expect(runs.map((r) => r.id)).toEqual(["a", "b"]);
    expect(runs[0].score).toBe(10);
  });

  it("caps history at 50 entries, dropping the oldest", () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      saveRun(snap(), { id: `r${i}`, savedAt: i }, store);
    }
    const runs = listRuns(store);
    expect(runs).toHaveLength(HISTORY_LIMIT);
    expect(runs[0].id).toBe(`r${HISTORY_LIMIT + 4}`);
    expect(runs.some((r) => r.id === "r0")).toBe(false);
  });

  it("generates ids without crypto.randomUUID", () => {
    const original = globalThis.crypto;
    vi.stubGlobal("crypto", {});
    try {
      const e = saveRun(snap(), {}, store)!;
      expect(e.id).toMatch(/^run-[a-z0-9]+-[a-z0-9]+$/);
    } finally {
      vi.stubGlobal("crypto", original);
    }
  });
});

describe("quota handling", () => {
  it("drops the oldest entry when the new one does not fit", () => {
    // Measure what two real entries serialise to, then allow exactly that.
    const probe = new FakeStorage();
    saveRun(snap(), { id: "a", savedAt: 1 }, probe);
    saveRun(snap(), { id: "b", savedAt: 2 }, probe);
    const tiny = new TinyStorage(probe.getItem(HISTORY_KEY)!.length);
    saveRun(snap(), { id: "a", savedAt: 1 }, tiny);
    saveRun(snap(), { id: "b", savedAt: 2 }, tiny);
    expect(listRuns(tiny).map((r) => r.id)).toEqual(["b", "a"]);
    const c = saveRun(snap(), { id: "c", savedAt: 3 }, tiny);
    expect(c?.id).toBe("c");
    expect(listRuns(tiny).map((r) => r.id)).toEqual(["c", "b"]);
  });

  it("keeps dropping the oldest entries until the write fits", () => {
    const probe = new FakeStorage();
    saveRun(snap(), { id: "a", savedAt: 1 }, probe);
    saveRun(snap(), { id: "b", savedAt: 2 }, probe);
    // Room for two small entries; the big one needs most of it for itself.
    const tiny = new TinyStorage(probe.getItem(HISTORY_KEY)!.length);
    saveRun(snap(), { id: "a", savedAt: 1 }, tiny);
    saveRun(snap(), { id: "b", savedAt: 2 }, tiny);
    const big = snap({ prompt: "x".repeat(300) });
    expect(saveRun(big, { id: "c", savedAt: 3 }, tiny)?.id).toBe("c");
    expect(listRuns(tiny).map((r) => r.id)).toEqual(["c"]);
  });

  it("returns null when the entry alone does not fit", () => {
    const tiny = new TinyStorage(10);
    expect(saveRun(snap(), {}, tiny)).toBeNull();
    expect(listRuns(tiny)).toEqual([]);
  });

  it("returns null when the retry also fails", () => {
    const tiny = new TinyStorage(10);
    tiny.data.set(
      HISTORY_KEY,
      JSON.stringify([
        { id: "old1", savedAt: 1, snapshot: snap() },
        { id: "old2", savedAt: 2, snapshot: snap() },
      ]),
    );
    expect(saveRun(snap(), { id: "new" }, tiny)).toBeNull();
  });

  it("does not retry on non-quota errors", () => {
    const broken: StorageLike = {
      getItem: () => null,
      setItem: vi.fn(() => {
        throw new Error("nope");
      }),
      removeItem: () => {},
    };
    expect(saveRun(snap(), {}, broken)).toBeNull();
    expect(broken.setItem).toHaveBeenCalledTimes(1);
  });

  it("recognises legacy quota error codes", () => {
    let calls = 0;
    const legacy: StorageLike = {
      getItem: () =>
        JSON.stringify([
          { id: "old", savedAt: 1, snapshot: snap() },
          { id: "older", savedAt: 0, snapshot: snap() },
        ]),
      setItem: () => {
        calls++;
        if (calls === 1) throw Object.assign(new Error("q"), { code: 22 });
      },
      removeItem: () => {},
    };
    expect(saveRun(snap(), { id: "new", savedAt: 2 }, legacy)?.id).toBe("new");
    expect(calls).toBe(2);
  });
});

describe("robustness", () => {
  it("returns [] for corrupt or unexpected JSON", () => {
    store.setItem(HISTORY_KEY, "{not json");
    expect(listRuns(store)).toEqual([]);
    store.setItem(HISTORY_KEY, JSON.stringify({ not: "an array" }));
    expect(listRuns(store)).toEqual([]);
  });

  it("filters out malformed entries", () => {
    const good = { id: "ok", savedAt: 1, snapshot: snap() };
    store.setItem(
      HISTORY_KEY,
      JSON.stringify([
        good,
        null,
        "str",
        { id: 1, savedAt: 1, snapshot: snap() },
        { id: "no-snap", savedAt: 1 },
        { id: "bad-v", savedAt: 1, snapshot: { ...snap(), v: 2 } },
        { id: "no-rounds", savedAt: 1, snapshot: { ...snap(), rounds: null } },
      ]),
    );
    expect(listRuns(store).map((e) => e.id)).toEqual(["ok"]);
  });

  it("survives a storage that throws on every access", () => {
    const hostile: StorageLike = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(listRuns(hostile)).toEqual([]);
    expect(getRun("x", hostile)).toBeNull();
    expect(saveRun(snap(), {}, hostile)).toBeNull();
    expect(deleteRun("x", hostile)).toBe(false);
    expect(updateRunNote("x", "n", hostile)).toBeNull();
    expect(() => clearHistory(hostile)).not.toThrow();
  });

  it("no-ops without any storage", () => {
    expect(listRuns(null)).toEqual([]);
    expect(saveRun(snap(), {}, null)).toBeNull();
    expect(deleteRun("x", null)).toBe(false);
    expect(updateRunNote("x", "n", null)).toBeNull();
    expect(() => clearHistory(null)).not.toThrow();
  });
});

describe("default storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("uses globalThis.localStorage when no storage is passed", () => {
    const e = saveRun(snap(), { id: "ls" })!;
    expect(window.localStorage.getItem(HISTORY_KEY)).toContain('"ls"');
    expect(listRuns().map((r) => r.id)).toEqual([e.id]);
    clearHistory();
    expect(listRuns()).toEqual([]);
  });

  it("treats a throwing localStorage getter as no storage", () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });
    try {
      expect(listRuns()).toEqual([]);
      expect(saveRun(snap())).toBeNull();
    } finally {
      if (desc) Object.defineProperty(globalThis, "localStorage", desc);
    }
  });
});

describe("deleteRun / updateRunNote / clearHistory", () => {
  let a: HistoryEntry;
  beforeEach(() => {
    a = saveRun(snap(), { id: "a", savedAt: 1 }, store)!;
    saveRun(snap(), { id: "b", savedAt: 2 }, store);
  });

  it("deletes by id", () => {
    expect(deleteRun("a", store)).toBe(true);
    expect(listRuns(store).map((r) => r.id)).toEqual(["b"]);
    expect(deleteRun("a", store)).toBe(false);
  });

  it("sets, trims and clears notes", () => {
    expect(updateRunNote("a", "  worth a re-run  ", store)?.note).toBe("worth a re-run");
    expect(getRun("a", store)?.note).toBe("worth a re-run");
    const cleared = updateRunNote("a", "   ", store)!;
    expect("note" in cleared).toBe(false);
    expect(getRun("a", store)?.note).toBeUndefined();
    expect(updateRunNote("missing", "x", store)).toBeNull();
    expect(getRun("a", store)?.snapshot).toEqual(a.snapshot);
  });

  it("returns false / null when the write fails, without evicting anything", () => {
    const failing = new TinyStorage(1);
    failing.data.set(HISTORY_KEY, store.getItem(HISTORY_KEY)!);
    expect(deleteRun("a", failing)).toBe(false);
    expect(updateRunNote("a", "n", failing)).toBeNull();
    expect(listRuns(failing).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("clears everything", () => {
    expect(clearHistory(store)).toBe(true);
    expect(listRuns(store)).toEqual([]);
    expect(store.getItem(HISTORY_KEY)).toBeNull();
    expect(clearHistory(null)).toBe(false);
  });
});

describe("subscribeHistory", () => {
  it("notifies on successful mutations only, and unsubscribes", () => {
    const fn = vi.fn();
    const off = subscribeHistory(fn, store);
    saveRun(snap(), { id: "a" }, store);
    updateRunNote("a", "n", store);
    deleteRun("a", store);
    deleteRun("a", store); // nothing to delete → no notification
    clearHistory(store);
    expect(fn).toHaveBeenCalledTimes(4);
    off();
    saveRun(snap(), {}, store);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("only hears about the storage it subscribed to", () => {
    const fn = vi.fn();
    const off = subscribeHistory(fn, store);
    saveRun(snap(), {}, new FakeStorage());
    expect(fn).not.toHaveBeenCalled();
    expect(subscribeHistory(fn, null)).toBeTypeOf("function");
    off();
  });

  it("isolates listener errors", () => {
    const bad = subscribeHistory(() => {
      throw new Error("boom");
    }, store);
    const good = vi.fn();
    const off = subscribeHistory(good, store);
    expect(saveRun(snap(), {}, store)).not.toBeNull();
    expect(good).toHaveBeenCalledTimes(1);
    bad();
    off();
  });
});
