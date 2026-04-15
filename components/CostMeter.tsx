"use client";

// ─────────────────────────────────────────────────────────────
// Cost Meter — Live token usage & estimated cost
// ─────────────────────────────────────────────────────────────
// Shows running total tokens and estimated USD cost. Pricing is
// client-side and clearly flagged as an estimate in the label.

import { useArenaStore } from "@/lib/store";
import { DollarSign } from "lucide-react";

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export default function CostMeter() {
  const total = useArenaStore((s) => s.tokenTotal);
  const isRunning = useArenaStore((s) => s.isRunning);

  if (total.totalTokens === 0 && !isRunning) return null;

  return (
    <div className="rounded-xl border border-arena-border/60 bg-arena-surface/60 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <DollarSign className="w-3.5 h-3.5 text-arena-success" />
        <h4 className="text-[10px] font-semibold text-arena-muted uppercase tracking-[0.15em]">
          Cost (estimated)
        </h4>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-bold text-arena-text font-mono tabular-nums">
          {formatCost(total.estimatedCostUSD)}
        </span>
        <span className="text-[11px] text-arena-muted font-mono tabular-nums">
          {formatTokens(total.totalTokens)} tokens
        </span>
      </div>
      <div className="flex items-center gap-3 text-[9px] text-arena-muted font-mono tabular-nums">
        <span>in {formatTokens(total.inputTokens)}</span>
        <span>out {formatTokens(total.outputTokens)}</span>
      </div>
    </div>
  );
}
