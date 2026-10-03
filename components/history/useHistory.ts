// ─────────────────────────────────────────────────────────────
// History — React binding over lib/history.ts
// ─────────────────────────────────────────────────────────────
// `useHistory()` reads the saved runs through `useSyncExternalStore`:
// the server snapshot is always empty, the client reads storage after
// mount, and every mutation made through lib/history.ts (this tab) or
// a `storage` event (another tab) re-renders subscribers. The page
// calls `saveCompletedRun()` when a run finishes.

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  HISTORY_KEY,
  clearHistory,
  deleteRun,
  getRun,
  listRuns,
  saveRun,
  subscribeHistory,
  updateRunNote,
  type HistoryEntry,
  type SaveRunExtras,
  type StorageLike,
} from "@/lib/history";
import type { SessionSnapshot } from "@/lib/types";

export type { HistoryEntry, SaveRunExtras, StorageLike } from "@/lib/history";

/** 32-bit FNV-1a over a string, as unsigned base-36. */
function fnv1a(s: string, seed = 0x811c9dc5): string {
  let h = seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Stable id for a run, derived from its engine, question and the
 * timestamps of every response, so saving the same run twice replaces
 * the entry instead of duplicating it.
 */
export function runKey(snapshot: SessionSnapshot): string {
  const parts: string[] = [snapshot.engine ?? "", snapshot.prompt ?? ""];
  for (const round of snapshot.rounds ?? []) {
    for (const r of round.responses ?? []) parts.push(`${r.participantId}@${r.timestamp}`);
  }
  const s = parts.join("|");
  return `run-${fnv1a(s)}${fnv1a(s, 0x01000193)}`;
}

/**
 * Save a finished run to history. Returns the stored entry, or null when
 * there is nothing to save (no rounds) or storage is unavailable / full.
 * Never throws. Re-saving the same run keeps its note.
 */
export function saveCompletedRun(
  snapshot: SessionSnapshot,
  extras: SaveRunExtras = {},
  storage?: StorageLike | null,
): HistoryEntry | null {
  try {
    if (!snapshot || !Array.isArray(snapshot.rounds) || snapshot.rounds.length === 0) return null;
    const id = extras.id ?? runKey(snapshot);
    const note = extras.note ?? getRun(id, storage)?.note;
    return saveRun(snapshot, { ...extras, id, ...(note ? { note } : {}) }, storage);
  } catch {
    return null;
  }
}

// ── External store per storage instance ────────────────────

interface HistorySource {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => HistoryEntry[];
}

const EMPTY: HistoryEntry[] = [];
const getServerSnapshot = (): HistoryEntry[] => EMPTY;

const DEFAULT_STORAGE_KEY = {};
const NO_STORAGE_KEY = {};
const sources = new WeakMap<object, HistorySource>();

function createSource(storage: StorageLike | null | undefined): HistorySource {
  let cache: HistoryEntry[] | null = null;
  const listeners = new Set<() => void>();
  let detach: (() => void) | null = null;

  const invalidate = () => {
    cache = null;
    for (const l of [...listeners]) l();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === HISTORY_KEY) invalidate();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (!detach) {
        const unsubscribe = subscribeHistory(invalidate, storage);
        const win = typeof window !== "undefined" ? window : null;
        win?.addEventListener("storage", onStorage);
        detach = () => {
          unsubscribe();
          win?.removeEventListener("storage", onStorage);
        };
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && detach) {
          detach();
          detach = null;
          // Nobody is watching any more; re-read on the next mount.
          cache = null;
        }
      };
    },
    getSnapshot() {
      if (cache === null) {
        const list = listRuns(storage);
        // The shared empty array keeps the hydration snapshot identical.
        cache = list.length === 0 ? EMPTY : list;
      }
      return cache;
    },
  };
}

function sourceFor(storage: StorageLike | null | undefined): HistorySource {
  const key = storage === undefined ? DEFAULT_STORAGE_KEY : (storage ?? NO_STORAGE_KEY);
  let source = sources.get(key);
  if (!source) {
    source = createSource(storage);
    sources.set(key, source);
  }
  return source;
}

// ── Hook ───────────────────────────────────────────────────

export interface UseHistoryResult {
  /** Saved runs, newest first. Empty on the server and before hydration. */
  runs: HistoryEntry[];
  /** Delete one run; true when it was removed. */
  remove: (id: string) => boolean;
  /** Set or clear (empty string) a run's note; the updated entry or null. */
  updateNote: (id: string, note: string) => HistoryEntry | null;
  /** Delete every saved run; true when storage accepted it. */
  clear: () => boolean;
}

/**
 * Saved runs plus the mutations the History view needs. `storage`
 * defaults to `localStorage` (tests pass a fake).
 */
export function useHistory(storage?: StorageLike | null): UseHistoryResult {
  const source = useMemo(() => sourceFor(storage), [storage]);
  const runs = useSyncExternalStore(source.subscribe, source.getSnapshot, getServerSnapshot);

  const remove = useCallback((id: string) => deleteRun(id, storage), [storage]);
  const updateNote = useCallback(
    (id: string, note: string) => updateRunNote(id, note, storage),
    [storage],
  );
  const clear = useCallback(() => clearHistory(storage), [storage]);

  return useMemo(() => ({ runs, remove, updateNote, clear }), [runs, remove, updateNote, clear]);
}
