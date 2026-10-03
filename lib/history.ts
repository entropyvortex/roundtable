// ─────────────────────────────────────────────────────────────
// RoundTable — Local run history
// ─────────────────────────────────────────────────────────────
// Completed runs are kept in localStorage under `rt.history.v1` as a
// JSON array of `HistoryEntry` (newest first), at most 50. Every
// storage access is wrapped in try/catch: private windows, disabled
// storage and quota errors must never break the app.
//
// Every function takes an optional trailing `storage` argument (any
// `Storage`-like object) so tests can inject a fake. It defaults to
// `globalThis.localStorage` when present; with no storage at all the
// reads return empty results and the writes report failure.

import type { EngineType, SessionSnapshot } from "./types";

export const HISTORY_KEY = "rt.history.v1";
export const HISTORY_LIMIT = 50;
const TITLE_MAX = 80;
/** Largest millisecond timestamp `Date` can represent. */
const MAX_TIMESTAMP = 8.64e15;
const ENGINES: readonly EngineType[] = ["cvp", "blind-jury", "adversarial"];

/** Minimal subset of the Web Storage API that this module uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface HistoryEntry {
  id: string;
  /** Display title — the question's first line unless overridden. */
  title: string;
  note?: string;
  /** `Date.now()` when saved. */
  savedAt: number;
  engine: EngineType;
  /** Final consensus score (0–100) or null when the run had none. */
  score: number | null;
  /** Estimated total cost in USD (0 when unknown). */
  cost: number;
  snapshot: SessionSnapshot;
}

export interface SaveRunExtras {
  /** Re-using an existing id replaces that entry (and moves it to the top). */
  id?: string;
  title?: string;
  note?: string;
  savedAt?: number;
}

type Listener = () => void;
// Listeners are kept per storage object: a mutation notifies only the
// subscribers of the storage it was written to.
const listeners = new Map<StorageLike, Set<Listener>>();

/**
 * Subscribe to successful mutations of `storage` (default: localStorage)
 * made through this module in this tab. Returns an unsubscribe function.
 */
export function subscribeHistory(listener: Listener, storage?: StorageLike | null): () => void {
  const store = resolve(storage);
  if (!store) return () => {};
  let set = listeners.get(store);
  if (!set) {
    set = new Set();
    listeners.set(store, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(store);
  };
}

function notify(store: StorageLike): void {
  for (const l of [...(listeners.get(store) ?? [])]) {
    try {
      l();
    } catch {
      // A broken listener must not break persistence.
    }
  }
}

function defaultStorage(): StorageLike | null {
  try {
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    return ls ?? null;
  } catch {
    // Accessing localStorage can throw (e.g. blocked third-party storage).
    return null;
  }
}

function resolve(storage?: StorageLike | null): StorageLike | null {
  return storage === undefined ? defaultStorage() : storage;
}

const isEngine = (x: unknown): x is EngineType => ENGINES.includes(x as EngineType);

function engineOf(snapshot: SessionSnapshot): EngineType {
  if (isEngine(snapshot.engine)) return snapshot.engine;
  return isEngine(snapshot.options?.engine) ? snapshot.options.engine : "cvp";
}

/**
 * Turn one stored value into an entry. The id, the timestamp and the
 * snapshot's shape must be usable; the summary fields are repaired from
 * the snapshot so a hand-edited or older record still renders.
 */
function readEntry(x: unknown): HistoryEntry | null {
  if (!x || typeof x !== "object") return null;
  const e = x as Record<string, unknown>;
  const snapshot = e.snapshot as SessionSnapshot | undefined;
  if (typeof e.id !== "string" || e.id === "") return null;
  if (
    typeof e.savedAt !== "number" ||
    !Number.isFinite(e.savedAt) ||
    Math.abs(e.savedAt) > MAX_TIMESTAMP
  ) {
    return null;
  }
  if (!snapshot || typeof snapshot !== "object" || snapshot.v !== 1) return null;
  if (!Array.isArray(snapshot.rounds)) return null;
  const title = typeof e.title === "string" ? e.title.trim() : "";
  return {
    id: e.id,
    title: title || titleFromPrompt(snapshot.prompt ?? ""),
    ...(typeof e.note === "string" && e.note ? { note: e.note } : {}),
    savedAt: e.savedAt,
    engine: isEngine(e.engine) ? e.engine : engineOf(snapshot),
    score: typeof e.score === "number" && Number.isFinite(e.score) ? e.score : null,
    cost: typeof e.cost === "number" && Number.isFinite(e.cost) && e.cost > 0 ? e.cost : 0,
    snapshot,
  };
}

function readAll(storage: StorageLike | null): HistoryEntry[] {
  if (!storage) return [];
  let raw: string | null;
  try {
    raw = storage.getItem(HISTORY_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(readEntry)
      .filter((e): e is HistoryEntry => e !== null)
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: number };
  return (
    e.name === "QuotaExceededError" ||
    e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    e.code === 22 ||
    e.code === 1014
  );
}

type WriteResult = "ok" | "quota" | "failed";

function writeAll(storage: StorageLike, entries: HistoryEntry[]): WriteResult {
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(entries));
    return "ok";
  } catch (err) {
    return isQuotaError(err) ? "quota" : "failed";
  }
}

