"use client";

// ─────────────────────────────────────────────────────────────
// Result Panel — High-contrast readable results
// ─────────────────────────────────────────────────────────────

import { useArenaStore } from "@/lib/store";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useRef, memo, useCallback, useState, useMemo } from "react";
import JudgeCard from "./JudgeCard";
import SessionMenu from "./SessionMenu";
import { ConsensusRingsArt } from "./HeroArt";
import {
  CheckCircle,
  Circle,
  Loader2,
  TrendingUp,
  Award,
  Square,
  ChevronUp,
  Copy,
  Check,
  ZapOff,
  AlertCircle,
} from "lucide-react";

const remarkPlugins = [remarkGfm];

export default function ResultPanel() {
  const rounds = useArenaStore((s) => s.rounds);
  const currentRound = useArenaStore((s) => s.currentRound);
  const isRunning = useArenaStore((s) => s.isRunning);
  const participants = useArenaStore((s) => s.participants);
  const finalScore = useArenaStore((s) => s.finalScore);
  const finalSummary = useArenaStore((s) => s.finalSummary);
  const progress = useArenaStore((s) => s.progress);
  const cancelConsensus = useArenaStore((s) => s.cancelConsensus);
  const roundCount = useArenaStore((s) => s.options.rounds);
  const earlyStopped = useArenaStore((s) => s.earlyStopped);
  const judge = useArenaStore((s) => s.judge);
  const judgeRunning = useArenaStore((s) => s.judgeRunning);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleScroll = useCallback(() => {
    if (scrollTimerRef.current) return;
    scrollTimerRef.current = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      scrollTimerRef.current = null;
    }, 350);
  }, []);

  useEffect(() => {
    scheduleScroll();
  }, [rounds, finalScore, scheduleScroll]);
  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (rounds.length === 0 && !isRunning && !judge && !judgeRunning) return null;

  return (
    <div className="w-full space-y-7">
      {/* Progress bar — sticky, single backdrop-filter (acceptable). */}
      <div
        className="sticky z-20 glass-fixed border rounded-2xl px-4 sm:px-5 py-3 sm:py-3.5 shadow-glass"
        style={{ top: "calc(var(--rt-header-h) - 9px)" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-arena-glow font-semibold uppercase tracking-[0.18em] whitespace-nowrap">
            {isRunning ? (
              <>
                Round {currentRound}/{roundCount}
              </>
            ) : (
              "Complete"
            )}
          </span>
          <div className="flex-1 h-1.5 bg-black/55 rounded-full overflow-hidden border border-white/[0.04]">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                isRunning
                  ? "progress-orange"
                  : "bg-gradient-to-r from-arena-accent via-arena-glow to-arena-success"
              }`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <span className="text-[10.5px] text-arena-text/85 font-mono tabular-nums w-9 text-right">
            {Math.round(progress * 100)}%
          </span>
          {isRunning && (
            <button
              onClick={cancelConsensus}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-arena-danger/12 border border-arena-danger/35 text-arena-danger text-[10px] font-semibold hover:bg-arena-danger/20 active:scale-95 transition-all"
              title="Cancel (Esc)"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Rounds */}
      {rounds.map((round) => (
        <div key={round.number} id={`round-${round.number}`} className="space-y-4 scroll-mt-32">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-black/35 border border-white/[0.06]">
              {round.number < currentRound || !isRunning ? (
                <CheckCircle className="w-[16px] h-[16px] text-arena-success drop-shadow-[0_0_5px_rgba(52,211,153,0.55)]" />
              ) : round.number === currentRound ? (
                <Loader2 className="w-[16px] h-[16px] text-arena-accent animate-spin" />
              ) : (
                <Circle className="w-[16px] h-[16px] text-arena-muted/40" />
              )}
            </div>
            <h3 className="text-[16px] font-semibold text-arena-text tracking-tight">
              Round {round.number}
              <span className="font-normal text-arena-muted ml-2">{round.label}</span>
            </h3>
            {round.consensusScore > 0 && (
              <span className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-arena-success bg-arena-success/12 border border-arena-success/30 px-2.5 py-1 rounded-lg">
                <TrendingUp className="w-3 h-3" />
                {round.consensusScore}%
              </span>
            )}
          </div>

          <div className="space-y-3 pl-0 sm:pl-10">
            {round.responses.map((response) => {
              const participant = participants.find((p) => p.id === response.participantId);
              if (!participant) return null;
              return (
                <CompletedResponseCard
                  key={`${round.number}-${response.participantId}`}
                  responseId={`r${round.number}-${response.participantId}`}
                  modelName={participant.modelInfo.modelId}
                  providerName={participant.modelInfo.providerName}
                  personaName={participant.persona.name}
                  personaColor={participant.persona.color}
                  personaEmoji={participant.persona.emoji}
                  confidence={response.confidence}
                  content={response.content}
                  error={response.error}
                />
              );
            })}

            {round.number === currentRound && isRunning && (
              <ActiveStreams participants={participants} roundResponses={round.responses} />
            )}
          </div>
        </div>
      ))}

      {/* Early stop notice */}
      {earlyStopped && (
        <div className="glass flex items-start gap-3 px-5 py-4 border border-arena-warning/35">
          <ZapOff className="w-4 h-4 text-arena-warning mt-0.5 shrink-0 drop-shadow-[0_0_5px_rgba(251,191,36,0.55)]" />
          <div className="flex-1">
            <p className="text-[12.5px] font-semibold text-arena-warning">
              Stopped early after round {earlyStopped.round}
            </p>
            <p className="text-[11px] text-arena-muted leading-relaxed mt-0.5">
              {earlyStopped.reason}
            </p>
          </div>
        </div>
      )}

      {/* Judge synthesis */}
      <JudgeCard />

      {/* Final consensus */}
      {finalScore !== null && (
        <div className="glass-strong overflow-hidden">
          <ConsensusRingsArt className="h-[110px] sm:h-[140px]" />
          <div className="p-5 sm:p-7 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#ff8a3a] to-[#e25400] flex items-center justify-center shadow-glow-orange-sm">
                <Award className="w-4.5 h-4.5 text-white" />
              </div>
              <h3 className="text-[16px] font-semibold text-arena-text tracking-tight">
                Consensus Reached
              </h3>
              <span className="ml-auto text-3xl font-bold font-mono tabular-nums tracking-tight bg-gradient-to-br from-[#ffd0a8] via-[#ff9a4d] to-[#ff6200] bg-clip-text text-transparent">
                {finalScore}%
              </span>
              <SessionMenu />
            </div>
            {finalSummary && (
              <p className="text-[13px] text-arena-text/85 leading-relaxed">{finalSummary}</p>
            )}
          </div>
        </div>
      )}

      {rounds.length > 0 && (
        <div className="flex justify-center pt-2 pb-8">
          <button
            onClick={scrollToTop}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] text-arena-muted hover:text-arena-glow hover:bg-white/[0.04] transition-all"
          >
            <ChevronUp className="w-3 h-3" />
            Back to top
          </button>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

// ── Active Streams ─────────────────────────────────────────

function ActiveStreams({
  participants,
  roundResponses,
}: {
  participants: Array<{
    id: string;
    modelInfo: { modelId: string; providerName: string };
    persona: { name: string; color: string; emoji: string };
  }>;
  roundResponses: Array<{ participantId: string }>;
}) {
  const activeStreams = useArenaStore((s) => s.activeStreams);

  return (
    <>
      {participants.map((p) => {
        const stream = activeStreams[p.id];
        const done = roundResponses.some((r) => r.participantId === p.id);
        if (done || !stream) return null;
        return (
          <StreamingCard
            key={`stream-${p.id}`}
            modelName={p.modelInfo.modelId}
            providerName={p.modelInfo.providerName}
            personaName={p.persona.name}
            personaColor={p.persona.color}
            personaEmoji={p.persona.emoji}
            content={stream}
          />
        );
      })}
    </>
  );
}

// ── Completed Card ─────────────────────────────────────────

const CompletedResponseCard = memo(function CompletedResponseCard({
  responseId,
  modelName,
  providerName,
  personaName,
  personaColor,
  personaEmoji,
  confidence,
  content,
  error,
}: {
  responseId: string;
  modelName: string;
  providerName: string;
  personaName: string;
  personaColor: string;
  personaEmoji: string;
  confidence: number;
  content: string;
  error?: string;
}) {
  const displayContent = useMemo(
    () => content.replace(/\nCONFIDENCE:\s*\d+\s*$/i, "").trim(),
    [content],
  );
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(displayContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [displayContent]);

  // Stable per-card style — only rebuilt when persona color changes.
  const cardStyle = useMemo(
    () => ({
      boxShadow: `inset 4px 0 0 0 ${personaColor}, 0 10px 28px -10px rgba(0,0,0,0.55)`,
    }),
    [personaColor],
  );

  if (error) {
    return (
      <div
        id={responseId}
        data-response-id={responseId}
        className="group/card glass card-result overflow-hidden scroll-mt-32 relative border border-arena-danger/40"
        style={{ boxShadow: `inset 4px 0 0 0 #f87171, 0 8px 24px -10px rgba(248,113,113,0.18)` }}
      >
        <Header
          modelName={modelName}
          providerName={providerName}
          personaName={personaName}
          personaColor={personaColor}
          personaEmoji={personaEmoji}
          errored
        />
        <div className="px-5 py-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-arena-danger shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-arena-danger">Provider error</p>
            <p className="text-[11px] font-mono text-arena-text/80 mt-1 break-words">{error}</p>
            <p className="text-[10px] text-arena-muted mt-2 leading-relaxed">
              Check your provider base URL, API key, and that the model ID exists at the upstream
              endpoint. This participant&apos;s response is excluded from the consensus score.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id={responseId}
      data-response-id={responseId}
      className="group/card glass card-result overflow-hidden scroll-mt-32 transition-colors hover:border-arena-blue/40 relative"
      style={cardStyle}
    >
      <Header
        modelName={modelName}
        providerName={providerName}
        personaName={personaName}
        personaColor={personaColor}
        personaEmoji={personaEmoji}
        confidence={confidence}
      />
      <div className="px-4 sm:px-6 py-4 sm:py-5 prose prose-invert prose-sm max-w-none text-arena-text/90 leading-[1.78] [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5 [&_h1]:text-[15px] [&_h2]:text-[14px] [&_h3]:text-[13px] [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-medium [&_code]:text-arena-glow [&_code]:bg-arena-accent/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[12px] [&_strong]:text-arena-text [&_strong]:font-semibold [&_pre]:!my-3 [&_pre]:!overflow-x-auto">
        <ReactMarkdown remarkPlugins={remarkPlugins}>{displayContent || "…"}</ReactMarkdown>
      </div>
      <button
        onClick={handleCopy}
        className={`absolute bottom-3 right-3 p-1.5 rounded-lg transition-colors ${
          copied
            ? "bg-arena-success/15 text-arena-success border border-arena-success/35"
            : "bg-black/55 text-arena-muted/55 opacity-0 group-hover/card:opacity-100 hover:text-arena-glow hover:bg-arena-accent/12 border border-white/[0.08]"
        }`}
        title={copied ? "Copied!" : "Copy to clipboard"}
        aria-label={copied ? "Copied to clipboard" : "Copy response"}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
});

