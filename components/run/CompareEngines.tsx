"use client";

// ─────────────────────────────────────────────────────────────
// CompareEngines — the sweep's engines side by side
// ─────────────────────────────────────────────────────────────
// Rows are engines (`sweepEngines`, each with its `sweepResults[i]`
// snapshot once done). "Open" hands the snapshot to the page, which
// loads it into the run view.

import { Loader2 } from "lucide-react";
import { useArenaStore } from "@/lib/store";
import type { EngineType, SessionSnapshot } from "@/lib/types";
import { engineLabel, scoreLabel } from "@/lib/score-label";
import { excerpt, formatCost, formatTokens } from "@/lib/format";
import { Badge, Button, cn } from "@/components/ui";
import { BriefSection } from "./BriefSection";

export interface CompareEnginesProps {
  /** Load one engine's snapshot into the run view. */
  onOpenSnapshot: (snapshot: SessionSnapshot) => void;
}

type RowStatus = "done" | "running" | "queued" | "stopped" | "not-run";

interface Row {
  key: string;
  engine: EngineType;
  snapshot?: SessionSnapshot;
  status: RowStatus;
}

const STATUS_TEXT: Record<Exclude<RowStatus, "done">, string> = {
  running: "Running…",
  queued: "Queued",
  stopped: "Stopped before finishing",
  "not-run": "Not run",
};

export default function CompareEngines({ onOpenSnapshot }: CompareEnginesProps) {
  const sweepActive = useArenaStore((s) => s.sweepActive);
  const sweepEngines = useArenaStore((s) => s.sweepEngines);
  const sweepCurrentIndex = useArenaStore((s) => s.sweepCurrentIndex);
  const sweepResults = useArenaStore((s) => s.sweepResults);
  const isRunning = useArenaStore((s) => s.isRunning);

  if (!sweepActive && sweepResults.length === 0) return null;

  const rows: Row[] = sweepEngines.map((engine, i) => {
    const snapshot = sweepResults[i];
    const status: RowStatus = snapshot
      ? "done"
      : sweepActive && isRunning && i === sweepCurrentIndex
        ? "running"
        : sweepActive && isRunning && i > sweepCurrentIndex
          ? "queued"
          : i === sweepCurrentIndex
            ? "stopped"
            : "not-run";
    return { key: `${engine}-${i}`, engine, snapshot, status };
  });

  const done = rows.filter((r) => r.status === "done").length;

  return (
    <BriefSection
      title="Compare engines"
      meta="Same question and panel, run through each engine."
      aside={
        <Badge tone={done === rows.length ? "success" : "neutral"}>
          {done} of {rows.length} done
        </Badge>
      }
    >
      <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <caption className="sr-only">Engine comparison</caption>
          <thead>
            <tr className="border-b border-border text-fg-muted">
              <th scope="col" className="py-2 pr-3 font-medium">
                Engine
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Final score
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Contradictions
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Spread flags
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Judge majority
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Cost
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Tokens
              </th>
              <th scope="col" className="py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <EngineRow key={row.key} row={row} onOpen={onOpenSnapshot} />
            ))}
          </tbody>
        </table>
      </div>
    </BriefSection>
  );
}

function EngineRow({ row, onOpen }: { row: Row; onOpen: (s: SessionSnapshot) => void }) {
  const name = engineLabel(row.engine);
  const s = row.snapshot;
  const cell = "py-2.5 pr-3 align-top";

  if (!s) {
    return (
      <tr className="border-b border-border last:border-0">
        <th scope="row" className={cn(cell, "font-medium text-fg")}>
          {name}
        </th>
        <td colSpan={7} className={cn(cell, "text-fg-muted")}>
          <span className="inline-flex items-center gap-1.5">
            {row.status === "running" && (
              <Loader2 aria-hidden className="h-4 w-4 animate-spin text-accent" />
            )}
            {STATUS_TEXT[row.status as Exclude<RowStatus, "done">]}
          </span>
        </td>
      </tr>
    );
  }

  const label = scoreLabel(s.finalScore);
  const contradictions = s.claims
    ? s.claims.error
      ? "Failed"
      : String(s.claims.contradictions.length)
    : "—";
  const majority = s.judge?.majorityPosition?.trim();

  return (
    <tr className="border-b border-border last:border-0">
      <th scope="row" className={cn(cell, "font-medium text-fg")}>
        {name}
      </th>
      <td className={cell}>
        {s.finalScore !== null ? (
          <div className="space-y-1">
            <span className="text-base font-semibold tabular-nums text-fg">{s.finalScore}</span>
            <div>
              <Badge tone={label.tone}>{label.label}</Badge>
            </div>
          </div>
        ) : (
          <span className="text-fg-muted">—</span>
        )}
      </td>
      <td className={cn(cell, "text-right tabular-nums text-fg")}>{contradictions}</td>
      <td className={cn(cell, "text-right tabular-nums text-fg")}>{s.disagreements.length}</td>
      <td className={cn(cell, "min-w-[240px] max-w-[360px] text-fg")}>
        {majority ? (
          excerpt(majority, 200)
        ) : (
          <span className="text-fg-muted">
            {s.options.judgeEnabled ? "No verdict" : "Judge off"}
          </span>
        )}
      </td>
      <td className={cn(cell, "text-right tabular-nums text-fg")}>
        {formatCost(s.tokenTotal?.estimatedCostUSD)}
      </td>
      <td className={cn(cell, "text-right tabular-nums text-fg-muted")}>
        {formatTokens(s.tokenTotal?.totalTokens)}
      </td>
      <td className="py-2.5 align-top">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onOpen(s)}
          aria-label={`Open ${name} run`}
        >
          Open
        </Button>
      </td>
    </tr>
  );
}
