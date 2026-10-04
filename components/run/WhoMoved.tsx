"use client";

// ─────────────────────────────────────────────────────────────
// WhoMoved — first → last confidence per participant, biggest
// shift first
// ─────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { useArenaStore } from "@/lib/store";
import type { ConsensusRound, Participant } from "@/lib/types";
import { formatDelta } from "@/lib/format";
import { PersonaDot } from "@/components/ui";
import { BriefSection, MutedNote } from "./BriefSection";

export interface Move {
  participant: Participant;
  /** Confidence in the first / last non-errored answer (null if none). */
  first: number | null;
  last: number | null;
  firstRound: number | null;
  lastRound: number | null;
  /** `last - first`; null with fewer than two answers. */
  delta: number | null;
}

/**
 * Per-participant first→last confidence from `rounds[*].responses`
 * (errored answers excluded), sorted by |delta| descending. Ties and
 * participants without a delta keep panel order.
 */
export function computeMoves(participants: Participant[], rounds: ConsensusRound[]): Move[] {
  const moves = participants.map((participant): Move => {
    const answers = rounds.flatMap((r) => {
      const res = r.responses.find((x) => x.participantId === participant.id && !x.error);
      return res ? [{ round: r.number, confidence: res.confidence }] : [];
    });
    const first = answers[0];
    const last = answers[answers.length - 1];
    return {
      participant,
      first: first?.confidence ?? null,
      last: last?.confidence ?? null,
      firstRound: first?.round ?? null,
      lastRound: last?.round ?? null,
      delta: answers.length >= 2 ? last.confidence - first.confidence : null,
    };
  });
  const rank = (m: Move) => (m.delta === null ? (m.first === null ? -2 : -1) : Math.abs(m.delta));
  // Array.prototype.sort is stable, so ties keep panel order.
  return moves.sort((a, b) => rank(b) - rank(a));
}

export default function WhoMoved() {
  const rounds = useArenaStore((s) => s.rounds);
  const participants = useArenaStore((s) => s.participants);
  const moves = useMemo(() => computeMoves(participants, rounds), [participants, rounds]);
  const answered = moves.filter((m) => m.first !== null);

  return (
    <BriefSection
      title="Who moved"
      meta="Confidence in each participant's first vs latest answer, biggest shift first."
    >
      {answered.length === 0 ? (
        <MutedNote>Appears once participants have answered.</MutedNote>
      ) : (
        <ul className="divide-y divide-border">
          {answered.map((m) => (
            <li key={m.participant.id} className="flex items-center gap-3 py-2 text-sm">
              <PersonaDot color={m.participant.persona.color} />
              <span className="min-w-0 flex-1 truncate text-fg">{m.participant.persona.name}</span>
              {m.delta === null ? (
                <span className="tabular-nums text-fg-muted">
                  {m.first} <span className="text-[13px]">(one answer)</span>
                </span>
              ) : (
                <>
                  <span className="tabular-nums text-fg-muted">
                    {m.first} → {m.last}
                  </span>
                  <span className="inline-flex w-16 items-center justify-end gap-1 font-semibold tabular-nums text-fg">
                    <DeltaIcon delta={m.delta} />
                    {formatDelta(m.delta)}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </BriefSection>
  );
}

function DeltaIcon({ delta }: { delta: number }) {
  const cls = "h-4 w-4 text-fg-muted";
  if (delta > 0) return <ArrowUpRight aria-hidden className={cls} />;
  if (delta < 0) return <ArrowDownRight aria-hidden className={cls} />;
  return <ArrowRight aria-hidden className={cls} />;
}
