"use client";

// ─────────────────────────────────────────────────────────────
// RunHeader — question, engine, panel, status and run actions
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { Loader2, Plus, RotateCcw, Square } from "lucide-react";
import { useArenaStore } from "@/lib/store";
import type { EngineType, SessionSnapshot } from "@/lib/types";
import { effectiveRounds } from "@/lib/engine-rules";
import { engineLabel } from "@/lib/score-label";
import { formatCost, formatDuration } from "@/lib/format";
import { Badge, Button, PersonaDot, cn } from "@/components/ui";
import SessionMenu from "../SessionMenu";

export interface RunHeaderProps {
  /** Stop the running run (or sweep). */
  onCancel: () => void;
  /** Go back to Setup to start a new run. */
  onNewRun: () => void;
  /** Run the same question + panel again (hidden in shared view). */
  onRerun: () => void;
}

export interface RunStatusInput {
  isRunning: boolean;
  currentRound: number;
  /** The engine of the run shown (`runOptions.engine`, else `options.engine`). */
  engine: EngineType;
  /** The run's configured round count. */
  configuredRounds: number;
  judgeRunning: boolean;
  claimsRunning: boolean;
  sweepActive: boolean;
  sweepEngines: EngineType[];
  sweepCurrentIndex: number;
  sweepResults: SessionSnapshot[];
  finalScore: number | null;
  runError: string | null;
  /** Rounds present in the store. */
  roundCount: number;
  runStartedAt: number | null;
  runEndedAt: number | null;
  costUSD: number;
}

export type RunStatusKind = "idle" | "running" | "complete" | "stopped" | "failed";

export interface RunStatus {
  kind: RunStatusKind;
  /** Main line, e.g. "Running round 2 of 5" or "Complete · 1m 42s · $0.56". */
  text: string;
  /** Secondary detail, e.g. the phase inside a sweep engine or the failure reason. */
  detail?: string;
}

/** The cost, or nothing when no priced tokens were used. */
const cost = (usd: number) => (usd > 0 ? formatCost(usd) : null);

/** Pure status-line logic (exported for tests). */
export function describeRunStatus(s: RunStatusInput): RunStatus {
  const duration =
    s.runStartedAt !== null && s.runEndedAt !== null
      ? formatDuration(s.runEndedAt - s.runStartedAt)
      : null;

  if (s.isRunning) {
    const phase = s.judgeRunning
      ? "Writing judge synthesis"
      : s.claimsRunning
        ? "Extracting contradictions"
        : s.currentRound > 0
          ? `Running round ${s.currentRound} of ${effectiveRounds(s.engine, s.configuredRounds)}`
          : "Starting";
    if (s.sweepActive && s.sweepEngines.length > 0) {
      return {
        kind: "running",
        text: `Engine ${s.sweepCurrentIndex + 1} of ${s.sweepEngines.length} · ${engineLabel(s.engine, "short")}`,
        detail: phase,
      };
    }
    return { kind: "running", text: phase };
  }

  if (
    s.sweepActive &&
    s.sweepEngines.length > 0 &&
    s.sweepResults.length === s.sweepEngines.length
  ) {
    const cost = s.sweepResults.reduce((sum, r) => sum + (r.tokenTotal?.estimatedCostUSD ?? 0), 0);
    return {
      kind: "complete",
      text: `Sweep complete · ${s.sweepEngines.length} engines · ${formatCost(cost)}`,
    };
  }

  if (s.runError !== null) {
    return { kind: "failed", text: "Failed", detail: s.runError };
  }

  if (s.finalScore !== null) {
    return {
      kind: "complete",
      text: ["Complete", duration, cost(s.costUSD)].filter(Boolean).join(" · "),
    };
  }

  if (s.roundCount > 0 || s.runEndedAt !== null) {
    return {
      kind: "stopped",
      text: ["Stopped", duration, cost(s.costUSD)].filter(Boolean).join(" · "),
    };
  }

  return { kind: "idle", text: "Not started" };
}

const LONG_QUESTION = 160;