// ── Streaming Card ─────────────────────────────────────────
// Memoized so only the participant whose tokens changed re-renders.
// Stable inline style avoids object churn in the diff tree.

const StreamingCard = memo(function StreamingCard({
  modelName,
  providerName,
  personaName,
  personaColor,
  personaEmoji,
  content,
}: {
  modelName: string;
  providerName: string;
  personaName: string;
  personaColor: string;
  personaEmoji: string;
  content: string;
}) {
  const cardStyle = useMemo(
    () => ({
      boxShadow: `inset 4px 0 0 0 ${personaColor}, 0 0 18px rgba(255,98,0,0.14)`,
    }),
    [personaColor],
  );

  return (
    <div
      className="glass card-streaming overflow-hidden border border-arena-accent/30"
      style={cardStyle}
    >
      <Header
        modelName={modelName}
        providerName={providerName}
        personaName={personaName}
        personaColor={personaColor}
        personaEmoji={personaEmoji}
        streaming
      />
      <div className="px-4 sm:px-6 py-4 sm:py-5 text-[12.5px] sm:text-[13px] text-arena-text/85 whitespace-pre-wrap break-words font-mono leading-[1.78]">
        {content || "…"}
        <span
          className="inline-block w-[6px] h-[14px] bg-arena-accent ml-0.5 align-middle rounded-sm animate-pulse"
          aria-hidden
        />
      </div>
    </div>
  );
});

