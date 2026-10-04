"use client";

// ─────────────────────────────────────────────────────────────
// History — searchable, filterable list of saved runs
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { GitCompare, History as HistoryIcon, Search, Trash2 } from "lucide-react";
import type { HistoryEntry } from "@/lib/history";
import type { EngineType } from "@/lib/types";
import { engineLabel } from "@/lib/score-label";
import { Button, EmptyState, Input, Segmented, type SegmentedOption } from "@/components/ui";
import RunRow from "./RunRow";

export type EngineFilter = "all" | EngineType;

const ENGINE_FILTERS: SegmentedOption<EngineFilter>[] = [
  { value: "all", label: "All" },
  { value: "cvp", label: engineLabel("cvp", "short") },
  { value: "blind-jury", label: engineLabel("blind-jury", "short") },
  { value: "adversarial", label: engineLabel("adversarial", "short") },
];

/** At most this many runs can be picked for side-by-side comparison. */
const COMPARE_MAX = 2;

export interface RunListProps {
  runs: HistoryEntry[];
  onOpen: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onUpdateNote: (id: string, note: string) => void;
  /** Called after the user confirms "Clear history". */
  onClear: () => void;
  /** Called with the two picked runs. */
  onCompare: (pair: [HistoryEntry, HistoryEntry]) => void;
  /** Reference time for relative dates (tests); defaults to now. */
  now?: number;
  /** The run-count line, which the parent focuses after a delete. */
  countRef?: RefObject<HTMLParagraphElement | null>;
}

/** Lower-case and strip accents so "resume" finds "résumé". */
const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();

/** Folded text a run can be found by: title, question, note, persona names. */
function haystack(e: HistoryEntry): string {
  const personas = (e.snapshot.participants ?? []).map((p) => p.persona.name).join(" ");
  return fold([e.title, e.snapshot.prompt, e.note ?? "", personas].join(" "));
}

/** Newest first; every whitespace-separated query term must match. */
export function filterRuns(
  runs: HistoryEntry[],
  query: string,
  engine: EngineFilter,
): HistoryEntry[] {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  return runs
    .filter((e) => engine === "all" || e.engine === engine)
    .filter((e) => {
      if (terms.length === 0) return true;
      const text = haystack(e);
      return terms.every((t) => text.includes(t));
    })
    .sort((a, b) => b.savedAt - a.savedAt);
}

export default function RunList({
  runs,
  onOpen,
  onDelete,
  onUpdateNote,
  onClear,
  onCompare,
  now,
  countRef,
}: RunListProps) {
  const [query, setQuery] = useState("");
  const [engine, setEngine] = useState<EngineFilter>("all");
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const clearCancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmingClear) clearCancelRef.current?.focus();
  }, [confirmingClear]);

  const visible = useMemo(() => filterRuns(runs, query, engine), [runs, query, engine]);
  // Drop picks whose run was deleted.
  const picked = useMemo(
    () =>
      pickedIds.map((id) => runs.find((r) => r.id === id)).filter((r): r is HistoryEntry => !!r),
    [pickedIds, runs],
  );
  const full = picked.length >= COMPARE_MAX;

  const toggle = (id: string) => {
    setPickedIds((prev) => {
      const live = prev.filter((p) => runs.some((r) => r.id === p));
      if (live.includes(id)) return live.filter((p) => p !== id);
      if (live.length >= COMPARE_MAX) return live;
      return [...live, id];
    });
  };

  const compare = () => {
    if (picked.length >= COMPARE_MAX) onCompare([picked[0], picked[1]]);
  };

  if (runs.length === 0) {
    return (
      <EmptyState
        icon={<HistoryIcon />}
        title="No runs yet — completed runs are saved here automatically"
        description="Ask a question in Setup and run it. Each finished run — and each engine of a “Run all three engines” sweep — lands here so you can reopen, annotate and compare it."
      />
    );
  }

  const filtered = query.trim() !== "" || engine !== "all";

  return (
    <section aria-labelledby="rt-history-runs" className="flex flex-col gap-4">
      <h2 id="rt-history-runs" className="sr-only">
        Saved runs
      </h2>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search runs"
            placeholder="Search question, note or persona"
            className="pl-9"
          />
        </div>
        <Segmented
          options={ENGINE_FILTERS}
          value={engine}
          onChange={setEngine}
          label="Filter by engine"
          size="sm"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          ref={countRef}
          tabIndex={-1}
          aria-live="polite"
          className="text-[13px] text-fg-muted tabular-nums focus:outline-none"
        >
          {filtered
            ? `Showing ${visible.length} of ${runs.length} ${runs.length === 1 ? "run" : "runs"}`
            : `${runs.length} saved ${runs.length === 1 ? "run" : "runs"}`}
        </p>
        {!confirmingClear && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => setConfirmingClear(true)}
            className="text-fg-muted hover:text-danger"
          >
            Clear history
          </Button>
        )}
      </div>

      {confirmingClear && (
        <div
          role="group"
          aria-label="Confirm clear history"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setConfirmingClear(false);
            }
          }}
          className="flex flex-col gap-2 rounded-control border border-danger/40 bg-danger/5 p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-fg">
            Delete all {runs.length} saved {runs.length === 1 ? "run" : "runs"}? This can’t be
            undone.
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setConfirmingClear(false);
                setPickedIds([]);
                onClear();
              }}
            >
              Delete all
            </Button>
            <Button
              ref={clearCancelRef}
              size="sm"
              variant="ghost"
              onClick={() => setConfirmingClear(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-card border border-dashed border-border px-6 py-8 text-center">
          <p className="text-sm text-fg">No runs match your search.</p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => {
              setQuery("");
              setEngine("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((entry) => {
            const selected = picked.some((p) => p.id === entry.id);
            return (
              <li key={entry.id}>
                <RunRow
                  entry={entry}
                  onOpen={onOpen}
                  onDelete={onDelete}
                  onUpdateNote={onUpdateNote}
                  selected={selected}
                  onToggleCompare={toggle}
                  compareDisabled={full && !selected}
                  now={now}
                />
              </li>
            );
          })}
        </ul>
      )}

      {picked.length > 0 && (
        <div
          role="region"
          aria-label="Comparison selection"
          className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-card border border-border-strong bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-fg">
            {full
              ? `${picked.length} runs selected.`
              : "1 run selected — pick one more to compare."}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPickedIds([])}>
              Clear selection
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<GitCompare className="h-4 w-4" />}
              disabled={!full}
              onClick={compare}
            >
              Compare selected ({picked.length})
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