export default function RunHeader({ onCancel, onNewRun, onRerun }: RunHeaderProps) {
  const prompt = useArenaStore((s) => s.prompt);
  const participants = useArenaStore((s) => s.participants);
  // The shown run's options; Setup's only before anything has run.
  const options = useArenaStore((s) => s.runOptions ?? s.options);
  const sharedView = useArenaStore((s) => s.sharedView);
  const isRunning = useArenaStore((s) => s.isRunning);
  const currentRound = useArenaStore((s) => s.currentRound);
  const judgeRunning = useArenaStore((s) => s.judgeRunning);
  const claimsRunning = useArenaStore((s) => s.claimsRunning);
  const sweepActive = useArenaStore((s) => s.sweepActive);
  const sweepEngines = useArenaStore((s) => s.sweepEngines);
  const sweepCurrentIndex = useArenaStore((s) => s.sweepCurrentIndex);
  const sweepResults = useArenaStore((s) => s.sweepResults);
  const finalScore = useArenaStore((s) => s.finalScore);
  const runError = useArenaStore((s) => s.runError);
  const roundCount = useArenaStore((s) => s.rounds.length);
  const runStartedAt = useArenaStore((s) => s.runStartedAt);
  const runEndedAt = useArenaStore((s) => s.runEndedAt);
  const costUSD = useArenaStore((s) => s.tokenTotal.estimatedCostUSD);

  const [expanded, setExpanded] = useState(false);

  const engine = options.engine;
  const status = describeRunStatus({
    isRunning,
    currentRound,
    engine,
    configuredRounds: options.rounds,
    judgeRunning,
    claimsRunning,
    sweepActive,
    sweepEngines,
    sweepCurrentIndex,
    sweepResults,
    finalScore,
    runError,
    roundCount,
    runStartedAt,
    runEndedAt,
    costUSD,
  });

  const question = prompt.trim() || "Untitled run";
  const isLong = question.length > LONG_QUESTION;
  const canExport = !isRunning && roundCount > 0;
  const canRerun = prompt.trim().length > 0 && participants.length >= 2;

  return (
    <header className="space-y-3 rounded-card border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <h1
            id="run-question"
            className={cn(
              "break-words text-base font-semibold leading-snug text-fg",
              isLong && !expanded && "line-clamp-2",
            )}
          >
            {question}
          </h1>
          {isLong && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls="run-question"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-[13px] font-medium text-accent hover:underline"
            >
              {expanded ? "Show less" : "Show full question"}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isRunning && (
            <Button
              variant="danger"
              size="sm"
              icon={<Square className="h-3.5 w-3.5 fill-current" />}
              onClick={onCancel}
              title="Stop (Esc)"
            >
              Stop
            </Button>
          )}
          {canExport && <SessionMenu />}
          {!sharedView && !isRunning && (
            <Button
              size="sm"
              icon={<RotateCcw className="h-4 w-4" />}
              onClick={onRerun}
              disabled={!canRerun}
            >
              Re-run
            </Button>
          )}
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={onNewRun}>
            New run
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone="accent">{sweepActive ? "Engine sweep" : engineLabel(engine)}</Badge>
        {sharedView && <Badge tone="info">Shared run (read-only)</Badge>}
        {participants.length > 0 && (
          <ul aria-label="Panel" className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {participants.map((p) => (
              <li
                key={p.id}
                className="inline-flex items-center gap-1.5 text-[13px] text-fg"
                title={`${p.modelInfo.providerName} · ${p.modelInfo.modelId}`}
              >
                <PersonaDot color={p.persona.color} />
                {p.persona.name}
                <span className="sr-only">
                  {" "}
                  ({p.modelInfo.providerName} {p.modelInfo.modelId})
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p
        role="status"
        className={cn(
          "flex flex-wrap items-center gap-x-2 gap-y-1 text-sm",
          status.kind === "failed" ? "text-danger" : "text-fg",
        )}
      >
        {status.kind === "running" && (
          <Loader2 aria-hidden className="h-4 w-4 animate-spin text-accent" />
        )}
        <span className="font-medium tabular-nums">{status.text}</span>
        {status.detail && (
          <>
            {" "}
            <span className="min-w-0 break-words text-fg-muted">· {status.detail}</span>
          </>
        )}
      </p>
    </header>
  );
}
