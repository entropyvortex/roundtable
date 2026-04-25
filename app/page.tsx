"use client";

// ─────────────────────────────────────────────────────────────
// RoundTable — Main Page (Glassmorphic Enterprise Dashboard)
// ─────────────────────────────────────────────────────────────

import { useEffect, useCallback, useState } from "react";
import { useArenaStore } from "@/lib/store";
import AISelector from "@/components/AISelector";
import ResultPanel from "@/components/ResultPanel";
import MessageFlowDiagram from "@/components/MessageFlowDiagram";
import BackToTop from "@/components/BackToTop";
import ConfidenceTrajectory from "@/components/ConfidenceTrajectory";
import DisagreementPanel from "@/components/DisagreementPanel";
import CostMeter from "@/components/CostMeter";
import ConfigPanel from "@/components/ConfigPanel";
import PromptLibrary from "@/components/PromptLibrary";
import { ConsensusNodesArt, ConfigArt } from "@/components/HeroArt";
import { toast } from "sonner";
import {
  Play,
  RotateCcw,
  Settings2,
  Minus,
  Plus,
  Square,
  Users,
  ArrowRight,
  Sparkles,
  Eye,
  Layers,
  Cpu,
  Menu,
  X,
} from "lucide-react";
import type { ConsensusEvent, ConsensusRequest } from "@/lib/types";
import { decodeSnapshotFromHash } from "@/lib/session";

