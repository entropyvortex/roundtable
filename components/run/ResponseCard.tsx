"use client";

// ─────────────────────────────────────────────────────────────
// ResponseCard — one participant's answer in one round
// ─────────────────────────────────────────────────────────────
// Completed answers render markdown; provider failures render a
// danger card with the upstream message; the live round renders
// streaming text or a waiting row. Completed/errored cards carry the
// anchor `id` + `data-response-id` = `r{round}-{participantId}`.

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Check, Copy, Loader2 } from "lucide-react";
import { formatCost, formatDuration, formatTokens, stripConfidence } from "@/lib/format";
import type { Participant, RoundResponse } from "@/lib/types";
import { Badge, Button, PersonaDot, cn } from "@/components/ui";
import Markdown from "../Markdown";
import { responseAnchorId } from "./navigation";

const CARD =
  "scroll-mt-24 overflow-hidden rounded-card border border-l-[3px] bg-surface transition-shadow";

function CardHeader({
  participant,
  roundLabel,
  children,
}: {
  participant: Participant;
  roundLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 border-b border-border px-4 py-3">
      <PersonaDot color={participant.persona.color} className="mt-1.5" />
      <div className="min-w-0 flex-1">
        <h4 className="truncate text-sm font-semibold text-fg">
          {participant.persona.name}
          {roundLabel && <span className="font-normal text-fg-muted"> · {roundLabel}</span>}
        </h4>
        <p className="truncate text-[13px] text-fg-muted">
          {participant.modelInfo.providerName} · {participant.modelInfo.modelId}
        </p>
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

export interface ResponseCardProps {
  participant: Participant;
  response: RoundResponse;
  /** Shown after the persona name, e.g. "R2 Counter" when reading one persona across rounds. */
  roundLabel?: string;
}

export const ResponseCard = memo(function ResponseCard({
  participant,
  response,
  roundLabel,
}: ResponseCardProps) {
  const anchor = responseAnchorId(response.roundNumber, participant.id);
  const body = useMemo(() => stripConfidence(response.content), [response.content]);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onCopy = useCallback(() => {
    navigator.clipboard?.writeText(body).then(
      () => {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2000);
      },
      () => undefined,
    );
  }, [body]);

  if (response.error) {
    return (
      <article
        id={anchor}
        data-response-id={anchor}
        className={cn(CARD, "border-danger/40")}
        style={{ borderLeftColor: "rgb(var(--danger))" }}
      >
        <CardHeader participant={participant} roundLabel={roundLabel}>
          <Badge tone="danger">Error</Badge>
        </CardHeader>
        <div className="flex items-start gap-3 px-4 py-3">
          <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-semibold text-danger">Provider error</p>
            <p className="break-words font-mono text-[13px] text-fg">{response.error}</p>
            <p className="text-[13px] text-fg-muted">
              Check the provider base URL, API key and that the model ID exists upstream. This
              answer is excluded from the consensus score.
            </p>
          </div>
        </div>
      </article>
    );
  }

  const usage = response.usage;
  return (
    <article
      id={anchor}
      data-response-id={anchor}
      className={cn(CARD, "border-border")}
      style={{ borderLeftColor: participant.persona.color }}
    >
      <CardHeader participant={participant} roundLabel={roundLabel}>
        <Badge title="Self-reported confidence">
          <span className="sr-only">Confidence </span>
          {response.confidence}%
        </Badge>
      </CardHeader>
      <div className="prose-rt px-4 py-3">
        <Markdown>{body || "…"}</Markdown>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-3 text-[13px] tabular-nums text-fg-muted">
        {response.durationMs !== undefined && <span>{formatDuration(response.durationMs)}</span>}
        {usage && <span>{formatTokens(usage.totalTokens)} tok</span>}
        {usage && usage.estimatedCostUSD > 0 && <span>{formatCost(usage.estimatedCostUSD)}</span>}
        <Button
          variant="ghost"
          size="sm"
          onClick={onCopy}
          title={copied ? "Copied!" : "Copy to clipboard"}
          aria-label={copied ? "Copied to clipboard" : "Copy response"}
          className="ml-auto h-7 px-2 text-fg-muted"
          icon={copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </article>
  );
});

export interface StreamingCardProps {
  participant: Participant;
  text: string;
  roundLabel?: string;
}

/** Live answer for the running round (plain text; markdown renders once it completes). */
export const StreamingCard = memo(function StreamingCard({
  participant,
  text,
  roundLabel,
}: StreamingCardProps) {
  return (
    <article
      aria-busy="true"
      className={cn(CARD, "border-accent/40")}
      style={{ borderLeftColor: participant.persona.color }}
    >
      <CardHeader participant={participant} roundLabel={roundLabel}>
        <span className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin text-accent" />
          Writing…
        </span>
      </CardHeader>
      <div className="whitespace-pre-wrap break-words px-4 py-3 text-[15px] leading-relaxed text-fg">
        {text}
        <span
          aria-hidden
          className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-accent align-middle"
        />
      </div>
    </article>
  );
});

export interface PendingCardProps {
  participant: Participant;
  /** The provider call started (no tokens yet) vs. still queued. */
  started: boolean;
  roundLabel?: string;
}

/** Placeholder for a participant who has not answered the running round yet. */
export function PendingCard({ participant, started, roundLabel }: PendingCardProps) {
  return (
    <article
      aria-busy="true"
      className={cn(CARD, "border-dashed border-border bg-transparent")}
      style={{ borderLeftColor: participant.persona.color, borderLeftStyle: "solid" }}
    >
      <CardHeader participant={participant} roundLabel={roundLabel}>
        <span className="text-[13px] text-fg-muted">{started ? "Thinking…" : "Waiting…"}</span>
      </CardHeader>
    </article>
  );
}

export default ResponseCard;
