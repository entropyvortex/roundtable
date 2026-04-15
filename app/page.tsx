"use client";

// ─────────────────────────────────────────────────────────────
// RoundTable — Main Page (Clean Dashboard)
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
import { toast } from "sonner";
import {
  Play,
  RotateCcw,
  Settings2,
  Minus,
  Plus,
  Hexagon,
  Square,
  Users,
  ArrowRight,
  Sparkles,
  Eye,
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

  // Load a shared snapshot from the URL hash, if present
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

    // Clear any URL hash from a previously loaded shared view
    if (typeof window !== "undefined" && window.location.hash) {
      history.replaceState(null, "", window.location.pathname);
    }

    const controller = state.startConsensus();
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

  return (
    <div className="min-h-screen bg-arena-bg text-arena-text">
      {/* Shared-view banner */}
      {sharedView && (
        <div className="sticky top-0 z-40 flex items-center justify-between gap-3 px-6 py-2 bg-arena-accent/10 border-b border-arena-accent/20">
          <div className="flex items-center gap-2 text-[11px] text-arena-accent">
            <Eye className="w-3 h-3" />
            <span>Viewing a shared session. Reset to start your own run.</span>
          </div>
          <button
            onClick={handleLeaveSharedView}
            className="text-[11px] text-arena-accent hover:underline"
          >
            Exit shared view
          </button>
        </div>
      )}

      {/* Onboarding */}
      {showOnboarding && participants.length === 0 && !sharedView && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm cursor-pointer"
          onClick={() => setShowOnboarding(false)}
        >
          <div className="bg-arena-surface border border-arena-border rounded-2xl shadow-2xl shadow-black/50 px-10 py-8 max-w-md text-center space-y-5 animate-in">
            <div className="w-12 h-12 rounded-xl bg-arena-accent/15 flex items-center justify-center mx-auto">
              <Users className="w-6 h-6 text-arena-accent" />
            </div>
            <h2 className="text-lg font-semibold text-arena-text">Add Participants to Begin</h2>
            <p className="text-sm text-arena-muted leading-relaxed">
              Select AI providers and models from the sidebar, assign personas, then enter a prompt.
            </p>
            <div className="flex items-center justify-center gap-2.5 text-xs text-arena-accent">
              <span>Sidebar</span>
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
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-3.5 border-b border-arena-border/60 bg-arena-bg/90 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Hexagon className="w-6 h-6 text-arena-accent" strokeWidth={1.5} />
          <div>
            <h1 className="text-[15px] font-semibold text-arena-text tracking-tight leading-tight">
              RoundTable
            </h1>
            <p className="text-[9px] text-arena-muted/70 uppercase tracking-[0.2em] leading-tight">
              Multi-AI Consensus Playground
            </p>
          </div>
        </div>
        <a
          href="https://github.com/marceloceccon/askgrokmcp"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-arena-muted/60 hover:text-arena-accent transition-colors"
        >
          Protocol inspired by askgrokmcp
        </a>
      </header>

      {/* Main Layout */}
      <div className="flex min-h-[calc(100vh-53px)]">
        {/* Sidebar */}
        <aside className="w-80 shrink-0 border-r border-arena-border/50 bg-arena-surface/50 overflow-y-auto">
          <div className="p-5 space-y-7">
            <section>
              <h2 className="text-[10px] font-semibold text-arena-muted uppercase tracking-[0.15em] flex items-center gap-1.5 mb-4">
                <Settings2 className="w-3 h-3" /> Configuration
              </h2>
              <AISelector />
            </section>

            <section>
              <h2 className="text-[10px] font-semibold text-arena-muted uppercase tracking-[0.15em] mb-3">
                Rounds
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setRoundCount(options.rounds - 1)}
                  disabled={isRunning || options.rounds <= 1 || options.engine === "blind-jury"}
                  className="p-1.5 rounded-lg border border-arena-border text-arena-muted hover:text-arena-text hover:border-arena-accent/50 transition-colors disabled:opacity-25"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-xl font-semibold text-arena-text font-mono w-6 text-center tabular-nums">
                  {options.engine === "blind-jury" ? 1 : options.rounds}
                </span>
                <button
                  onClick={() => setRoundCount(options.rounds + 1)}
                  disabled={isRunning || options.rounds >= 10 || options.engine === "blind-jury"}
                  className="p-1.5 rounded-lg border border-arena-border text-arena-muted hover:text-arena-text hover:border-arena-accent/50 transition-colors disabled:opacity-25"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </section>

            <section>
              <h2 className="text-[10px] font-semibold text-arena-muted uppercase tracking-[0.15em] mb-3">
                Protocol
              </h2>
              <ConfigPanel />
            </section>

            {/* On xl+ these panels move into the floating Message Flow
                container on the right. Keep them in the sidebar below
                that breakpoint so smaller screens still see them. */}
            <section className="space-y-3 xl:hidden">
              <CostMeter />
              <ConfidenceTrajectory />
              <DisagreementPanel />
            </section>

            {isRunning && (
              <section className="p-4 rounded-xl bg-arena-accent/10 border border-arena-accent/20">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-[11px] text-arena-accent font-semibold">
                    Round {currentRound} of {options.rounds}
                  </p>
                  <button
                    onClick={handleCancel}
                    className="p-1 rounded hover:bg-arena-danger/15 text-arena-muted hover:text-arena-danger transition-colors"
                    title="Cancel (Esc)"
                  >
                    <Square className="w-3 h-3 fill-current" />
                  </button>
                </div>
                <div className="h-1.5 bg-arena-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-arena-accent rounded-full transition-all duration-500"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
                <p className="text-[9px] text-arena-muted mt-2">
                  <kbd className="px-1 py-0.5 bg-arena-bg rounded text-[8px] font-mono border border-arena-border">
                    Esc
                  </kbd>{" "}
                  to cancel
                </p>
              </section>
            )}

            {finalScore !== null && (
              <section className="p-4 rounded-xl bg-arena-success/10 border border-arena-success/20">
                <p className="text-[11px] text-arena-success font-semibold">
                  Final Consensus: {finalScore}%
                </p>
                <button
                  onClick={reset}
                  className="mt-2 flex items-center gap-1.5 text-[11px] text-arena-muted hover:text-arena-text transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </section>
            )}
          </div>
        </aside>

        {/* Center */}
        <main className="flex-1 flex flex-col min-w-0">
          <div className="px-8 pt-8 pb-5">
            <div className="max-w-3xl mx-auto">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isRunning || sharedView}
                placeholder="Enter a topic, claim, or question for multi-AI consensus analysis..."
                rows={3}
                className="w-full bg-arena-surface border border-arena-border rounded-xl px-5 py-4 text-[14px] leading-relaxed text-arena-text placeholder:text-arena-muted/50 focus:outline-none focus:border-arena-accent/60 focus:ring-1 focus:ring-arena-accent/20 resize-none disabled:opacity-40 transition-all"
              />
              <PromptLibrary />
              <div className="flex items-center justify-between mt-4">
                <p className="text-[11px] text-arena-muted tabular-nums">
                  {participants.length} participant{participants.length !== 1 ? "s" : ""} &middot;{" "}
                  {options.engine === "blind-jury"
                    ? "Blind Jury"
                    : `${options.rounds} round${options.rounds !== 1 ? "s" : ""}`}
                </p>
                {isRunning ? (
                  <button
                    onClick={handleCancel}
                    className="flex items-center gap-2 bg-arena-danger/10 border border-arena-danger/25 text-arena-danger rounded-lg px-4 py-2 text-[13px] font-medium hover:bg-arena-danger/20 active:scale-[0.98] transition-all"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    Cancel
                  </button>
                ) : (
                  <button
                    onClick={handleRunConsensus}
                    disabled={!canRun}
                    className="flex items-center gap-2 bg-arena-accent text-white rounded-lg px-5 py-2 text-[13px] font-medium hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm shadow-arena-accent/20 transition-all"
                  >
                    <Play className="w-4 h-4" />
                    Run Consensus
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 xl:pr-[330px]">
            <ResultPanel />
          </div>
        </main>
      </div>

      <MessageFlowDiagram />
      <BackToTop />
    </div>
  );
}

// ── SSE Event Processor ────────────────────────────────────

function processEvent(event: ConsensusEvent) {
  const s = useArenaStore.getState();
  if (!s.isRunning) return;

  switch (event.type) {
    case "round-start":
      s.startRound(event.round, event.roundType, event.label);
      break;
    case "participant-start":
      s.appendToken(event.participantId, event.round, "");
      break;
    case "token":
      s.appendToken(event.participantId, event.round, event.token);
      break;
    case "participant-end":
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
      s.endRound(event.round, event.consensusScore);
      break;
    case "disagreements":
      s.addDisagreements(event.round, event.disagreements);
      break;
    case "early-stop":
      s.setEarlyStopped({ round: event.round, delta: event.delta, reason: event.reason });
      break;
    case "judge-start":
      s.startJudge(event.modelId, event.providerName);
      break;
    case "judge-token":
      s.appendJudgeToken(event.token);
      break;
    case "judge-end":
      s.completeJudge(event.result);
      break;
    case "consensus-complete":
      s.completeConsensus(event.finalScore, event.summary, event.roundsCompleted);
      toast.success(`Consensus complete! Score: ${event.finalScore}%`);
      break;
    case "error":
      toast.error(event.message);
      s.completeConsensus(0, event.message, 0);
      break;
  }
}
