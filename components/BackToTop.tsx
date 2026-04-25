"use client";

// ─────────────────────────────────────────────────────────────
// Back to Top — Floating notch-style pill
// ─────────────────────────────────────────────────────────────

import { useArenaStore } from "@/lib/store";
import { useEffect, useState, useCallback } from "react";
import { ChevronUp } from "lucide-react";

export default function BackToTop() {
  const finalScore = useArenaStore((s) => s.finalScore);
  const rounds = useArenaStore((s) => s.rounds);
  const [visible, setVisible] = useState(false);

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

  if (rounds.length === 0 || !visible) return null;

  const isComplete = finalScore !== null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <button
        onClick={scrollToTop}
        className={`
          group relative flex items-center gap-2.5 px-5 py-2.5
          rounded-full backdrop-blur-2xl border
          transition-all duration-300
          hover:scale-[1.04] active:scale-95
          ${
            isComplete
              ? "bg-[#02070F]/85 border-arena-accent/45 shadow-glow-orange"
              : "bg-[#02070F]/80 border-white/[0.08] shadow-glass"
          }
        `}
      >
        {/* Notch camera dot */}
        <div
          className={`w-2 h-2 rounded-full transition-colors ${
            isComplete ? "bg-arena-accent shadow-[0_0_8px_rgba(255,98,0,0.7)]" : "bg-arena-muted/40"
          }`}
        />

        <div className="w-px h-3.5 bg-white/[0.1]" />

        <ChevronUp
          className={`w-3.5 h-3.5 transition-all group-hover:-translate-y-0.5 ${
            isComplete ? "text-arena-glow" : "text-arena-muted"
          }`}
        />
        <span
          className={`text-[11.5px] font-medium tracking-wide ${
            isComplete ? "text-arena-text" : "text-arena-muted"
          }`}
        >
          Back to top
        </span>

        {isComplete && (
          <>
            <div className="w-px h-3.5 bg-white/[0.1]" />
            <span className="text-[10.5px] font-mono font-bold bg-gradient-to-r from-[#ffd0a8] to-[#ff6200] bg-clip-text text-transparent">
              {finalScore}%
            </span>
          </>
        )}

        {isComplete && (
          <div className="absolute inset-0 rounded-full bg-arena-accent/10 -z-10 blur-md" />
        )}
      </button>
    </div>
  );
}
