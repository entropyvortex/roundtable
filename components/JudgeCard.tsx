"use client";

// ─────────────────────────────────────────────────────────────
// Judge Card — Non-voting synthesizer output
// ─────────────────────────────────────────────────────────────
// Renders the live judge stream (if running) or the final
// synthesis (if complete). Does nothing if the judge was never
// enabled for the run.

import { useArenaStore } from "@/lib/store";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Gavel, Loader2 } from "lucide-react";

const remarkPlugins = [remarkGfm];

export default function JudgeCard() {
  const judge = useArenaStore((s) => s.judge);
  const stream = useArenaStore((s) => s.judgeStream);
  const running = useArenaStore((s) => s.judgeRunning);

  if (!judge && !running) return null;

  const content = running ? stream : (judge?.content ?? "");
  const displayContent = content.replace(/\nJUDGE_CONFIDENCE:\s*\d+\s*$/i, "").trim();

  return (
    <div className="rounded-xl border border-arena-warning/30 bg-arena-surface overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3 border-b border-arena-warning/20 bg-arena-warning/5">
        <Gavel className="w-4 h-4 text-arena-warning" />
        <div className="flex-1">
          <p className="text-[11px] font-semibold text-arena-warning">Consensus Judge</p>
          {judge && (
            <p className="text-[9px] text-arena-muted">
              {judge.providerName} &middot; {judge.modelId}
            </p>
          )}
        </div>
        {running && <Loader2 className="w-3.5 h-3.5 text-arena-warning animate-spin" />}
      </div>
      <div className="px-5 py-4 prose prose-invert prose-sm max-w-none text-arena-text/90 leading-[1.75] [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_h2]:text-[13px] [&_h2]:font-semibold [&_h2]:text-arena-warning [&_h2]:mt-3 [&_h2]:mb-1 [&_strong]:text-arena-text">
        <ReactMarkdown remarkPlugins={remarkPlugins}>{displayContent || "..."}</ReactMarkdown>
      </div>
    </div>
  );
}
