"use client";

// ─────────────────────────────────────────────────────────────
// RoundNav — segmented round picker with each round's score
// ─────────────────────────────────────────────────────────────

import type { ConsensusRound } from "@/lib/types";
import { roundTypeLabel } from "@/lib/score-label";
import { Segmented, type SegmentedOption } from "@/components/ui";

export interface RoundNavProps {
  rounds: ConsensusRound[];
  /** Round number currently shown. */
  value: number | null;
  onChange: (round: number) => void;
  /** Round numbers whose score has landed. */
  completed: ReadonlySet<number>;
  /** Round currently streaming, if any. */
  liveRound?: number | null;
  className?: string;
}

/** "R1 Initial · 80" — a radiogroup; arrows move between rounds. */
export default function RoundNav({
  rounds,
  value,
  onChange,
  completed,
  liveRound = null,
  className,
}: RoundNavProps) {
  const options: SegmentedOption[] = rounds.map((r) => ({
    value: String(r.number),
    label: `R${r.number} ${roundTypeLabel(r.type)}`,
    description:
      r.number === liveRound && !completed.has(r.number)
        ? "live"
        : completed.has(r.number)
          ? String(r.consensusScore)
          : "—",
  }));

  return (
    <Segmented
      label="Rounds"
      options={options}
      value={value === null ? "" : String(value)}
      onChange={(v) => onChange(Number(v))}
      size="sm"
      className={className}
    />
  );
}
