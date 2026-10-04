"use client";

// ─────────────────────────────────────────────────────────────
// Judge Card — non-voting synthesizer verdict
// ─────────────────────────────────────────────────────────────
// Completed: Majority / Minority / Unresolved from the parsed judge
// result (falls back to the full text when parsing found nothing).
// Running: streams `judgeStream` live as plain text; markdown is parsed
// once the verdict is complete, not on every frame.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useArenaStore } from "@/lib/store";
import { stripJudgeConfidence } from "@/lib/format";
import { cn } from "@/components/ui";
import Markdown from "./Markdown";
import { BriefSection } from "./run/BriefSection";

const SECTIONS = [
  { key: "majorityPosition", title: "Majority", stripe: "border-success" },
  { key: "minorityPositions", title: "Minority", stripe: "border-info" },
  { key: "unresolvedDisputes", title: "Unresolved", stripe: "border-warning" },
] as const;

export default function JudgeCard() {
  const judge = useArenaStore((s) => s.judge);
  const stream = useArenaStore((s) => s.judgeStream);
  const running = useArenaStore((s) => s.judgeRunning);
  const [showFull, setShowFull] = useState(false);

  if (!judge && !running) return null;

  const meta = judge
    ? `${judge.providerName} · ${judge.modelId} · non-voting`
    : "Non-voting summariser";
  const structured = !running && !!judge && SECTIONS.some((s) => judge[s.key].trim().length > 0);
  const fullText = stripJudgeConfidence(running ? stream : (judge?.content ?? ""));

  return (
    <BriefSection
      title="Judge synthesis"
      meta={meta}
      aside={
        running ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            Writing…
          </span>
        ) : undefined
      }
    >
      {structured && judge ? (
        <>
          <div className="space-y-4">
            {SECTIONS.map(({ key, title, stripe }) => {
              const text = stripJudgeConfidence(judge[key]);
              return (
                <div key={key} className={cn("border-l-2 pl-3", stripe)}>
                  <h3 className="text-[13px] font-semibold text-fg-muted">{title}</h3>
                  {text ? (
                    <div className="prose-rt mt-1">
                      <Markdown>{text}</Markdown>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-fg-muted">None noted.</p>
                  )}
                </div>
              );
            })}
          </div>
          {fullText && (
            <div>
              <button
                type="button"
                aria-expanded={showFull}
                onClick={() => setShowFull((v) => !v)}
                className="text-[13px] font-medium text-accent hover:underline"
              >
                {showFull ? "Hide full synthesis" : "Show full synthesis"}
              </button>
              {showFull && (
                <div className="prose-rt mt-2 border-t border-border pt-3">
                  <Markdown>{fullText}</Markdown>
                </div>
              )}
            </div>
          )}
        </>
      ) : running ? (
        <div
          aria-busy="true"
          className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-fg"
        >
          {fullText || "…"}
        </div>
      ) : (
        <div className="prose-rt">
          <Markdown>{fullText || "…"}</Markdown>
        </div>
      )}
    </BriefSection>
  );
}
