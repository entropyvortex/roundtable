"use client";

// ─────────────────────────────────────────────────────────────
// Message Flow Diagram — High-contrast floating sidebar
// ─────────────────────────────────────────────────────────────

import { useArenaStore } from "@/lib/store";
import { useMemo, useState, memo, useCallback } from "react";
import {
  GitBranch,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Circle,
  CheckCircle2,
  Loader2,
} from "lucide-react";

function scrollToResponse(responseId: string) {
  const el = document.getElementById(responseId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-1", "ring-arena-accent/50", "ring-offset-1", "ring-offset-arena-bg");
  setTimeout(() => {
    el.classList.remove("ring-1", "ring-arena-accent/50", "ring-offset-1", "ring-offset-arena-bg");
  }, 1500);
}

function scrollToRound(roundNumber: number) {
  const el = document.getElementById(`round-${roundNumber}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function MessageFlowDiagram() {
  const rounds = useArenaStore((s) => s.rounds);
  const participants = useArenaStore((s) => s.participants);
  const currentRound = useArenaStore((s) => s.currentRound);
  const isRunning = useArenaStore((s) => s.isRunning);
  const [collapsed, setCollapsed] = useState(false);

  const flowEvents = useMemo(() => {
    const events: FlowEvent[] = [];
    for (const round of rounds) {
      events.push({
        type: "round-header",
        round: round.number,
        label: round.label,
        consensusScore: round.consensusScore,
      });
      for (const response of round.responses) {
        const p = participants.find((x) => x.id === response.participantId);
        if (!p) continue;
        const raw = response.content.replace(/\nCONFIDENCE:\s*\d+\s*$/i, "").trim();
        events.push({
          type: "message",
          round: round.number,
          participantId: response.participantId,
          from: p.modelInfo.modelId,
          fromColor: p.persona.color,
          persona: p.persona.name,
          confidence: response.confidence,
          snippet: raw.length > 70 ? raw.slice(0, 70) + "..." : raw,
        });
      }
    }
    return events;
  }, [rounds, participants]);

  const msgCount = useMemo(
    () => flowEvents.filter((e) => e.type === "message").length,
    [flowEvents],
  );

  if (rounds.length === 0) return null;

  return (
    <div className="hidden xl:block fixed right-5 top-[69px] w-[310px] max-h-[calc(100vh-85px)] z-20">
      <div className="bg-arena-surface border border-arena-border/60 rounded-xl shadow-lg shadow-black/20 overflow-hidden flex flex-col max-h-[calc(100vh-85px)]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 px-4 py-3 border-b border-arena-border/40 hover:bg-arena-accent/5 transition-colors w-full"
        >
          <GitBranch className="w-3.5 h-3.5 text-arena-accent" />
          <span className="text-[10px] font-semibold text-arena-muted uppercase tracking-[0.12em] flex-1 text-left">
            Message Flow
          </span>
          <span className="text-[9px] text-arena-muted/70 font-mono tabular-nums">{msgCount}</span>
          {collapsed ? (
            <ChevronDown className="w-3 h-3 text-arena-muted" />
          ) : (
            <ChevronUp className="w-3 h-3 text-arena-muted" />
          )}
        </button>

        {!collapsed && (
          <div className="overflow-y-auto flex-1 p-3 space-y-0.5">
            {/* Participant badges */}
            <div className="flex flex-wrap items-center gap-1.5 pb-2.5 mb-2 border-b border-arena-border/30">
              {participants.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium"
                  style={{ backgroundColor: `${p.persona.color}15`, color: p.persona.color }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: p.persona.color }}
                  />
                  <span className="truncate max-w-[75px]">{p.modelInfo.modelId}</span>
                </div>
              ))}
            </div>

            {flowEvents.map((event, i) => (
              <FlowEventRow key={i} event={event} />
            ))}

            {isRunning && (
              <div className="flex items-center gap-2 px-2 py-2 text-[9px] text-arena-muted">
                <Loader2 className="w-2.5 h-2.5 animate-spin text-arena-accent" />
                Round {currentRound}...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type FlowEvent =
  | { type: "round-header"; round: number; label: string; consensusScore: number }
  | {
      type: "message";
      round: number;
      participantId: string;
      from: string;
      fromColor: string;
      persona: string;
      confidence: number;
      snippet: string;
    };

const FlowEventRow = memo(function FlowEventRow({ event }: { event: FlowEvent }) {
  const handleClick = useCallback(() => {
    if (event.type === "round-header") scrollToRound(event.round);
    else scrollToResponse(`r${event.round}-${event.participantId}`);
  }, [event]);

  if (event.type === "round-header") {
    return (
      <button
        onClick={handleClick}
        className="flex items-center gap-2 py-2 mt-1 w-full hover:opacity-70 transition-opacity cursor-pointer"
      >
        <div className="flex-1 h-px bg-arena-border/40" />
        <div className="flex items-center gap-1.5">
          {event.consensusScore > 0 ? (
            <CheckCircle2 className="w-3 h-3 text-arena-success" />
          ) : (
            <Circle className="w-3 h-3 text-arena-accent/60" />
          )}
          <span className="text-[9px] font-semibold text-arena-muted uppercase tracking-wider whitespace-nowrap">
            R{event.round} {event.label}
          </span>
          {event.consensusScore > 0 && (
            <span className="text-[8px] font-mono text-arena-success">{event.consensusScore}%</span>
          )}
        </div>
        <div className="flex-1 h-px bg-arena-border/40" />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-arena-accent/5 transition-colors group w-full text-left cursor-pointer"
    >
      <div
        className="w-[3px] min-h-[20px] rounded-full shrink-0 mt-0.5 self-stretch"
        style={{ backgroundColor: event.fromColor }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-medium truncate" style={{ color: event.fromColor }}>
            {event.from}
          </span>
          <ArrowRight className="w-2 h-2 text-arena-muted/40 shrink-0" />
          <span className="text-[9px] text-arena-accent font-medium shrink-0">CVP</span>
          <span className="ml-auto text-[8px] font-mono text-arena-muted/70 shrink-0 tabular-nums">
            {event.confidence}%
          </span>
        </div>
        <p className="text-[9px] text-arena-muted/60 mt-0.5 line-clamp-1 group-hover:text-arena-muted transition-colors leading-relaxed">
          {event.snippet}
        </p>
      </div>
    </button>
  );
});
