"use client";

// ─────────────────────────────────────────────────────────────
// Disagreement Panel — confidence-spread flags, grouped by round
// ─────────────────────────────────────────────────────────────
// A flag means two participants' self-reported confidence differed by
// 20+ points in a round. Compact list; clicking opens that round.

import { useMemo } from "react";
import { useArenaStore } from "@/lib/store";
import type { Disagreement } from "@/lib/types";
import { Badge, PersonaDot } from "@/components/ui";
import { BriefSection } from "./run/BriefSection";

export interface DisagreementPanelProps {
  /** Open a round in the transcript. */
  onSelectRound: (round: number) => void;
}

export default function DisagreementPanel({ onSelectRound }: DisagreementPanelProps) {
  const disagreements = useArenaStore((s) => s.disagreements);
  const participants = useArenaStore((s) => s.participants);

  const grouped = useMemo(() => {
    const out = new Map<number, Disagreement[]>();
    for (const d of disagreements) {
      const list = out.get(d.round) ?? [];
      list.push(d);
      out.set(d.round, list);
    }
    return [...out.entries()].sort((a, b) => a[0] - b[0]);
  }, [disagreements]);

  if (disagreements.length === 0) return null;

  const lookup = (id: string) => participants.find((p) => p.id === id);

  return (
    <BriefSection
      title="Confidence-spread flags"
      meta="Pairs whose confidence differed by 20+ points in a round."
      aside={<Badge tone="warning">{disagreements.length}</Badge>}
    >
      <div className="space-y-3">
        {grouped.map(([round, items]) => (
          <div key={round} className="space-y-1">
            <h3 className="text-[13px] font-semibold text-fg-muted">Round {round}</h3>
            <ul className="space-y-1">
              {items.map((d) => {
                const a = lookup(d.participantAId);
                const b = lookup(d.participantBId);
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => onSelectRound(round)}
                      className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"
                    >
                      <span className="flex shrink-0 items-center gap-1">
                        {a && <PersonaDot color={a.persona.color} className="h-2 w-2" />}
                        {b && <PersonaDot color={b.persona.color} className="h-2 w-2" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-fg">{d.label}</span>
                      <span className="shrink-0 tabular-nums text-warning">{d.severity} pts</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </BriefSection>
  );
}
