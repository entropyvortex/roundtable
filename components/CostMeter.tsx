"use client";

// ─────────────────────────────────────────────────────────────
// Cost Meter — live token usage & estimated cost, with breakdown
// ─────────────────────────────────────────────────────────────

import { useArenaStore } from "@/lib/store";
import type { TokenUsage } from "@/lib/types";
import { formatCost, formatTokens } from "@/lib/format";
import { PersonaDot } from "@/components/ui";
import { BriefSection } from "./run/BriefSection";

interface Row {
  id: string;
  label: string;
  color?: string;
  usage: TokenUsage;
}

export default function CostMeter() {
  const total = useArenaStore((s) => s.tokenTotal);
  const isRunning = useArenaStore((s) => s.isRunning);
  const usageByParticipant = useArenaStore((s) => s.usageByParticipant);
  const participants = useArenaStore((s) => s.participants);
  const judgeUsage = useArenaStore((s) => s.judge?.usage);
  const claimsUsage = useArenaStore((s) => s.claims?.usage);

  if (total.totalTokens === 0 && !isRunning) return null;

  const rows: Row[] = participants
    .filter((p) => usageByParticipant[p.id])
    .map((p) => ({
      id: p.id,
      label: p.persona.name,
      color: p.persona.color,
      usage: usageByParticipant[p.id],
    }));
  if (judgeUsage) rows.push({ id: "judge", label: "Judge", usage: judgeUsage });
  if (claimsUsage) rows.push({ id: "claims", label: "Claim extraction", usage: claimsUsage });

  return (
    <BriefSection
      title="Cost (estimated)"
      aside={
        isRunning ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-accent">
            <span aria-hidden className="h-2 w-2 rounded-full bg-accent" />
            Live
          </span>
        ) : undefined
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-semibold tabular-nums text-fg">
          {formatCost(total.estimatedCostUSD)}
        </span>
        <span className="text-[13px] tabular-nums text-fg-muted">
          {formatTokens(total.totalTokens)} tok
        </span>
      </div>
      <p className="text-[13px] tabular-nums text-fg-muted">
        {formatTokens(total.inputTokens)} in · {formatTokens(total.outputTokens)} out
      </p>
      {rows.length > 0 && (
        <table className="w-full text-[13px]">
          <caption className="sr-only">Usage by seat, judge and claim extraction</caption>
          <thead>
            <tr className="border-b border-border text-left text-fg-muted">
              <th scope="col" className="py-1.5 font-medium">
                Seat
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                Tokens
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                Est.
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <th scope="row" className="py-1.5 text-left font-normal text-fg">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {r.color && <PersonaDot color={r.color} className="h-2 w-2" />}
                    <span className="truncate">{r.label}</span>
                  </span>
                </th>
                <td className="py-1.5 text-right tabular-nums text-fg-muted">
                  {formatTokens(r.usage.totalTokens)}
                </td>
                <td className="py-1.5 text-right tabular-nums text-fg">
                  {formatCost(r.usage.estimatedCostUSD)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[13px] text-fg-muted">
        From the built-in price table; your provider’s bill may differ.
      </p>
    </BriefSection>
  );
}
