"use client";

// ─────────────────────────────────────────────────────────────
// Message Flow Diagram — Floating right-side summary panel
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
import CostMeter from "./CostMeter";
import ConfidenceTrajectory from "./ConfidenceTrajectory";
import DisagreementPanel from "./DisagreementPanel";
import { FlowArt } from "./HeroArt";
import ClaimsPanel from "./ClaimsPanel";

function scrollToResponse(responseId: string) {
  const el = document.getElementById(responseId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-arena-accent/60");
  setTimeout(() => {
    el.classList.remove("ring-2", "ring-arena-accent/60");
  }, 1500);
}

function scrollToRound(roundNumber: number) {
  const el = document.getElementById(`round-${roundNumber}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function MessageFlowDiagram() {
  const rounds = useArenaStore((s) => s.rounds);
  const isRunning = useArenaStore((s) => s.isRunning);
  const tokenTotal = useArenaStore((s) => s.tokenTotal);
  const disagreements = useArenaStore((s) => s.disagreements);

  const hasRounds = rounds.length > 0;
  const hasCost = tokenTotal.totalTokens > 0 || isRunning;
  const hasDisagreements = disagreements.length > 0;

  if (!hasRounds && !hasCost && !hasDisagreements) return null;

  return (
    <div
      className="hidden xl:block fixed right-6 w-[330px] z-20"
      style={{
        top: "calc(var(--rt-header-h) + 18px)",
        maxHeight: "calc(100vh - var(--rt-header-h) - 36px)",
      }}
    >
      <div
        className="flex flex-col gap-4 overflow-y-auto pr-1"
        style={{ maxHeight: "calc(100vh - var(--rt-header-h) - 36px)" }}
      >
        <CostMeter />
        <ConfidenceTrajectory />
        <DisagreementPanel />
        <ClaimsPanel />
        <MessageFlowCard />
      </div>
    </div>
  );
}

function MessageFlowCard() {
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
          snippet: raw.length > 70 ? raw.slice(0, 70) + "…" : raw,
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
    <div className="glass overflow-hidden flex flex-col">
      <FlowArt className="h-[100px]" />
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05] hover:bg-white/[0.03] transition-colors w-full"
      >
        <GitBranch className="w-3.5 h-3.5 text-arena-accent" />
        <span className="section-label flex-1 text-left">Message Flow</span>
        <span className="text-[9.5px] text-arena-glow font-mono tabular-nums px-1.5 py-0.5 rounded-md bg-arena-accent/12 border border-arena-accent/25">
          {msgCount}
        </span>
        {collapsed ? (
          <ChevronDown className="w-3 h-3 text-arena-muted" />
        ) : (
          <ChevronUp className="w-3 h-3 text-arena-muted" />
        )}
      </button>

      {!collapsed && (
        <div className="p-3.5 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 pb-3 mb-2 border-b border-white/[0.04]">
            {participants.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium"
                style={{
                  backgroundColor: `${p.persona.color}18`,
                  color: p.persona.color,
                  border: `1px solid ${p.persona.color}30`,
                }}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: p.persona.color,
                    boxShadow: `0 0 4px ${p.persona.color}`,
                  }}
                />
                <span className="truncate max-w-[75px]">{p.modelInfo.modelId}</span>
              </div>
            ))}
          </div>

          {flowEvents.map((event, i) => (
            <FlowEventRow key={i} event={event} />
          ))}

          {isRunning && (
            <div className="flex items-center gap-2 px-2 py-2 text-[9.5px] text-arena-glow">
              <Loader2 className="w-2.5 h-2.5 animate-spin text-arena-accent" />
              Round {currentRound}…
            </div>
          )}
        </div>
      )}
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
        className="flex items-center gap-2 py-2 mt-1 w-full hover:opacity-80 transition-opacity cursor-pointer"
      >
        <div className="flex-1 h-px bg-gradient-to-r from-transparent to-arena-blue/30" />
        <div className="flex items-center gap-1.5">
          {event.consensusScore > 0 ? (
            <CheckCircle2 className="w-3 h-3 text-arena-success drop-shadow-[0_0_4px_rgba(52,211,153,0.6)]" />
          ) : (
            <Circle className="w-3 h-3 text-arena-accent/70" />
          )}
          <span className="text-[9.5px] font-semibold text-arena-glow uppercase tracking-[0.15em] whitespace-nowrap">
            R{event.round} · {event.label}
          </span>
          {event.consensusScore > 0 && (
            <span className="text-[9px] font-mono text-arena-success">{event.consensusScore}%</span>
          )}
        </div>
        <div className="flex-1 h-px bg-gradient-to-l from-transparent to-arena-blue/30" />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors group w-full text-left cursor-pointer"
    >
      <div
        className="w-[3px] min-h-[20px] rounded-full shrink-0 mt-0.5 self-stretch"
        style={{
          backgroundColor: event.fromColor,
          boxShadow: `0 0 6px ${event.fromColor}90`,
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10.5px] font-semibold truncate" style={{ color: event.fromColor }}>
            {event.from}
          </span>
          <ArrowRight className="w-2 h-2 text-arena-muted/45 shrink-0" />
          <span className="text-[9px] text-arena-glow font-medium shrink-0 px-1.5 py-0.5 rounded bg-arena-accent/10">
            CVP
          </span>
          <span className="ml-auto text-[8.5px] font-mono text-arena-muted/80 shrink-0 tabular-nums">
            {event.confidence}%
          </span>
        </div>
        <p className="text-[9.5px] text-arena-muted/65 mt-0.5 line-clamp-1 group-hover:text-arena-muted transition-colors leading-relaxed">
          {event.snippet}
        </p>
      </div>
    </button>
  );
});