function makeId(savedAt: number): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const rand =
    typeof c?.randomUUID === "function"
      ? c.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `run-${savedAt.toString(36)}-${rand}`;
}

/** First non-empty line of the question, whitespace-collapsed, max 80 chars. */
export function titleFromPrompt(prompt: string): string {
  const line =
    prompt
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, " ").trim())
      .find((l) => l.length > 0) ?? "";
  if (!line) return "Untitled run";
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
}

/** All saved runs, newest first. Corrupt or unreadable storage yields `[]`. */
export function listRuns(storage?: StorageLike | null): HistoryEntry[] {
  return readAll(resolve(storage));
}

/** One saved run by id, or null. */
export function getRun(id: string, storage?: StorageLike | null): HistoryEntry | null {
  return readAll(resolve(storage)).find((e) => e.id === id) ?? null;
}

/**
 * Save a completed run at the top of the history, keeping at most 50
 * entries. When storage is full, the oldest runs are dropped one at a
 * time until the write fits. Returns the stored entry, or null when the
 * write failed (no storage, or not even the new run alone fits).
 */
export function saveRun(
  snapshot: SessionSnapshot,
  extras: SaveRunExtras = {},
  storage?: StorageLike | null,
): HistoryEntry | null {
  const store = resolve(storage);
  if (!store) return null;
  const savedAt = extras.savedAt ?? Date.now();
  const entry: HistoryEntry = {
    id: extras.id ?? makeId(savedAt),
    title: extras.title?.trim() || titleFromPrompt(snapshot.prompt ?? ""),
    ...(extras.note ? { note: extras.note } : {}),
    savedAt,
    engine: engineOf(snapshot),
    score: typeof snapshot.finalScore === "number" ? snapshot.finalScore : null,
    cost: snapshot.tokenTotal?.estimatedCostUSD ?? 0,
    snapshot,
  };
  const rest = readAll(store).filter((e) => e.id !== entry.id);
  let next = [entry, ...rest].slice(0, HISTORY_LIMIT);
  for (;;) {
    const result = writeAll(store, next);
    if (result === "ok") break;
    if (result === "failed" || next.length === 1) return null;
    next = next.slice(0, -1);
  }
  notify(store);
  return entry;
}

/** Delete one run. Returns true when something was removed and persisted. */
export function deleteRun(id: string, storage?: StorageLike | null): boolean {
  const store = resolve(storage);
  if (!store) return false;
  const all = readAll(store);
  const next = all.filter((e) => e.id !== id);
  if (next.length === all.length) return false;
  if (writeAll(store, next) !== "ok") return false;
  notify(store);
  return true;
}

/**
 * Set (or clear, with an empty string) the note on a saved run.
 * Returns the updated entry, or null when not found / not persisted.
 */
export function updateRunNote(
  id: string,
  note: string,
  storage?: StorageLike | null,
): HistoryEntry | null {
  const store = resolve(storage);
  if (!store) return null;
  const all = readAll(store);
  const idx = all.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  const trimmed = note.trim();
  const { note: _old, ...rest } = all[idx];
  const updated: HistoryEntry = trimmed ? { ...rest, note: trimmed } : rest;
  const next = all.slice();
  next[idx] = updated;
  if (writeAll(store, next) !== "ok") return null;
  notify(store);
  return updated;
}

/** Remove every saved run. Returns false when storage is unavailable or refused. */
export function clearHistory(storage?: StorageLike | null): boolean {
  const store = resolve(storage);
  if (!store) return false;
  try {
    store.removeItem(HISTORY_KEY);
  } catch {
    return false;
  }
  notify(store);
  return true;
}
