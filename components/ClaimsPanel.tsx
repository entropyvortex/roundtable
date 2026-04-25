"use client";

// ─────────────────────────────────────────────────────────────
// Claims Panel — Claim-level contradictions
// ─────────────────────────────────────────────────────────────
// Renders the structured claim-level contradictions extracted by
// the LLM pass that runs after the final round. Unlike the
// confidence-spread disagreement ledger, each claim here is a
// semantic split with verbatim quotes per side.
//
// Returns null when claims aren't enabled / no contradictions
// were found / extraction is still running.

import { useArenaStore } from "@/lib/store";
import { AlertCircle, GitMerge, Loader2, Quote } from "lucide-react";

function scrollToResponse(participantIds: string[]) {
  // Best-effort: scroll to the last round's response from the first
  // listed participant. The UI uses `id="r{round}-{participantId}"`.
  if (participantIds.length === 0) return;
  // Find any matching response card on the page.
  const matches = participantIds
    .flatMap((pid) =>
      Array.from(document.querySelectorAll<HTMLElement>(`[data-response-id$="-${pid}"]`)),
    )
    .sort((a, b) => {
      const ar = parseInt(a.getAttribute("data-response-id")?.match(/^r(\d+)/)?.[1] ?? "0", 10);
      const br = parseInt(b.getAttribute("data-response-id")?.match(/^r(\d+)/)?.[1] ?? "0", 10);
      return br - ar; // last round first
    });
  const target = matches[0];
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("ring-1", "ring-arena-accent/50", "ring-offset-1", "ring-offset-arena-bg");
  setTimeout(
    () =>
      target.classList.remove(
        "ring-1",
        "ring-arena-accent/50",
        "ring-offset-1",
        "ring-offset-arena-bg",
      ),
    1500,
  );
}

export default function ClaimsPanel() {
  const claims = useArenaStore((s) => s.claims);
  const claimsRunning = useArenaStore((s) => s.claimsRunning);
  const participants = useArenaStore((s) => s.participants);

  if (claimsRunning) {
    return (
      <div className="rounded-xl border border-arena-accent/20 bg-arena-surface/60 p-4 flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 text-arena-accent animate-spin" />
        <span className="text-[11px] text-arena-muted">Extracting contradictions…</span>
      </div>
    );
  }

  if (!claims) return null;

  if (claims.error) {
    return (
      <div className="rounded-xl border border-arena-danger/30 bg-arena-danger/5 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-arena-danger" />
          <h4 className="text-[10px] font-semibold text-arena-danger uppercase tracking-[0.15em]">
            Claim Extraction Failed
          </h4>
        </div>
        <p className="text-[10px] text-arena-muted leading-relaxed font-mono break-words">
          {claims.error}
        </p>
        <p className="text-[10px] text-arena-muted/70 leading-relaxed">
          The run completed normally — only the post-final claim pass failed. Try again or pick a
          different judge model in the Protocol panel.
        </p>
      </div>
    );
  }

  if (claims.contradictions.length === 0) {
    return (
      <div className="rounded-xl border border-arena-border/60 bg-arena-surface/60 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <GitMerge className="w-3.5 h-3.5 text-arena-accent" />
          <h4 className="text-[10px] font-semibold text-arena-muted uppercase tracking-[0.15em]">
            Claim-Level Contradictions
          </h4>
        </div>
        <p className="text-[10px] text-arena-muted leading-relaxed">
          The extractor found no substantive contradictions in the final round. Participants either
          converged or differed only in degree.
        </p>
      </div>
    );
  }

  const lookup = (id: string) => participants.find((p) => p.id === id);

  return (
    <div className="rounded-xl border border-arena-accent/20 bg-arena-surface/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <GitMerge className="w-3.5 h-3.5 text-arena-accent" />
        <h4 className="text-[10px] font-semibold text-arena-muted uppercase tracking-[0.15em]">
          Claim-Level Contradictions
        </h4>
        <span className="ml-auto text-[9px] font-mono text-arena-muted/70 tabular-nums">
          {claims.contradictions.length}
        </span>
      </div>
      <div className="space-y-2.5">
        {claims.contradictions.map((c) => (
          <div
            key={c.id}
            className="rounded-lg border border-arena-border/40 bg-arena-bg/40 p-2.5 space-y-2"
          >
            <p className="text-[11px] font-medium text-arena-text leading-snug">{c.claim}</p>
            <div className="space-y-1.5">
              {c.sides.map((side, idx) => {
                const dominantPersona = lookup(side.participantIds[0])?.persona;
                const color = dominantPersona?.color ?? "#94a3b8";
                return (
                  <button
                    key={idx}
                    onClick={() => scrollToResponse(side.participantIds)}
                    className="w-full flex items-start gap-2 text-left p-1.5 rounded-md hover:bg-arena-accent/5 transition-colors"
                  >
                    <div
                      className="w-[3px] self-stretch rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] font-medium" style={{ color }}>
                          {side.stance}
                        </span>
                        <span className="text-[9px] text-arena-muted/70">
                          {side.participantIds
                            .map((pid) => lookup(pid)?.persona.name ?? pid)
                            .join(", ")}
                        </span>
                      </div>
                      <div className="flex items-start gap-1 text-[10px] text-arena-muted/80 italic leading-snug">
                        <Quote className="w-2.5 h-2.5 shrink-0 mt-0.5 opacity-60" />
                        <span className="line-clamp-3">{side.quote}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[8px] text-arena-muted/60 leading-relaxed">
        Extracted by {claims.providerName} / {claims.modelId}. Quotes are verbatim from
        participants&apos; final-round responses.
      </p>
    </div>
  );
}
