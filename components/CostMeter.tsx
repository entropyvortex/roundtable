"use client";

// ─────────────────────────────────────────────────────────────
// Cost Meter — Live token usage & estimated cost
// ─────────────────────────────────────────────────────────────

import { useArenaStore } from "@/lib/store";
import { CostArt } from "./HeroArt";
import { DollarSign, ArrowUpRight, ArrowDownLeft } from "lucide-react";

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
    <div className="glass overflow-hidden">
      <CostArt className="h-[110px]" />
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="section-label">
            <DollarSign className="w-2.5 h-2.5" /> Cost · Estimated
          </p>
          {isRunning && (
            <span className="flex items-center gap-1 text-[9px] text-arena-glow font-medium">
              <span className="relative flex w-1.5 h-1.5">
                <span className="animate-ping absolute inline-flex w-full h-full rounded-full bg-arena-accent opacity-75" />
                <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-arena-accent" />
              </span>
              Live
            </span>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[28px] font-bold text-arena-text font-mono tabular-nums tracking-tight bg-gradient-to-br from-[#ffd0a8] to-[#ff6200] bg-clip-text text-transparent">
            {formatCost(total.estimatedCostUSD)}
          </span>
          <span className="text-[11px] text-arena-muted font-mono tabular-nums">
            {formatTokens(total.totalTokens)} tok
          </span>
        </div>
        <div className="flex items-center gap-3 pt-1.5 border-t border-white/[0.05]">
          <div className="flex items-center gap-1.5 text-[10px]">
            <ArrowDownLeft className="w-2.5 h-2.5 text-arena-blue" />
            <span className="text-arena-muted">in</span>
            <span className="font-mono tabular-nums text-arena-text/85">
              {formatTokens(total.inputTokens)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <ArrowUpRight className="w-2.5 h-2.5 text-arena-glow" />
            <span className="text-arena-muted">out</span>
            <span className="font-mono tabular-nums text-arena-text/85">
              {formatTokens(total.outputTokens)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
