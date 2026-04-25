"use client";

// ─────────────────────────────────────────────────────────────
// Disagreement Panel — Live disagreement ledger
// ─────────────────────────────────────────────────────────────

import { useArenaStore } from "@/lib/store";
import { useMemo } from "react";
import { DisagreementArt } from "./HeroArt";
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
    <div className="glass overflow-hidden">
      <DisagreementArt className="h-[100px]" />
      <div className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-arena-warning drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
          <p className="section-label">Disagreement Ledger</p>
          <span className="ml-auto text-[10px] font-mono text-arena-warning/90 tabular-nums px-2 py-0.5 rounded-md bg-arena-warning/12 border border-arena-warning/25">
            {disagreements.length}
          </span>
        </div>
        <div className="space-y-3">
          {grouped.map(([round, items]) => (
            <div key={round} className="space-y-1.5">
              <button
                onClick={() => scrollToRound(round)}
                className="text-[9.5px] font-semibold text-arena-muted uppercase tracking-[0.18em] hover:text-arena-glow transition-colors"
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
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-black/30 hover:bg-arena-accent/8 border border-white/[0.05] hover:border-arena-accent/30 transition-colors text-left"
                  >
                    <div className="flex items-center gap-1 shrink-0">
                      {a && (
                        <div
                          className="w-1.5 h-3.5 rounded-sm"
                          style={{
                            backgroundColor: a.persona.color,
                            boxShadow: `0 0 6px ${a.persona.color}90`,
                          }}
                          title={a.persona.name}
                        />
                      )}
                      <span className="text-[9px] text-arena-muted">vs</span>
                      {b && (
                        <div
                          className="w-1.5 h-3.5 rounded-sm"
                          style={{
                            backgroundColor: b.persona.color,
                            boxShadow: `0 0 6px ${b.persona.color}90`,
                          }}
                          title={b.persona.name}
                        />
                      )}
                    </div>
                    <span className="text-[10.5px] text-arena-text/85 flex-1 truncate">{d.label}</span>
                    <span className="text-[9.5px] font-mono tabular-nums text-arena-warning font-semibold">
                      Δ{d.severity}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
