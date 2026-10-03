// Shared fixtures for the history suites: an in-memory Storage and a
// HistoryEntry factory with the shape `lib/history.ts` writes.
import { titleFromPrompt, type HistoryEntry, type StorageLike } from "@/lib/history";
import type { SessionSnapshot } from "@/lib/types";

export class FakeStorage implements StorageLike {
  data = new Map<string, string>();
  /** When true, every write throws like a storage that refuses it. */
  failWrites = false;
  getItem(k: string) {
    return this.data.has(k) ? (this.data.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new Error("denied");
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

/** A history entry for `snapshot`; `over` sets the id, timestamp, title or anything else. */
export function entryOf(snapshot: SessionSnapshot, over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: "run-1",
    title: titleFromPrompt(snapshot.prompt ?? ""),
    savedAt: 0,
    engine: snapshot.engine,
    score: snapshot.finalScore,
    cost: snapshot.tokenTotal?.estimatedCostUSD ?? 0,
    snapshot,
    ...over,
  };
}
