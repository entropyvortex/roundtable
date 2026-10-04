"use client";

// ─────────────────────────────────────────────────────────────
// Signals — confidence trajectory, spread flags and cost
// ─────────────────────────────────────────────────────────────
// Under the Brief on wide screens; its own tab on small ones.

import { useArenaStore } from "@/lib/store";
import ConfidenceTrajectory from "../ConfidenceTrajectory";
import DisagreementPanel from "../DisagreementPanel";
import CostMeter from "../CostMeter";
import { MutedNote } from "./BriefSection";

export interface SignalsProps {
  /** Open a round in the transcript (from a confidence-spread flag). */
  onSelectRound: (round: number) => void;
}

export default function Signals({ onSelectRound }: SignalsProps) {
  const hasAnswers = useArenaStore((s) => s.rounds.some((r) => r.responses.some((x) => !x.error)));
  const flagCount = useArenaStore((s) => s.disagreements.length);
  const isRunning = useArenaStore((s) => s.isRunning);
  const hasTokens = useArenaStore((s) => s.tokenTotal.totalTokens > 0);

  const nothingYet = !hasAnswers && flagCount === 0 && !hasTokens && !isRunning;

  return (
    <div className="space-y-4">
      {nothingYet && <MutedNote>Signals appear as rounds complete.</MutedNote>}
      <ConfidenceTrajectory />
      <DisagreementPanel onSelectRound={onSelectRound} />
      {flagCount === 0 && hasAnswers && !isRunning && (
        <p className="rounded-card border border-dashed border-border px-4 py-3 text-sm text-fg-muted">
          No confidence splits of 20+ points were flagged.
        </p>
      )}
      <CostMeter />
    </div>
  );
}
