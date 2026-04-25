"use client";

// ─────────────────────────────────────────────────────────────
// Sweep Results Panel — Side-by-side engine comparison
// ─────────────────────────────────────────────────────────────
// Renders the snapshots produced by `handleRunSweep` in
// app/page.tsx. Each completed engine gets one column showing
// its consensus score, judge majority, claim contradictions,
// and per-engine token totals. Designed to make the *protocol
// space* legible — you see how the same prompt resolves
// differently under CVP, Blind Jury, and Adversarial Red Team.

import { useArenaStore } from "@/lib/store";
import { Layers, Award, Gavel, GitMerge, Coins, Loader2 } from "lucide-react";
import type { EngineType, SessionSnapshot } from "@/lib/types";

const ENGINE_LABEL: Record<EngineType, string> = {
  cvp: "CVP",
  "blind-jury": "Blind Jury",
  adversarial: "Red Team",
};

const ENGINE_DESCRIPTION: Record<EngineType, string> = {
  cvp: "Multi-round structured debate.",
  "blind-jury": "Parallel independent jurors.",
  adversarial: "Rotating attacker stress test.",
};

export default function SweepResultsPanel() {
  const sweepActive = useArenaStore((s) => s.sweepActive);
  const sweepEngines = useArenaStore((s) => s.sweepEngines);
  const sweepCurrentIndex = useArenaStore((s) => s.sweepCurrentIndex);
  const sweepResults = useArenaStore((s) => s.sweepResults);
  const isRunning = useArenaStore((s) => s.isRunning);
  const clearSweep = useArenaStore((s) => s.clearSweep);

  if (!sweepActive && sweepResults.length === 0) return null;

  return (
    <div className="w-full max-w-7xl mx-auto px-6 pb-8 space-y-4">
      <div className="flex items-center gap-3">
        <Layers className="w-4 h-4 text-arena-accent" />
        <h3 className="text-[13px] font-semibold text-arena-text tracking-tight">Engine Sweep</h3>
        <span className="text-[10px] text-arena-muted tabular-nums">
          {sweepResults.length}/{sweepEngines.length} complete
        </span>
        {sweepResults.length === sweepEngines.length && sweepEngines.length > 0 && (
          <button
            onClick={clearSweep}
            className="ml-auto text-[10px] text-arena-muted hover:text-arena-text transition-colors"
          >
            Clear comparison
          </button>
        )}
      </div>
      <p className="text-[11px] text-arena-muted leading-relaxed">
        The same prompt run through every engine in sequence. Each column is a complete consensus
        run — compare how the protocol shape changes the conclusion.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sweepEngines.map((engine, i) => {
          const snapshot = sweepResults[i];
          const isCurrent = sweepActive && i === sweepCurrentIndex && isRunning;
          return (
            <SweepColumn key={engine} engine={engine} snapshot={snapshot} isCurrent={isCurrent} />
          );
        })}
      </div>
    </div>
  );
}

function SweepColumn({
  engine,
  snapshot,
  isCurrent,
}: {
  engine: EngineType;
  snapshot: SessionSnapshot | undefined;
  isCurrent: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-arena-surface/60 p-4 space-y-3 ${
        isCurrent
          ? "border-arena-accent/40 shadow-md shadow-arena-accent/10"
          : snapshot
            ? "border-arena-border/60"
            : "border-arena-border/30 opacity-60"
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <p className="text-[11px] font-semibold text-arena-text">{ENGINE_LABEL[engine]}</p>
          <p className="text-[9px] text-arena-muted leading-tight">{ENGINE_DESCRIPTION[engine]}</p>
        </div>
        {isCurrent ? (
          <div className="flex items-center gap-1 text-[9px] text-arena-accent">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            running…
          </div>
        ) : snapshot && snapshot.finalScore !== null ? (
          <div className="flex items-center gap-1 text-[10px] font-semibold text-arena-success bg-arena-success/10 px-2 py-0.5 rounded-md">
            <Award className="w-3 h-3" />
            {snapshot.finalScore}%
          </div>
        ) : (
          <span className="text-[9px] text-arena-muted/60">queued</span>
        )}
      </div>

      {snapshot && (
        <>
          {snapshot.judge && snapshot.judge.majorityPosition && (
            <div className="rounded-lg bg-arena-bg/40 p-2.5 border border-arena-border/40 space-y-1">
              <div className="flex items-center gap-1.5">
                <Gavel className="w-2.5 h-2.5 text-arena-warning" />
                <p className="text-[9px] font-semibold text-arena-muted uppercase tracking-wider">
                  Majority
                </p>
              </div>
              <p className="text-[10px] text-arena-text leading-relaxed line-clamp-4">
                {snapshot.judge.majorityPosition}
              </p>
            </div>
          )}

          {snapshot.claims && snapshot.claims.contradictions.length > 0 && (
            <div className="rounded-lg bg-arena-accent/5 p-2.5 border border-arena-accent/20 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <GitMerge className="w-2.5 h-2.5 text-arena-accent" />
                <p className="text-[9px] font-semibold text-arena-muted uppercase tracking-wider">
                  Contradictions
                </p>
                <span className="ml-auto text-[8px] font-mono text-arena-muted/70">
                  {snapshot.claims.contradictions.length}
                </span>
              </div>
              <ul className="space-y-1">
                {snapshot.claims.contradictions.slice(0, 3).map((c) => (
                  <li
                    key={c.id}
                    className="text-[10px] text-arena-text/90 leading-snug line-clamp-2"
                  >
                    • {c.claim}
                  </li>
                ))}
                {snapshot.claims.contradictions.length > 3 && (
                  <li className="text-[9px] text-arena-muted/60">
                    +{snapshot.claims.contradictions.length - 3} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {snapshot.disagreements.length > 0 && (
            <div className="text-[10px] text-arena-muted">
              <span className="font-medium text-arena-warning">
                {snapshot.disagreements.length}
              </span>{" "}
              confidence-spread disagreement
              {snapshot.disagreements.length === 1 ? "" : "s"} flagged
            </div>
          )}

          {snapshot.tokenTotal && snapshot.tokenTotal.totalTokens > 0 && (
            <div className="flex items-center gap-1.5 pt-1 border-t border-arena-border/30 text-[9px] text-arena-muted font-mono tabular-nums">
              <Coins className="w-2.5 h-2.5" />
              <span>{snapshot.tokenTotal.totalTokens.toLocaleString()} tok</span>
              <span>·</span>
              <span>${snapshot.tokenTotal.estimatedCostUSD.toFixed(4)}</span>
            </div>
          )}
        </>
      )}

      {!snapshot && !isCurrent && (
        <p className="text-[10px] text-arena-muted/60 italic">Waiting…</p>
      )}
    </div>
  );
}
