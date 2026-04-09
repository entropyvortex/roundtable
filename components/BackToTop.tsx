"use client";

// ─────────────────────────────────────────────────────────────
// Back to Top — Floating notch-style pill (MacBook camera style)
// ─────────────────────────────────────────────────────────────
// Appears at bottom-center when consensus is complete or when
// user has scrolled down significantly. Styled like the MacBook
// display notch with the camera dot.

import { useArenaStore } from "@/lib/store";
import { useEffect, useState, useCallback } from "react";
import { ChevronUp } from "lucide-react";

export default function BackToTop() {
  const finalScore = useArenaStore((s) => s.finalScore);
  const rounds = useArenaStore((s) => s.rounds);
  const [visible, setVisible] = useState(false);

  // Show when scrolled down past threshold
  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 600);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Only show if there are results and user has scrolled
  if (rounds.length === 0 || !visible) return null;

  const isComplete = finalScore !== null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <button
        onClick={scrollToTop}
        className={`
          group relative flex items-center gap-2 px-5 py-2.5
          rounded-full border backdrop-blur-lg
          shadow-xl transition-all duration-300
          hover:scale-105 active:scale-95
          ${
            isComplete
              ? "bg-arena-surface/95 border-arena-accent/30 shadow-arena-accent/10"
              : "bg-arena-surface/90 border-arena-border shadow-black/20"
          }
        `}
      >
        {/* Notch camera dot */}
        <div
          className={`w-2 h-2 rounded-full transition-colors ${
            isComplete
              ? "bg-arena-success shadow-[0_0_6px_rgba(16,185,129,0.5)]"
              : "bg-arena-muted/40"
          }`}
        />

        {/* Divider line */}
        <div className="w-px h-3.5 bg-arena-border" />

        {/* Arrow + label */}
        <ChevronUp
          className={`w-3.5 h-3.5 transition-all group-hover:-translate-y-0.5 ${
            isComplete ? "text-arena-accent" : "text-arena-muted"
          }`}
        />
        <span
          className={`text-xs font-medium tracking-wide ${
            isComplete ? "text-arena-text" : "text-arena-muted"
          }`}
        >
          Back to top
        </span>

        {/* Consensus score badge (when complete) */}
        {isComplete && (
          <>
            <div className="w-px h-3.5 bg-arena-border" />
            <span className="text-[10px] font-mono font-bold text-arena-accent">{finalScore}%</span>
          </>
        )}

        {/* Subtle glow behind when complete */}
        {isComplete && (
          <div className="absolute inset-0 rounded-full bg-arena-accent/5 -z-10 blur-sm" />
        )}
      </button>
    </div>
  );
}
