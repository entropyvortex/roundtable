"use client";

// ─────────────────────────────────────────────────────────────
// Claims Panel — "Where they split": claim-level contradictions
// ─────────────────────────────────────────────────────────────
// Each card is one semantic contradiction extracted after the final
// round: the claim, then each side as `[dot] Persona — stance` with the
// verbatim quote. Persona names are buttons that jump to that
// participant's response in the transcript.
//
// Returns null when there is nothing to show (claims off / not run).

import { AlertCircle } from "lucide-react";
import { useArenaStore } from "@/lib/store";
import { Badge, PersonaDot, Skeleton } from "@/components/ui";
import { BriefSection, MutedNote } from "./run/BriefSection";

export interface ClaimsPanelProps {
  /**
   * Jump to a participant's response. Receives the side's participant(s)
   * and its verbatim quote so the caller can find the exact round.
   */
  onJumpToResponse: (participantIds: string[], quote: string) => void;
}

const TITLE = "Where they split";

export default function ClaimsPanel({ onJumpToResponse }: ClaimsPanelProps) {
  const claims = useArenaStore((s) => s.claims);
  const claimsRunning = useArenaStore((s) => s.claimsRunning);
  const participants = useArenaStore((s) => s.participants);

  if (claimsRunning) {
    return (
      <BriefSection title={TITLE} meta="Extracting contradictions…">
        <div aria-busy="true" className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </BriefSection>
    );
  }

  if (!claims) return null;

  const meta = `Extracted by ${claims.providerName} / ${claims.modelId}`;

  if (claims.error) {
    return (
      <BriefSection title={TITLE} meta={meta}>
        <div
          role="alert"
          className="space-y-1 rounded-control border border-danger/40 bg-danger/5 p-3"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <AlertCircle aria-hidden className="h-4 w-4 shrink-0" />
            Claim extraction failed
          </p>
          <p className="break-words font-mono text-[13px] text-fg">{claims.error}</p>
          <p className="text-[13px] text-fg-muted">
            The run itself completed; only the contradiction pass failed. Re-run, or pick a
            different judge model.
          </p>
        </div>
      </BriefSection>
    );
  }

  if (claims.contradictions.length === 0) {
    return (
      <BriefSection title={TITLE} meta={meta}>
        <MutedNote>
          No substantive contradictions found — participants converged or differed only in degree.
        </MutedNote>
      </BriefSection>
    );
  }

  const lookup = (id: string) => participants.find((p) => p.id === id);

  return (
    <BriefSection title={TITLE} meta={meta} aside={<Badge>{claims.contradictions.length}</Badge>}>
      <ol className="space-y-3">
        {claims.contradictions.map((c) => (
          <li key={c.id} className="rounded-control border border-border p-3">
            <p className="text-sm font-medium text-fg">{c.claim}</p>
            <ul className="mt-2 space-y-3">
              {c.sides.map((side, idx) => (
                <li key={idx} className="space-y-1.5">
                  <p className="text-[13px] leading-snug text-fg-muted">
                    {side.participantIds.map((pid, i) => {
                      const persona = lookup(pid)?.persona;
                      return (
                        <span key={pid}>
                          {i > 0 && ", "}
                          <button
                            type="button"
                            onClick={() => onJumpToResponse([pid], side.quote)}
                            title="Show this response in the transcript"
                            className="inline-flex items-center gap-1.5 rounded-sm font-medium text-fg hover:underline"
                          >
                            <PersonaDot color={persona?.color ?? "rgb(var(--fg-muted))"} />
                            {persona?.name ?? pid}
                            <span className="sr-only">: show response in transcript</span>
                          </button>
                        </span>
                      );
                    })}
                    <span aria-hidden> — </span>
                    <span className="sr-only">, stance: </span>
                    <span className="text-fg">{side.stance}</span>
                  </p>
                  <blockquote className="border-l-2 border-border-strong pl-3 text-sm italic leading-relaxed text-fg-muted">
                    {side.quote}
                  </blockquote>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p className="text-[13px] text-fg-muted">Quotes are verbatim from participants’ answers.</p>
    </BriefSection>
  );
}
