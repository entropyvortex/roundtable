"use client";

// ─────────────────────────────────────────────────────────────
// Brief — the answer first: score, verdict, where they split,
// who moved. Fills in progressively while the run streams.
// ─────────────────────────────────────────────────────────────

import { useMemo, type ReactNode } from "react";
import { AlertCircle, Info } from "lucide-react";
import { useArenaStore } from "@/lib/store";
import { SCORE_EXPLAINER, scoreLabel } from "@/lib/score-label";
import { Badge, Skeleton, Tooltip } from "@/components/ui";
import JudgeCard from "../JudgeCard";
import ClaimsPanel from "../ClaimsPanel";
import { BriefSection, MutedNote } from "./BriefSection";
import WhoMoved from "./WhoMoved";
import { completedRounds, findResponseTarget, type JumpTarget } from "./navigation";

export interface BriefProps {
  /** Open a response or round in the transcript (RunView switches round / tab and scrolls). */
  onJump: (target: JumpTarget) => void;
}

/** Slim one-line note in place of a section that has nothing to show. */
function Nudge({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-card border border-dashed border-border px-4 py-3 text-sm text-fg-muted">
      {children}
    </p>
  );
}

export default function Brief({ onJump }: BriefProps) {
  const rounds = useArenaStore((s) => s.rounds);
  // The shown run's options; Setup's only before anything has run.
  const options = useArenaStore((s) => s.runOptions ?? s.options);
  const isRunning = useArenaStore((s) => s.isRunning);
  const finalScore = useArenaStore((s) => s.finalScore);
  const runError = useArenaStore((s) => s.runError);
  const judge = useArenaStore((s) => s.judge);
  const judgeRunning = useArenaStore((s) => s.judgeRunning);
  const claims = useArenaStore((s) => s.claims);
  const claimsRunning = useArenaStore((s) => s.claimsRunning);
  const sharedView = useArenaStore((s) => s.sharedView);

  const failed = runError !== null;
  const finished = !isRunning && (finalScore !== null || rounds.length > 0);

  const jumpToResponse = (participantIds: string[], quote: string) => {
    const target = findResponseTarget(rounds, participantIds, quote);
    if (target) onJump(target);
  };

  let judgeBlock: ReactNode = null;
  if (judge || judgeRunning) {
    judgeBlock = <JudgeCard />;
  } else if (!options.judgeEnabled) {
    if (finished && !failed) {
      judgeBlock = (
        <Nudge>
          {sharedView
            ? "Judge synthesis was off for this run, so there is no written verdict."
            : "Enable judge synthesis to get a written verdict."}
        </Nudge>
      );
    }
  } else if (isRunning) {
    judgeBlock = (
      <BriefSection title="Judge synthesis" meta="Non-voting summariser">
        <MutedNote>The judge writes its verdict after the final round.</MutedNote>
      </BriefSection>
    );
  } else if (!failed) {
    judgeBlock = <Nudge>No judge verdict was produced for this run.</Nudge>;
  }

  const claimsEnabled = options.extractClaimsEnabled === true;
  let claimsBlock: ReactNode = null;
  if (claims || claimsRunning) {
    claimsBlock = <ClaimsPanel onJumpToResponse={jumpToResponse} />;
  } else if (claimsEnabled && isRunning) {
    claimsBlock = (
      <BriefSection title="Where they split">
        <MutedNote>Contradictions are extracted after the final round.</MutedNote>
      </BriefSection>
    );
  } else if (!claimsEnabled && finished && !failed) {
    claimsBlock = (
      <Nudge>
        {sharedView
          ? "Claim extraction was off for this run."
          : "Enable claim extraction to see exactly where participants contradict each other."}
      </Nudge>
    );
  }

  return (
    <div className="space-y-4">
      <ScoreSummary />
      {judgeBlock}
      {claimsBlock}
      {(!failed || rounds.length > 0) && <WhoMoved />}
    </div>
  );
}

// ── Consensus score ────────────────────────────────────────

function ScoreSummary() {
  const rounds = useArenaStore((s) => s.rounds);
  const isRunning = useArenaStore((s) => s.isRunning);
  const currentRound = useArenaStore((s) => s.currentRound);
  const roundsCompleted = useArenaStore((s) => s.roundsCompleted);
  const finalScore = useArenaStore((s) => s.finalScore);
  const runError = useArenaStore((s) => s.runError);
  const earlyStopped = useArenaStore((s) => s.earlyStopped);

  const done = useMemo(
    () => completedRounds(rounds, { isRunning, currentRound, roundsCompleted }),
    [rounds, isRunning, currentRound, roundsCompleted],
  );
  const failed = runError !== null;
  const lastDone = done[done.length - 1];
  const score = finalScore ?? lastDone?.consensusScore ?? null;
  const label = scoreLabel(score);

  const explainer = (
    <Tooltip content={SCORE_EXPLAINER} side="bottom">
      <button
        type="button"
        aria-label="How the score is computed"
        className="inline-flex h-8 w-8 items-center justify-center rounded-control text-fg-muted hover:bg-surface-2 hover:text-fg"
      >
        <Info aria-hidden className="h-4 w-4" />
      </button>
    </Tooltip>
  );

  let body: ReactNode;
  if (failed) {
    body = (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-control border border-danger/40 bg-danger/5 p-3"
      >
        <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-danger">The run failed</p>
          <p className="break-words text-[13px] text-fg">{runError}</p>
        </div>
      </div>
    );
  } else if (score === null) {
    body = isRunning ? (
      <div aria-busy="true" className="space-y-2">
        <Skeleton className="h-12 w-24" />
        <p className="text-[13px] text-fg-muted">The score appears when round 1 finishes.</p>
      </div>
    ) : (
      <MutedNote>No round finished before the run stopped.</MutedNote>
    );
  } else {
    const qualifier = isRunning
      ? `So far, after round ${lastDone?.number}`
      : finalScore === null
        ? `Run stopped — score after round ${lastDone?.number}`
        : `Final score after ${roundsCompleted} ${roundsCompleted === 1 ? "round" : "rounds"}`;
    body = (
      <>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <p className="text-5xl font-semibold leading-none tabular-nums text-fg">
            {score}
            <span className="ml-1 text-base font-normal text-fg-muted">/100</span>
          </p>
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-1">
              <Badge tone={label.tone} className="text-[13px]">
                {label.label}
              </Badge>
              {explainer}
            </div>
            <p className="text-[13px] text-fg-muted">{label.description}</p>
          </div>
        </div>
        <p className="text-[13px] text-fg-muted">
          {qualifier}
          {earlyStopped && ` · converged early after round ${earlyStopped.round}`}
        </p>
        {done.length > 1 && (
          <ol aria-label="Score by round" className="flex flex-wrap gap-1.5">
            {done.map((r) => (
              <li
                key={r.number}
                className="rounded-full border border-border px-2.5 py-0.5 text-[13px] tabular-nums text-fg-muted"
              >
                {`R${r.number} ${r.consensusScore}`}
              </li>
            ))}
          </ol>
        )}
      </>
    );
  }

  return <BriefSection title="Consensus score">{body}</BriefSection>;
}
