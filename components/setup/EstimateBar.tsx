"use client";

// ─────────────────────────────────────────────────────────────
// EstimateBar — "≈ 12 calls · ~$0.40–0.90 · ~3 min" + Run
// ─────────────────────────────────────────────────────────────
// Pre-run estimate from lib/estimate.ts (assumptions in a tooltip),
// the Run / Run all three engines buttons with a visible reason
// when they are disabled, and Stop while a run is in flight.
// Sticky at the bottom of the viewport so Run stays in reach.

import { Info, Play, Square } from "lucide-react";
import { useId, useMemo } from "react";
import { effectiveRounds, optionsForEngine } from "@/lib/engine-rules";
import { ESTIMATE_ASSUMPTIONS, estimateRun, formatEstimate } from "@/lib/estimate";
import { getRunBlocker } from "@/lib/run-blocker";
import { engineLabel } from "@/lib/score-label";
import { useArenaStore } from "@/lib/store";
import { SWEEP_ENGINES, estimateSweep } from "@/lib/sweep";
import { Button, Tooltip, cn } from "@/components/ui";

export interface EstimateBarProps {
  /** Start a single run with the current settings. */
  onRun: () => void;
  /** Run the same question through all three engines, one after another. */
  onSweep: () => void;
  /** Stop the run (or sweep) in flight. */
  onCancel: () => void;
  className?: string;
}

const A = ESTIMATE_ASSUMPTIONS;
const fmt = (n: number) => n.toLocaleString("en-US");

export default function EstimateBar({ onRun, onSweep, onCancel, className }: EstimateBarProps) {
  const prompt = useArenaStore((s) => s.prompt);
  const participants = useArenaStore((s) => s.participants);
  const options = useArenaStore((s) => s.options);
  const availableModels = useArenaStore((s) => s.availableModels);
  const modelsLoading = useArenaStore((s) => s.modelsLoading);
  const isRunning = useArenaStore((s) => s.isRunning);
  const currentRound = useArenaStore((s) => s.currentRound);
  const runOptions = useArenaStore((s) => s.runOptions);
  const sweepActive = useArenaStore((s) => s.sweepActive);
  const sweepEngines = useArenaStore((s) => s.sweepEngines);
  const sweepCurrentIndex = useArenaStore((s) => s.sweepCurrentIndex);

  const uid = useId();
  const reasonId = `estimate-reason-${uid}`;

  // Estimate what the page will send: the rounds raised to the engine's minimum.
  const estimate = useMemo(
    () => estimateRun(participants, optionsForEngine(options, options.engine), prompt.length),
    [participants, options, prompt.length],
  );
  const sweepEstimate = useMemo(
    () => estimateSweep(participants, options, prompt.length),
    [participants, options, prompt.length],
  );

  const blocker = getRunBlocker({ prompt, participants, availableModels, modelsLoading, options });
  const hasSeats = participants.length > 0;
  const cap = options.costCapUSD ?? 0;

  const extras = [
    options.judgeEnabled && options.judgeModelId ? "the judge" : null,
    options.extractClaimsEnabled ? "claim extraction" : null,
  ].filter((x): x is string => x !== null);

  const assumptions = (
    <span className="flex flex-col gap-1">
      <span>
        Assumes ~{fmt(A.typicalOutputTokens)} output tokens per answer (at most{" "}
        {fmt(A.maxOutputTokens)}) and ~{A.secondsPerCall} s per call.
      </span>
      <span>Later rounds re-read earlier answers, so they cost more.</span>
      {estimate.minRounds !== estimate.maxRounds && (
        <span>
          Early stop may end the debate after round {estimate.minRounds}; the low figure assumes it
          does.
        </span>
      )}
      {extras.length > 0 && <span>Includes {extras.join(" and ")}.</span>}
      {estimate.unpricedModels.length > 0 && (
        <span>No price data for {estimate.unpricedModels.join(", ")}; counted as $0.</span>
      )}
      <span>Prices are list prices from a built-in table.</span>
      <span>Run all three engines: {formatEstimate(sweepEstimate)}.</span>
    </span>
  );

  const runningLabel = sweepActive
    ? `Engine ${sweepCurrentIndex + 1} of ${sweepEngines.length || SWEEP_ENGINES.length}` +
      (sweepEngines[sweepCurrentIndex]
        ? ` · ${engineLabel(sweepEngines[sweepCurrentIndex], "short")}`
        : "")
    : currentRound > 0 && runOptions
      ? `Running round ${currentRound} of ${effectiveRounds(runOptions.engine, runOptions.rounds)}`
      : "Starting…";

  return (
    <div className={cn("sticky bottom-0 z-20 bg-bg pb-3 pt-2", className)}>
      <div
        role="region"
        aria-label="Estimate and run"
        className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-fg tabular-nums">
              <span className="sr-only">Estimate: </span>
              {hasSeats ? formatEstimate(estimate) : "Add seats to see an estimate"}
            </p>
            {hasSeats && (
              <Tooltip content={assumptions}>
                <button
                  type="button"
                  aria-label="How the estimate is worked out"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-fg-muted hover:text-fg"
                >
                  <Info aria-hidden className="h-4 w-4" />
                </button>
              </Tooltip>
            )}
          </div>
          {isRunning ? (
            <p role="status" className="mt-0.5 text-[13px] text-fg-muted">
              {runningLabel}
            </p>
          ) : blocker ? (
            <p id={reasonId} className="mt-0.5 text-[13px] text-fg-muted">
              {blocker}
            </p>
          ) : (
            <p className="mt-0.5 text-[13px] text-fg-muted">
              {engineLabel(options.engine)} · {participants.length} seats
            </p>
          )}
          {!isRunning && estimate.exceedsCostCap && (
            <p className="mt-0.5 text-[13px] text-warning">
              The high estimate is above your ${cap.toFixed(2)} cost cap, so the run may stop early.
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          {isRunning ? (
            <Button
              variant="danger"
              onClick={onCancel}
              icon={<Square className="h-4 w-4 fill-current" />}
              className="flex-1 sm:flex-none"
            >
              {sweepActive ? "Stop sweep" : "Stop"}
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={onSweep}
                disabled={!!blocker}
                aria-describedby={blocker ? reasonId : undefined}
                title="Runs Debate, Blind jury and Red team one after another"
                className="flex-1 sm:flex-none"
              >
                Run all three engines
              </Button>
              <Button
                variant="primary"
                onClick={onRun}
                disabled={!!blocker}
                aria-describedby={blocker ? reasonId : undefined}
                icon={<Play className="h-4 w-4 fill-current" />}
                className="flex-1 sm:flex-none"
              >
                Run
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
