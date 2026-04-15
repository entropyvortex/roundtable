"use client";

// ─────────────────────────────────────────────────────────────
// Result Panel — High-contrast readable results
// ─────────────────────────────────────────────────────────────

import { useArenaStore } from "@/lib/store";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useRef, memo, useCallback, useState } from "react";
import JudgeCard from "./JudgeCard";
import SessionMenu from "./SessionMenu";
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
    }, 300);
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
    <div className="w-full max-w-4xl mx-auto px-6 pb-8 space-y-8">
      {/* Progress bar */}
      <div className="sticky top-[53px] z-20 bg-arena-bg/95 backdrop-blur-xl py-4 -mx-6 px-6">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-arena-muted font-semibold uppercase tracking-[0.12em] whitespace-nowrap">
            {isRunning ? (
              <>
                Round {currentRound}/{roundCount}
              </>
            ) : (
              "Complete"
            )}
          </span>
          <div className="flex-1 h-1 bg-arena-surface rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                isRunning
                  ? "bg-arena-accent"
                  : "bg-gradient-to-r from-arena-accent to-arena-success"
              }`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-arena-muted font-mono tabular-nums w-8 text-right">
            {Math.round(progress * 100)}%
          </span>
          {isRunning && (
            <button
              onClick={cancelConsensus}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-arena-danger/10 border border-arena-danger/20 text-arena-danger text-[10px] font-medium hover:bg-arena-danger/20 active:scale-95 transition-all"
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
        <div key={round.number} id={`round-${round.number}`} className="space-y-5">
          <div className="flex items-center gap-3">
            {round.number < currentRound || !isRunning ? (
              <CheckCircle className="w-[18px] h-[18px] text-arena-success shrink-0" />
            ) : round.number === currentRound ? (
              <Loader2 className="w-[18px] h-[18px] text-arena-accent animate-spin shrink-0" />
            ) : (
              <Circle className="w-[18px] h-[18px] text-arena-muted/40 shrink-0" />
            )}
            <h3 className="text-[15px] font-semibold text-arena-text tracking-tight">
              Round {round.number}
              <span className="font-normal text-arena-muted ml-2">{round.label}</span>
            </h3>
            {round.consensusScore > 0 && (
              <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-arena-success bg-arena-success/10 px-2 py-0.5 rounded-md">
                <TrendingUp className="w-3 h-3" />
                {round.consensusScore}%
              </span>
            )}
          </div>

          <div className="space-y-3 pl-7">
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
        <div className="flex items-start gap-3 rounded-xl border border-arena-warning/20 bg-arena-warning/5 px-5 py-3">
          <ZapOff className="w-4 h-4 text-arena-warning mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-[12px] font-semibold text-arena-warning">
              Stopped early after round {earlyStopped.round}
            </p>
            <p className="text-[11px] text-arena-muted leading-relaxed">{earlyStopped.reason}</p>
          </div>
        </div>
      )}

      {/* Judge synthesis */}
      <JudgeCard />

      {/* Final consensus */}
      {finalScore !== null && (
        <div className="rounded-xl border border-arena-accent/20 bg-arena-surface p-7 space-y-3">
          <div className="flex items-center gap-3">
            <Award className="w-5 h-5 text-arena-accent" />
            <h3 className="text-[15px] font-semibold text-arena-text tracking-tight">
              Consensus Reached
            </h3>
            <span className="ml-auto text-2xl font-bold text-arena-accent font-mono tabular-nums">
              {finalScore}%
            </span>
            <SessionMenu />
          </div>
          {finalSummary && (
            <p className="text-[13px] text-arena-muted leading-relaxed">{finalSummary}</p>
          )}
        </div>
      )}

      {rounds.length > 0 && (
        <div className="flex justify-center pt-2 pb-6">
          <button
            onClick={scrollToTop}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] text-arena-muted hover:text-arena-text transition-colors"
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
  const displayContent = content.replace(/\nCONFIDENCE:\s*\d+\s*$/i, "").trim();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(displayContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [displayContent]);

  if (error) {
    return (
      <div
        id={responseId}
        data-response-id={responseId}
        className="group/card rounded-xl border border-arena-danger/40 bg-arena-danger/5 overflow-hidden scroll-mt-24 relative"
        style={{ borderLeftColor: "#f87171", borderLeftWidth: 3 }}
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
      className="group/card rounded-xl border border-arena-border/60 bg-arena-surface overflow-hidden scroll-mt-24 transition-all hover:border-arena-border relative"
      style={{ borderLeftColor: personaColor, borderLeftWidth: 3 }}
    >
      <Header
        modelName={modelName}
        providerName={providerName}
        personaName={personaName}
        personaColor={personaColor}
        personaEmoji={personaEmoji}
        confidence={confidence}
      />
      <div className="px-5 py-4 prose prose-invert prose-sm max-w-none text-arena-text/90 leading-[1.75] [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5 [&_h1]:text-[15px] [&_h2]:text-[14px] [&_h3]:text-[13px] [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-medium [&_code]:text-arena-glow [&_code]:bg-arena-accent/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[12px] [&_strong]:text-arena-text [&_strong]:font-semibold">
        <ReactMarkdown remarkPlugins={remarkPlugins}>{displayContent || "..."}</ReactMarkdown>
      </div>
      {/* Copy button */}
      <button
        onClick={handleCopy}
        className={`absolute bottom-3 right-3 p-1.5 rounded-md transition-all ${
          copied
            ? "bg-arena-success/15 text-arena-success"
            : "bg-arena-bg/80 text-arena-muted/40 opacity-0 group-hover/card:opacity-100 hover:text-arena-accent hover:bg-arena-accent/10"
        }`}
        title={copied ? "Copied!" : "Copy to clipboard"}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
});

// ── Streaming Card ─────────────────────────────────────────

function StreamingCard({
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
  return (
    <div
      className="rounded-xl border border-arena-accent/20 bg-arena-surface overflow-hidden"
      style={{ borderLeftColor: personaColor, borderLeftWidth: 3 }}
    >
      <Header
        modelName={modelName}
        providerName={providerName}
        personaName={personaName}
        personaColor={personaColor}
        personaEmoji={personaEmoji}
        streaming
      />
      <div className="px-5 py-4 text-[13px] text-arena-text/80 whitespace-pre-wrap break-words font-mono leading-[1.75]">
        {content || "..."}
        <span className="inline-block w-[6px] h-[14px] bg-arena-accent animate-pulse ml-0.5 align-middle rounded-sm" />
      </div>
    </div>
  );
}

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
  return (
    <div className="flex items-center gap-2.5 px-5 py-3 border-b border-arena-border/40 bg-arena-bg/30">
      <span
        className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold"
        style={{ backgroundColor: `${personaColor}20`, color: personaColor }}
      >
        {personaEmoji}
      </span>
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-medium text-arena-text">{modelName}</span>
        <span className="text-[11px] text-arena-muted ml-2">
          {providerName} &middot; {personaName}
        </span>
      </div>
      {streaming && <Loader2 className="w-3.5 h-3.5 text-arena-accent animate-spin" />}
      {errored && (
        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-arena-danger/15 text-arena-danger">
          ERROR
        </span>
      )}
      {!errored && confidence != null && (
        <span
          className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md"
          style={{ backgroundColor: `${personaColor}15`, color: personaColor }}
        >
          {confidence}%
        </span>
      )}
    </div>
  );
});
