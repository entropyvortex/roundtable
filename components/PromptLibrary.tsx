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
    <div className="mt-3 space-y-2">
      <p className="text-[10px] text-arena-muted uppercase tracking-[0.15em] flex items-center gap-1.5">
        <Sparkles className="w-2.5 h-2.5" />
        Try a preset
      </p>
      <div className="flex flex-wrap gap-1.5">
        {PROMPT_LIBRARY.map((preset) => (
          <button
            key={preset.id}
            onClick={() => setPrompt(preset.prompt)}
            className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-arena-surface border border-arena-border/60 hover:border-arena-accent/60 hover:bg-arena-accent/5 text-[11px] text-arena-text/80 hover:text-arena-text transition-all"
            title={preset.prompt}
          >
            <span
              className="text-[8px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded"
              style={{ backgroundColor: "#1e2937", color: "#94a3b8" }}
            >
              {preset.category}
            </span>
            <span className="truncate max-w-[210px]">{preset.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