export default function HomePage() {
  const participants = useArenaStore((s) => s.participants);
  const prompt = useArenaStore((s) => s.prompt);
  const options = useArenaStore((s) => s.options);
  const isRunning = useArenaStore((s) => s.isRunning);
  const currentRound = useArenaStore((s) => s.currentRound);
  const progress = useArenaStore((s) => s.progress);
  const finalScore = useArenaStore((s) => s.finalScore);
  const sharedView = useArenaStore((s) => s.sharedView);

  const setAvailableModels = useArenaStore((s) => s.setAvailableModels);
  const setModelsLoading = useArenaStore((s) => s.setModelsLoading);
  const setRoundCount = useArenaStore((s) => s.setRoundCount);
  const setPrompt = useArenaStore((s) => s.setPrompt);
  const cancelConsensus = useArenaStore((s) => s.cancelConsensus);
  const reset = useArenaStore((s) => s.reset);
  const loadSnapshot = useArenaStore((s) => s.loadSnapshot);

  const [showOnboarding, setShowOnboarding] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Lock body scroll when the mobile drawer is open
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    if (drawerOpen) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drawerOpen]);

  useEffect(() => {
    if (!showOnboarding) return;
    const timer = setTimeout(() => setShowOnboarding(false), 3500);
    return () => clearTimeout(timer);
  }, [showOnboarding]);

  useEffect(() => {
    if (participants.length > 0) setShowOnboarding(false);
  }, [participants.length]);

  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then((data) => {
        setAvailableModels(data.models || []);
        setModelsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch providers:", err);
        setModelsLoading(false);
        toast.error("Failed to load AI providers");
      });
  }, [setAvailableModels, setModelsLoading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hash) return;
    decodeSnapshotFromHash(window.location.hash).then((snap) => {
      if (!snap) return;
      loadSnapshot(snap);
      toast.info("Viewing shared session");
      setShowOnboarding(false);
    });
  }, [loadSnapshot]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && useArenaStore.getState().isRunning) {
        useArenaStore.getState().cancelConsensus();
        toast.info("Consensus cancelled");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleRunConsensus = useCallback(async () => {
    const state = useArenaStore.getState();
    if (!state.prompt.trim()) {
      toast.error("Enter a prompt first");
      return;
    }
    if (state.participants.length < 2) {
      toast.error("Add at least 2 AI participants");
      return;
    }
    if (state.options.judgeEnabled && !state.options.judgeModelId) {
      toast.error("Choose a judge model or disable judge synthesis");
      return;
    }

    if (typeof window !== "undefined" && window.location.hash) {
      history.replaceState(null, "", window.location.pathname);
    }

    const controller = state.startConsensus();
    setDrawerOpen(false);
    toast.info("Consensus started — Esc to cancel");

    const body: ConsensusRequest = {
      prompt: state.prompt.trim(),
      participants: state.participants,
      options: state.options,
    };

    try {
      const response = await fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            processEvent(JSON.parse(line.slice(6)));
          } catch {
            /* skip */
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Consensus failed: ${msg}`);
      useArenaStore.getState().completeConsensus(0, `Error: ${msg}`, 0);
    }
  }, []);

  const canRun = !isRunning && !sharedView && prompt.trim().length > 0 && participants.length >= 2;

  const handleCancel = useCallback(() => {
    cancelConsensus();
    toast.info("Consensus cancelled");
  }, [cancelConsensus]);

  const handleLeaveSharedView = useCallback(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      history.replaceState(null, "", window.location.pathname);
    }
    reset();
  }, [reset]);

  // ── Sidebar content (used both inline at lg+ and inside the mobile drawer) ──
  const sidebarContent = (
    <div className="space-y-5">
      <div className="glass overflow-hidden">
        <ConfigArt className="h-[78px]" />
        <div className="p-4 sm:p-5 space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-arena-accent/15 border border-arena-accent/30 flex items-center justify-center shrink-0">
              <Settings2 className="w-3.5 h-3.5 text-arena-accent" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-arena-text tracking-tight">
                Configuration
              </p>
              <p className="text-[10px] text-arena-muted">Provider, model & persona</p>
            </div>
          </div>
          <AISelector />
        </div>
      </div>

      <div className="glass p-4 sm:p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <p className="section-label">
            <Layers className="w-2.5 h-2.5" /> Rounds
          </p>
          <span className="text-[9.5px] text-arena-muted/70">
            {options.engine === "blind-jury" ? "Locked at 1" : "1–10"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setRoundCount(options.rounds - 1)}
            disabled={isRunning || options.rounds <= 1 || options.engine === "blind-jury"}
            className="btn-ghost w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <div className="flex-1 text-center">
            <span className="text-3xl font-bold text-arena-text font-mono tabular-nums tracking-tight">
              {options.engine === "blind-jury" ? 1 : options.rounds}
            </span>
            <p className="text-[9px] text-arena-muted uppercase tracking-wider mt-0.5">
              debate rounds
            </p>
          </div>
          <button
            onClick={() => setRoundCount(options.rounds + 1)}
            disabled={isRunning || options.rounds >= 10 || options.engine === "blind-jury"}
            className="btn-ghost w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="glass p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-3 h-3 text-arena-accent" />
          <p className="section-label">Protocol & Engine</p>
        </div>
        <ConfigPanel />
      </div>

      {/* Sub-xl panels: visible whenever the right rail is hidden */}
      <div className="space-y-5 xl:hidden">
        <CostMeter />
        <ConfidenceTrajectory />
        <DisagreementPanel />
      </div>

      {isRunning && (
        <div className="glass p-4 space-y-3 border border-arena-accent/40 shadow-glow-orange-sm">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-arena-glow flex items-center gap-1.5">
              <span className="relative flex w-2 h-2">
                <span className="animate-ping absolute inline-flex w-full h-full rounded-full bg-arena-accent opacity-75" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-arena-accent" />
              </span>
              Round {currentRound} of {options.rounds}
            </p>
            <button
              onClick={handleCancel}
              className="p-1.5 rounded-md hover:bg-arena-danger/15 text-arena-muted hover:text-arena-danger transition-colors"
              title="Cancel (Esc)"
            >
              <Square className="w-3 h-3 fill-current" />
            </button>
          </div>
          <div className="h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/[0.04]">
            <div
              className="h-full progress-orange rounded-full transition-all duration-500"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="text-[9.5px] text-arena-muted">
            Press{" "}
            <kbd className="px-1.5 py-0.5 bg-black/45 rounded text-[8.5px] font-mono border border-white/10">
              Esc
            </kbd>{" "}
            to cancel
          </p>
        </div>
      )}

      {finalScore !== null && (
        <div className="glass p-4 border border-arena-success/40">
          <p className="text-[10px] text-arena-success font-semibold uppercase tracking-wider">
            Final Consensus
          </p>
          <p className="text-3xl font-bold text-arena-success font-mono tabular-nums mt-1">
            {finalScore}%
          </p>
          <button
            onClick={reset}
            className="mt-3 flex items-center gap-1.5 text-[11px] text-arena-muted hover:text-arena-glow transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Reset session
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="cosmic-shell min-h-screen text-arena-text relative">
      {/* Shared-view banner */}
      {sharedView && (
        <div className="sticky top-0 z-40 flex items-center justify-between gap-3 px-4 sm:px-6 py-2 bg-arena-accent/10 border-b border-arena-accent/25 backdrop-blur-md">
          <div className="flex items-center gap-2 text-[11px] text-arena-glow min-w-0">
            <Eye className="w-3 h-3 shrink-0" />
            <span className="truncate">Viewing a shared session.</span>
          </div>
          <button
            onClick={handleLeaveSharedView}
            className="text-[11px] text-arena-glow hover:text-arena-accent transition-colors shrink-0"
          >
            Exit
          </button>
        </div>
      )}

      {/* Onboarding */}
      {showOnboarding && participants.length === 0 && !sharedView && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-md cursor-pointer p-4"
          onClick={() => setShowOnboarding(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
        >
          <div className="glass-strong px-7 sm:px-12 py-8 sm:py-10 max-w-md text-center space-y-6 animate-in">
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-2xl bg-arena-accent/20 blur-xl" />
              <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#ff8a3a] to-[#e25400] shadow-glow-orange">
                <Users className="w-7 h-7 text-white" strokeWidth={2} />
              </div>
            </div>
            <div>
              <h2
                id="onboarding-title"
                className="text-[19px] sm:text-xl font-semibold text-arena-text tracking-tight"
              >
                Convene the RoundTable
              </h2>
              <p className="text-[13px] text-arena-muted mt-2 leading-relaxed">
                Open the panel, pick a model and persona, then enter your prompt to start a multi-AI
                consensus debate.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2.5 text-[11px] text-arena-glow font-medium flex-wrap">
              <span>Panel</span>
              <ArrowRight className="w-3 h-3" />
              <span>Model</span>
              <ArrowRight className="w-3 h-3" />
              <span>Persona</span>
              <ArrowRight className="w-3 h-3" />
              <Sparkles className="w-3 h-3" />
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 px-4 sm:px-6 py-3 sm:py-4 backdrop-blur-2xl bg-[#02070F]/55 border-b border-white/[0.04]">
        <div className="flex items-center justify-between gap-3 max-w-[1800px] mx-auto">
          <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
            {/* Mobile menu button — visible below lg */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden p-2 -ml-1 rounded-lg text-arena-text hover:bg-white/[0.06] transition-colors"
              aria-label="Open configuration panel"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Logo mark */}
            <div className="relative w-9 h-9 sm:w-10 sm:h-10 shrink-0">
              <div className="absolute inset-0 rounded-xl bg-arena-accent/35 blur-lg" />
              <div className="relative w-full h-full rounded-xl bg-gradient-to-br from-[#ff8a3a] via-[#ff6200] to-[#a83b00] flex items-center justify-center shadow-glow-orange-sm border border-white/15">
                <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                  <circle cx="11" cy="11" r="9" stroke="white" strokeWidth="1.4" opacity="0.85" />
                  <circle cx="11" cy="11" r="5" stroke="white" strokeWidth="1.4" opacity="0.95" />
                  <circle cx="11" cy="11" r="2" fill="white" />
                </svg>
              </div>
            </div>
            <div className="min-w-0">
              <h1 className="text-[15px] sm:text-[17px] font-semibold text-arena-text tracking-tight leading-none">
                RoundTable
              </h1>
              <p className="hidden sm:block text-[10px] text-arena-muted/90 uppercase tracking-[0.22em] mt-1.5 font-medium truncate">
                Multi-AI Consensus Playground
              </p>
              <p className="sm:hidden text-[9px] text-arena-muted/90 uppercase tracking-[0.16em] mt-1 font-medium truncate">
                Consensus Playground
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="hidden md:flex items-center gap-2 px-3.5 py-2 glass-pill text-[11px] text-arena-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-arena-success animate-pulse" />
              <span className="font-medium">Live</span>
              <span className="text-arena-muted/40">•</span>
              <span className="tabular-nums">{participants.length} participants</span>
            </div>
            <div className="md:hidden flex items-center gap-1.5 px-2.5 py-1.5 glass-pill text-[10px] text-arena-glow">
              <span className="w-1.5 h-1.5 rounded-full bg-arena-success animate-pulse" />
              <span className="tabular-nums font-medium">{participants.length}</span>
            </div>
            <a
              href="https://github.com/marceloceccon/askgrokmcp"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-arena-muted hover:text-arena-glow transition-colors hidden lg:block"
            >
              Protocol inspired by askgrokmcp →
            </a>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div
        className="flex max-w-[1800px] mx-auto"
        style={{ minHeight: "calc(100vh - var(--rt-header-h))" }}
      >
        {/* ── Left Sidebar (inline at lg+) ─────────────────── */}
        <aside
          className="hidden lg:block w-[340px] shrink-0 px-5 py-6 overflow-y-auto sticky self-start"
          style={{
            top: "var(--rt-header-h)",
            maxHeight: "calc(100vh - var(--rt-header-h))",
          }}
        >
          {sidebarContent}
        </aside>

        {/* ── Mobile drawer (< lg) ─────────────────────────── */}
        {drawerOpen && (
          <div
            className="lg:hidden fixed inset-0 z-40 flex"
            role="dialog"
            aria-modal="true"
            aria-label="Configuration panel"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in"
              onClick={() => setDrawerOpen(false)}
              style={{ animationDuration: "200ms" }}
              aria-hidden
            />
            <aside
              className="relative w-[88%] max-w-[360px] h-full overflow-y-auto px-4 py-5 animate-in"
              style={{
                background:
                  "linear-gradient(135deg, rgba(6, 16, 38, 0.96), rgba(2, 7, 15, 0.98))",
                borderRight: "1px solid rgba(77, 122, 199, 0.22)",
                boxShadow: "12px 0 40px rgba(0, 0, 0, 0.6)",
                animationDuration: "260ms",
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="section-label">
                  <Settings2 className="w-2.5 h-2.5" /> Workbench
                </p>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-arena-muted hover:text-arena-text hover:bg-white/[0.06] transition-colors"
                  aria-label="Close panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {sidebarContent}
            </aside>
          </div>
        )}

        {/* ── Center Main ──────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0 px-4 sm:px-5 lg:px-6 py-5 sm:py-6 xl:pr-[360px]">
          {/* Hero command card */}
          <div className="glass-strong overflow-hidden mb-5 sm:mb-6 animate-in">
            <ConsensusNodesArt className="h-[120px] sm:h-[160px] md:h-[180px]" />
            <div className="p-4 sm:p-6 md:p-7 space-y-4 sm:space-y-5">
              <div>
                <p className="text-[10px] text-arena-glow uppercase tracking-[0.2em] font-semibold mb-2">
                  Consensus Console
                </p>
                <h2 className="text-[18px] sm:text-[20px] md:text-[22px] font-semibold text-arena-text tracking-tight leading-tight">
                  Pose a question to the table.
                </h2>
                <p className="text-[12.5px] sm:text-[13px] text-arena-muted mt-1.5 leading-relaxed max-w-2xl">
                  Multiple AI minds debate, refine, and converge — surfacing both consensus and
                  productive disagreement.
                </p>
              </div>
              <div className="glass-input p-1">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={isRunning || sharedView}
                  placeholder="Enter a topic, claim, or question for multi-AI consensus analysis…"
                  rows={3}
                  className="w-full bg-transparent px-4 sm:px-5 py-3.5 sm:py-4 text-[13.5px] sm:text-[14px] leading-relaxed text-arena-text placeholder:text-arena-muted/45 focus:outline-none resize-none disabled:opacity-40"
                />
              </div>
              <PromptLibrary />
              <div className="flex items-center justify-between gap-3 sm:gap-4 flex-wrap">
                <div className="flex items-center gap-2.5 sm:gap-3 text-[11px] sm:text-[11.5px] text-arena-muted">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-arena-glow" />
                    <span className="tabular-nums text-arena-text font-medium">
                      {participants.length}
                    </span>
                    <span className="hidden sm:inline">
                      participant{participants.length !== 1 ? "s" : ""}
                    </span>
                  </span>
                  <span className="text-arena-border-strong">·</span>
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3 h-3 text-arena-glow" />
                    <span className="text-arena-text font-medium">
                      {options.engine === "blind-jury"
                        ? "Blind Jury"
                        : `${options.rounds} round${options.rounds !== 1 ? "s" : ""}`}
                    </span>
                  </span>
                </div>
                {isRunning ? (
                  <button
                    onClick={handleCancel}
                    className="flex items-center gap-2 bg-arena-danger/15 border border-arena-danger/40 text-arena-danger rounded-xl px-4 sm:px-5 py-2.5 text-[12.5px] sm:text-[13px] font-semibold hover:bg-arena-danger/25 active:scale-[0.98] transition-colors"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    Cancel
                  </button>
                ) : (
                  <button
                    onClick={handleRunConsensus}
                    disabled={!canRun}
                    className="btn-orange flex items-center gap-2 px-5 sm:px-6 py-2.5 text-[13px] sm:text-[13.5px] shine"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Run Consensus
                  </button>
                )}
              </div>
            </div>
          </div>

          <ResultPanel />
        </main>
      </div>

      <MessageFlowDiagram />
      <BackToTop />
    </div>
  );
}

// ── SSE Event Processor ────────────────────────────────────
// Tokens can arrive much faster than the screen can paint (often
// 100+/sec). We coalesce them per-participant in a buffer and
// flush once per animation frame so React/paint work is capped
// at ~60Hz instead of running on every chunk.

type TokenBuffer = Map<string, { round: number; text: string }>;
const tokenBuffer: TokenBuffer = new Map();
let judgeTokenBuffer = "";
let rafScheduled = false;

function scheduleFlush() {
  if (rafScheduled) return;
  rafScheduled = true;
  requestAnimationFrame(flushTokens);
}

function flushTokens() {
  rafScheduled = false;
  const s = useArenaStore.getState();
  if (!s.isRunning) {
    tokenBuffer.clear();
    judgeTokenBuffer = "";
    return;
  }
  for (const [participantId, { round, text }] of tokenBuffer) {
    if (text) s.appendToken(participantId, round, text);
  }
  tokenBuffer.clear();
  if (judgeTokenBuffer) {
    s.appendJudgeToken(judgeTokenBuffer);
    judgeTokenBuffer = "";
  }
}

function processEvent(event: ConsensusEvent) {
  const s = useArenaStore.getState();
  if (!s.isRunning) return;

  switch (event.type) {
    case "round-start":
      // Drain anything pending before a round transition to avoid
      // late tokens from the previous round arriving in the new one.
      flushTokens();
      s.startRound(event.round, event.roundType, event.label);
      break;
    case "participant-start":
      s.appendToken(event.participantId, event.round, "");
      break;
    case "token": {
      const existing = tokenBuffer.get(event.participantId);
      if (existing) existing.text += event.token;
      else tokenBuffer.set(event.participantId, { round: event.round, text: event.token });
      scheduleFlush();
      break;
    }
    case "participant-end":
      // Flush any buffered tokens for this participant before recording
      // the final result so the UI doesn't drop trailing characters.
      flushTokens();
      s.completeParticipantRound(
        event.participantId,
        event.round,
        event.confidence,
        event.fullContent,
        event.usage,
        event.durationMs,
        event.error,
      );
      if (event.error) {
        const p = s.participants.find((x) => x.id === event.participantId);
        const label = p
          ? `${p.modelInfo.providerName} / ${p.modelInfo.modelId}`
          : event.participantId;
        toast.error(`${label}: ${event.error}`);
      }
      break;
    case "round-end":
      flushTokens();
      s.endRound(event.round, event.consensusScore);
      break;
    case "disagreements":
      s.addDisagreements(event.round, event.disagreements);
      break;
    case "early-stop":
      s.setEarlyStopped({ round: event.round, delta: event.delta, reason: event.reason });
      break;
    case "judge-start":
      flushTokens();
      s.startJudge(event.modelId, event.providerName);
      break;
    case "judge-token":
      judgeTokenBuffer += event.token;
      scheduleFlush();
      break;
    case "judge-end":
      flushTokens();
      s.completeJudge(event.result);
      break;
    case "consensus-complete":
      flushTokens();
      s.completeConsensus(event.finalScore, event.summary, event.roundsCompleted);
      toast.success(`Consensus complete! Score: ${event.finalScore}%`);
      break;
    case "error":
      tokenBuffer.clear();
      judgeTokenBuffer = "";
      toast.error(event.message);
      s.completeConsensus(0, event.message, 0);
      break;
  }
}