// ── Header ─────────────────────────────────────────────────

const Header = memo(function Header({
  modelName,
  providerName,
  personaName,
  personaColor,
  personaEmoji,
  confidence,
  streaming,
  errored,
}: {
  modelName: string;
  providerName: string;
  personaName: string;
  personaColor: string;
  personaEmoji: string;
  confidence?: number;
  streaming?: boolean;
  errored?: boolean;
}) {
  const emojiStyle = useMemo(
    () => ({
      backgroundColor: `${personaColor}25`,
      color: personaColor,
      boxShadow: `0 0 8px ${personaColor}33`,
    }),
    [personaColor],
  );
  const confidenceStyle = useMemo(
    () => ({
      backgroundColor: `${personaColor}18`,
      color: personaColor,
      border: `1px solid ${personaColor}35`,
    }),
    [personaColor],
  );

  return (
    <div className="flex items-center gap-2.5 px-5 py-3 border-b border-white/[0.05] bg-black/40">
      <span
        className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold"
        style={emojiStyle}
      >
        {personaEmoji}
      </span>
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-semibold text-arena-text">{modelName}</span>
        <span className="text-[11px] text-arena-muted ml-2">
          {providerName} · {personaName}
        </span>
      </div>
      {streaming && <Loader2 className="w-3.5 h-3.5 text-arena-accent animate-spin" />}
      {errored && (
        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-arena-danger/15 text-arena-danger border border-arena-danger/30">
          ERROR
        </span>
      )}
      {!errored && confidence != null && (
        <span
          className="text-[10.5px] font-mono font-semibold px-2.5 py-1 rounded-lg"
          style={confidenceStyle}
        >
          {confidence}%
        </span>
      )}
    </div>
  );
});
