"use client";

// ─────────────────────────────────────────────────────────────
// Transcript — the evidence: one round at a time, or one persona
// across every round
// ─────────────────────────────────────────────────────────────
// Follows the newest round while the run streams unless the user picked
// an earlier round. Round blocks carry `id="round-{n}"`; response cards
// carry `r{n}-{participantId}` so the Brief can jump to them.

import { useEffect, useMemo, type ReactNode } from "react";
import { History } from "lucide-react";
import { useArenaStore } from "@/lib/store";
import type { ConsensusRound, Participant } from "@/lib/types";
import { roundTypeLabel } from "@/lib/score-label";
import { Badge, Button, Skeleton, cn } from "@/components/ui";
import { PersonaDot } from "@/components/ui";
import RoundNav from "./RoundNav";
import { PendingCard, ResponseCard, StreamingCard } from "./ResponseCard";
import {
  TRANSCRIPT_NAV_ID,
  completedRounds,
  roundAnchorId,
  scrollToAnchor,
  useTranscriptNav,
  type TranscriptNav,
} from "./navigation";

export interface TranscriptProps {
  /** Shared navigation state (RunView passes one so the Brief can drive it). */
  nav?: TranscriptNav;
}

export default function Transcript({ nav: external }: TranscriptProps) {
  const own = useTranscriptNav();
  const nav = external ?? own;

  const rounds = useArenaStore((s) => s.rounds);
  const participants = useArenaStore((s) => s.participants);
  const isRunning = useArenaStore((s) => s.isRunning);
  const currentRound = useArenaStore((s) => s.currentRound);
  const roundsCompleted = useArenaStore((s) => s.roundsCompleted);
  const activeStreams = useArenaStore((s) => s.activeStreams);

  const completed = useMemo(
    () =>
      new Set(
        completedRounds(rounds, { isRunning, currentRound, roundsCompleted }).map((r) => r.number),
      ),
    [rounds, isRunning, currentRound, roundsCompleted],
  );

  const latest = rounds.length > 0 ? rounds[rounds.length - 1].number : null;
  const activeNumber =
    nav.pickedRound !== null && rounds.some((r) => r.number === nav.pickedRound)
      ? nav.pickedRound
      : latest;
  const active = rounds.find((r) => r.number === activeNumber) ?? null;
  const lastCompleted = [...rounds].reverse().find((r) => completed.has(r.number))?.number ?? null;
  const liveRound = isRunning ? currentRound : null;
  const filterParticipant =
    nav.filter !== null ? (participants.find((p) => p.id === nav.filter) ?? null) : null;
  const filter = filterParticipant?.id ?? null;

  // Scroll after the requested round/tab has rendered.
  const focus = nav.focus;
  useEffect(() => {
    if (!focus) return;
    scrollToAnchor(focus.anchorId, { block: focus.block, highlight: focus.highlight });
  }, [focus]);

  const pickRound = (n: number) =>
    // Picking the live round again resumes auto-follow.
    nav.selectRound(isRunning && n === latest ? null : n);

  const renderSeat = (p: Participant, round: ConsensusRound, roundLabel?: string) => {
    const response = round.responses.find((r) => r.participantId === p.id);
    if (response) {
      return (
        <ResponseCard key={p.id} participant={p} response={response} roundLabel={roundLabel} />
      );
    }
    if (round.number !== liveRound) return null;
    const stream = activeStreams[p.id];
    if (stream) {
      return <StreamingCard key={p.id} participant={p} text={stream} roundLabel={roundLabel} />;
    }
    return (
      <PendingCard
        key={p.id}
        participant={p}
        started={stream !== undefined}
        roundLabel={roundLabel}
      />
    );
  };

  return (
    <section aria-labelledby="transcript-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="transcript-heading" className="text-base font-semibold text-fg">
          Transcript
        </h2>
        <Button
          variant="secondary"
          size="sm"
          icon={<History className="h-4 w-4" />}
          disabled={lastCompleted === null}
          onClick={() =>
            lastCompleted !== null && nav.selectRound(lastCompleted, { clearFilter: true })
          }
        >
          Final positions
        </Button>
      </div>

      {rounds.length === 0 ? (
        <div className="space-y-3" aria-busy={isRunning || undefined}>
          <p className="text-sm text-fg-muted">
            {isRunning ? "Waiting for the first round to start…" : "No rounds yet."}
          </p>
          {isRunning && <Skeleton className="h-24 w-full" />}
        </div>
      ) : (
        <>
          <div id={TRANSCRIPT_NAV_ID} className="scroll-mt-24 space-y-2">
            <RoundNav
              rounds={rounds}
              value={filter ? null : activeNumber}
              onChange={(n) => (filter ? nav.jumpTo({ round: n }) : pickRound(n))}
              completed={completed}
              liveRound={liveRound}
            />
            {participants.length > 1 && (
              <div role="group" aria-label="Show participant" className="flex flex-wrap gap-1.5">
                <FilterChip pressed={filter === null} onClick={() => nav.setFilter(null)}>
                  Everyone
                </FilterChip>
                {participants.map((p) => (
                  <FilterChip
                    key={p.id}
                    pressed={filter === p.id}
                    onClick={() => nav.setFilter(filter === p.id ? null : p.id)}
                  >
                    <PersonaDot color={p.persona.color} className="h-2 w-2" />
                    {p.persona.name}
                  </FilterChip>
                ))}
              </div>
            )}
          </div>

          {filterParticipant ? (
            <div className="space-y-4">
              {rounds.map((r) => {
                const seat = renderSeat(
                  filterParticipant,
                  r,
                  `R${r.number} ${roundTypeLabel(r.type)}`,
                );
                if (!seat) return null;
                return (
                  <div key={r.number} id={roundAnchorId(r.number)} className="scroll-mt-24">
                    {seat}
                  </div>
                );
              })}
            </div>
          ) : (
            active && (
              <div id={roundAnchorId(active.number)} className="scroll-mt-24 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-fg">
                    Round {active.number}
                    <span className="font-normal text-fg-muted"> · {active.label}</span>
                  </h3>
                  {completed.has(active.number) ? (
                    <Badge>Score {active.consensusScore}</Badge>
                  ) : active.number === liveRound ? (
                    <Badge tone="accent">In progress</Badge>
                  ) : null}
                </div>
                {participants.map((p) => renderSeat(p, active))}
              </div>
            )
          )}
        </>
      )}
    </section>
  );
}

function FilterChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors duration-150",
        pressed
          ? "border-fg/30 bg-surface-2 text-fg"
          : "border-border text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
