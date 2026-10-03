"use client";

// ─────────────────────────────────────────────────────────────
// Run view — anchors, round state and transcript navigation
// ─────────────────────────────────────────────────────────────
// Anchor convention used by the Transcript, ClaimsPanel and
// DisagreementPanel:
//   response card → id = data-response-id = `r{round}-{participantId}`
//   round block   → id = `round-{n}`

import { useCallback, useMemo, useState } from "react";
import type { ConsensusRound } from "@/lib/types";

export const responseAnchorId = (round: number, participantId: string) =>
  `r${round}-${participantId}`;
export const roundAnchorId = (round: number) => `round-${round}`;
/** The transcript's round navigation (scrolled into view when the round changes). */
export const TRANSCRIPT_NAV_ID = "transcript-nav";

export interface RoundProgress {
  isRunning: boolean;
  currentRound: number;
  roundsCompleted: number;
}

/**
 * A round is complete once its score landed, a later round started, or
 * the run finished past it. A partial round of a stopped or failed run is
 * not complete.
 */
export function isRoundComplete(round: ConsensusRound, p: RoundProgress): boolean {
  return (
    round.completed === true ||
    round.number < p.currentRound ||
    (!p.isRunning && round.number <= p.roundsCompleted)
  );
}

export function completedRounds(rounds: ConsensusRound[], p: RoundProgress): ConsensusRound[] {
  return rounds.filter((r) => isRoundComplete(r, p));
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export interface ResponseTarget {
  round: number;
  participantId: string;
}

/**
 * Where to jump for a claim side: the latest response by one of
 * `participantIds` that contains the quote, else that participant's
 * latest answered round. Errored responses are skipped.
 */
export function findResponseTarget(
  rounds: ConsensusRound[],
  participantIds: string[],
  quote?: string,
): ResponseTarget | null {
  if (participantIds.length === 0) return null;
  const needle = quote ? normalize(quote).slice(0, 80) : "";
  const newestFirst = [...rounds].reverse();
  if (needle) {
    for (const r of newestFirst) {
      for (const pid of participantIds) {
        const res = r.responses.find((x) => x.participantId === pid && !x.error);
        if (res && normalize(res.content).includes(needle)) {
          return { round: r.number, participantId: pid };
        }
      }
    }
  }
  for (const pid of participantIds) {
    for (const r of newestFirst) {
      if (r.responses.some((x) => x.participantId === pid && !x.error)) {
        return { round: r.number, participantId: pid };
      }
    }
  }
  return null;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Literal class names so Tailwind's JIT emits them.
export const HIGHLIGHT_CLASSES = ["ring-2", "ring-accent/60"];

/** Flash a ring around an element for 1.5 s. */
export function flashHighlight(el: HTMLElement): void {
  el.classList.add(...HIGHLIGHT_CLASSES);
  window.setTimeout(() => el.classList.remove(...HIGHLIGHT_CLASSES), 1500);
}

/**
 * Scroll an element into view (instant under reduced motion). With
 * `highlight`, flash a ring and move focus to it, so a jump from a control
 * that is about to be hidden (the Brief tab on a phone) does not drop focus.
 */
export function scrollToAnchor(
  id: string,
  opts: { block?: ScrollLogicalPosition; highlight?: boolean } = {},
): boolean {
  if (typeof document === "undefined") return false;
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: opts.block ?? "start",
  });
  if (opts.highlight) {
    flashHighlight(el);
    if (!el.hasAttribute("tabindex")) el.tabIndex = -1;
    el.focus({ preventScroll: true });
  }
  return true;
}

// ── Transcript navigation state ────────────────────────────

export interface FocusRequest {
  anchorId: string;
  block: ScrollLogicalPosition;
  highlight: boolean;
  /** Bumped on every request so repeated jumps to the same anchor still scroll. */
  nonce: number;
}

export interface JumpTarget {
  round: number;
  /** Omit to jump to the round as a whole. */
  participantId?: string;
}

export interface TranscriptNav {
  /** Round the user picked; `null` follows the newest round. */
  pickedRound: number | null;
  /** Participant whose answers are shown across all rounds; `null` = everyone. */
  filter: string | null;
  focus: FocusRequest | null;
  selectRound: (round: number | null, opts?: { clearFilter?: boolean }) => void;
  setFilter: (participantId: string | null) => void;
  /** Open a round (and response) from elsewhere, e.g. a claim in the Brief. */
  jumpTo: (target: JumpTarget) => void;
}

/**
 * State for which round / participant the transcript shows. Owned by
 * RunView (so the Brief can drive it) or by Transcript on its own.
 */
export function useTranscriptNav(): TranscriptNav {
  const [pickedRound, setPickedRound] = useState<number | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);

  const request = useCallback(
    (anchorId: string, block: ScrollLogicalPosition, highlight: boolean) => {
      setFocus((prev) => ({ anchorId, block, highlight, nonce: (prev?.nonce ?? 0) + 1 }));
    },
    [],
  );

  const selectRound = useCallback(
    (round: number | null, opts?: { clearFilter?: boolean }) => {
      setPickedRound(round);
      if (opts?.clearFilter) setFilter(null);
      request(TRANSCRIPT_NAV_ID, "nearest", false);
    },
    [request],
  );

  const jumpTo = useCallback(
    (target: JumpTarget) => {
      setPickedRound(target.round);
      setFilter((f) => (f !== null && f === target.participantId ? f : null));
      if (target.participantId) {
        request(responseAnchorId(target.round, target.participantId), "start", true);
      } else {
        request(roundAnchorId(target.round), "start", false);
      }
    },
    [request],
  );

  return useMemo(
    () => ({ pickedRound, filter, focus, selectRound, setFilter, jumpTo }),
    [pickedRound, filter, focus, selectRound, jumpTo],
  );
}
