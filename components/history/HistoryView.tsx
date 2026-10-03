"use client";

// ─────────────────────────────────────────────────────────────
// History view — saved runs + two-run comparison
// ─────────────────────────────────────────────────────────────
// Mounted by the page when `view === "history"`. Opening a run is
// delegated to the page (`onOpen`), which loads the snapshot into the
// store and switches to the Run view.

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { HISTORY_LIMIT, type HistoryEntry, type StorageLike } from "@/lib/history";
import CompareRuns from "./CompareRuns";
import RunList from "./RunList";
import { useHistory } from "./useHistory";

export interface HistoryViewProps {
  /** Open a saved run in the Run view. */
  onOpen: (entry: HistoryEntry) => void;
  /** Storage override (tests); defaults to `localStorage`. */
  storage?: StorageLike | null;
  /** Reference time for relative dates (tests); defaults to now. */
  now?: number;
}

export default function HistoryView({ onOpen, storage, now }: HistoryViewProps) {
  const { runs, remove, updateNote, clear } = useHistory(storage);
  const [pairIds, setPairIds] = useState<[string, string] | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const countRef = useRef<HTMLParagraphElement>(null);

  // Derived from the live list so deleting a compared run closes the comparison.
  const pair = useMemo(() => {
    if (!pairIds) return null;
    const a = runs.find((r) => r.id === pairIds[0]);
    const b = runs.find((r) => r.id === pairIds[1]);
    return a && b ? ([a, b] as const) : null;
  }, [pairIds, runs]);

  const closeCompare = () => {
    setPairIds(null);
    headingRef.current?.focus();
  };

  // The row that had focus is gone after a delete; land on the run count
  // (which announces the new total), or on the heading once the list is empty.
  const handleDelete = (id: string) => {
    if (!remove(id)) {
      toast.error("Couldn’t delete that run — storage is unavailable.");
      return;
    }
    (runs.length > 1 ? countRef.current : headingRef.current)?.focus();
  };

  const handleNote = (id: string, note: string) => {
    if (!updateNote(id, note)) toast.error("Couldn’t save the note — storage is unavailable.");
  };

  const handleClear = () => {
    if (!clear()) {
      toast.error("Couldn’t clear history — storage is unavailable.");
      return;
    }
    setPairIds(null);
    headingRef.current?.focus();
  };

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
      <header>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-semibold tracking-tight text-fg focus:outline-none"
        >
          History
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          Completed runs are saved in this browser (up to {HISTORY_LIMIT}). Open one to read or
          re-run it, add a note, or pick two to compare.
        </p>
      </header>

      {pair && <CompareRuns a={pair[0]} b={pair[1]} onClose={closeCompare} />}

      <RunList
        runs={runs}
        onOpen={onOpen}
        onDelete={handleDelete}
        onUpdateNote={handleNote}
        onClear={handleClear}
        onCompare={([a, b]) => setPairIds([a.id, b.id])}
        now={now}
        countRef={countRef}
      />
    </div>
  );
}
