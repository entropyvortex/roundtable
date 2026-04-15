"use client";

// ─────────────────────────────────────────────────────────────
// Disagreement Panel — Live disagreement ledger
// ─────────────────────────────────────────────────────────────
// Renders the list of disagreements detected during the run.
// Groups by round, links each row to the round heading, and
// shows severity as a small bar. Reads straight from the store.

import { useArenaStore } from "@/lib/store";
import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";

export default function DisagreementPanel() {
  const disagreements = useArenaStore((s) => s.disagreements);
  const participants = useArenaStore((s) => s.participants);

  const grouped = useMemo(() => {
    const out = new Map<number, typeof disagreements>();
    for (const d of disagreements) {
      const list = out.get(d.round) ?? [];
      list.push(d);
      out.set(d.round, list);
    }
    return [...out.entries()].sort((a, b) => a[0] - b[0]);
  }, [disagreements]);

  if (disagreements.length === 0) return null;

  const lookup = (id: string) => participants.find((p) => p.id === id);

  const scrollToRound = (round: number) => {
    const el = document.getElementById(`round-${round}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="rounded-xl border border-arena-warning/20 bg-arena-surface/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-arena-warning" />
        <h4 className="text-[10px] font-semibold text-arena-muted uppercase tracking-[0.15em]">
          Disagreement Ledger
        </h4>
        <span className="ml-auto text-[9px] font-mono text-arena-muted/70 tabular-nums">
          {disagreements.length}
        </span>
      </div>
      <div className="space-y-2">
        {grouped.map(([round, items]) => (
          <div key={round} className="space-y-1">
            <button
              onClick={() => scrollToRound(round)}
              className="text-[9px] font-semibold text-arena-muted uppercase tracking-wider hover:text-arena-accent transition-colors"
            >
              Round {round}
            </button>
            {items.map((d) => {
              const a = lookup(d.participantAId);
              const b = lookup(d.participantBId);
              return (
                <button
                  key={d.id}
                  onClick={() => scrollToRound(round)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md bg-arena-bg/50 hover:bg-arena-accent/5 transition-colors text-left"
                >
                  <div className="flex items-center gap-1 shrink-0">
                    {a && (
                      <div
                        className="w-1.5 h-3 rounded-sm"
                        style={{ backgroundColor: a.persona.color }}
                        title={a.persona.name}
                      />
                    )}
                    <span className="text-[9px] text-arena-muted">vs</span>
                    {b && (
                      <div
                        className="w-1.5 h-3 rounded-sm"
                        style={{ backgroundColor: b.persona.color }}
                        title={b.persona.name}
                      />
                    )}
                  </div>
                  <span className="text-[10px] text-arena-text flex-1 truncate">{d.label}</span>
                  <span className="text-[9px] font-mono tabular-nums text-arena-warning">
                    Δ{d.severity}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
