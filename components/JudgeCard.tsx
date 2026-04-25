"use client";

// ─────────────────────────────────────────────────────────────
// Judge Card — Non-voting synthesizer output
// ─────────────────────────────────────────────────────────────

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
    <div className="glass overflow-hidden border border-arena-warning/35 shadow-[0_0_28px_-8px_rgba(251,191,36,0.4)]">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-arena-warning/20 bg-arena-warning/5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#fbbf24] to-[#b8860b] flex items-center justify-center shadow-[0_0_14px_rgba(251,191,36,0.55)]">
          <Gavel className="w-4 h-4 text-[#1f1300]" />
        </div>
        <div className="flex-1">
          <p className="text-[12px] font-semibold text-arena-warning tracking-tight">
            Consensus Judge
          </p>
          {judge && (
            <p className="text-[10px] text-arena-muted mt-0.5">
              {judge.providerName} · {judge.modelId}
            </p>
          )}
        </div>
        {running && <Loader2 className="w-3.5 h-3.5 text-arena-warning animate-spin" />}
      </div>
      <div className="px-4 sm:px-6 py-4 sm:py-5 prose prose-invert prose-sm max-w-none text-arena-text/90 leading-[1.78] [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_h2]:text-[13px] [&_h2]:font-semibold [&_h2]:text-arena-warning [&_h2]:mt-3 [&_h2]:mb-1 [&_strong]:text-arena-text [&_pre]:!overflow-x-auto">
        <ReactMarkdown remarkPlugins={remarkPlugins}>{displayContent || "…"}</ReactMarkdown>
      </div>
    </div>
  );
}
