"use client";

// ─────────────────────────────────────────────────────────────
// Prompt Library — Preset chips under the prompt textarea
// ─────────────────────────────────────────────────────────────

import { PROMPT_LIBRARY } from "@/lib/prompt-library";
import { useArenaStore } from "@/lib/store";
import { Sparkles } from "lucide-react";

export default function PromptLibrary() {
  const setPrompt = useArenaStore((s) => s.setPrompt);
  const isRunning = useArenaStore((s) => s.isRunning);
  const prompt = useArenaStore((s) => s.prompt);

  if (isRunning) return null;
  if (prompt.trim().length > 0) return null;

  return (
    <div className="space-y-2.5">
      <p className="section-label">
        <Sparkles className="w-2.5 h-2.5" />
        Try a preset
      </p>
      <div className="flex flex-wrap gap-2">
        {PROMPT_LIBRARY.map((preset) => (
          <button
            key={preset.id}
            onClick={() => setPrompt(preset.prompt)}
            className="group flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/35 border border-white/[0.06] hover:border-arena-accent/45 hover:bg-arena-accent/8 hover:shadow-glow-orange-sm text-[11.5px] text-arena-text/85 hover:text-arena-glow transition-colors"
            title={preset.prompt}
          >
            <span className="text-[8.5px] font-semibold uppercase tracking-[0.15em] px-1.5 py-0.5 rounded bg-arena-blue/15 text-arena-blue border border-arena-blue/25 group-hover:bg-arena-accent/15 group-hover:text-arena-glow group-hover:border-arena-accent/30 transition-colors">
              {preset.category}
            </span>
            <span className="truncate max-w-[210px]">{preset.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
