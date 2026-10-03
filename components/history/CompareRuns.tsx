"use client";

// ─────────────────────────────────────────────────────────────
// History — side-by-side comparison of two saved runs
// ─────────────────────────────────────────────────────────────
// Run A is always the older run and Run B the newer one, so every
// "Change" cell reads as B − A ("what changed since last time").

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import type { HistoryEntry } from "@/lib/history";
import { engineLabel, scoreLabel } from "@/lib/score-label";
import type { Participant, SessionSnapshot } from "@/lib/types";
import { excerpt, formatAbsoluteTime, formatChange, formatCost, formatTokens } from "@/lib/format";
import { Badge, Button, PersonaDot } from "@/components/ui";

export interface CompareRunsProps {
  /** The two runs to compare, in any order (sorted older → newer). */
  a: HistoryEntry;
  b: HistoryEntry;
  onClose: () => void;
}

const MAJORITY_MAX = 240;
const QUESTION_MAX = 320;

/**
 * Each participant's confidence in the last round where they answered
 * without an error, keyed by participant id (null when they never did).
 */
export function finalConfidences(snapshot: SessionSnapshot): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const p of snapshot.participants ?? []) out.set(p.id, null);
  const rounds = [...(snapshot.rounds ?? [])].sort((x, y) => x.number - y.number);
  for (const round of rounds) {
    for (const r of round.responses ?? []) {
      if (r.error) continue;
      out.set(r.participantId, r.confidence);
    }
  }
  return out;
}

export interface SeatConfidence {
  participant: Participant;
  confidence: number | null;
}

export interface ParticipantMatch {
  key: string;
  name: string;
  color: string;
  a?: SeatConfidence;
  b?: SeatConfidence;
}

/** Custom personas all share `id: "custom"`, so they're told apart by name. */
function personaKey(p: Participant): string {
  return p.persona.id === "custom" ? `custom:${p.persona.name}` : p.persona.id;
}

function seats(snapshot: SessionSnapshot): Array<{ key: string; seat: SeatConfidence }> {
  const conf = finalConfidences(snapshot);
  const seen = new Map<string, number>();
  return (snapshot.participants ?? []).map((participant) => {
    const base = personaKey(participant);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    // The same persona can sit twice; pair the Nth copy with the Nth copy.
    return {
      key: `${base}#${n}`,
      seat: { participant, confidence: conf.get(participant.id) ?? null },
    };
  });
}

/**
 * Pair participants across two runs by persona. Shared personas come
 * first (in run A's seat order), then personas only in A, then only in B.
 */
export function matchParticipants(a: SessionSnapshot, b: SessionSnapshot): ParticipantMatch[] {
  const seatsB = seats(b);
  const inB = new Map(seatsB.map((s) => [s.key, s.seat]));
  const shared: ParticipantMatch[] = [];
  const onlyA: ParticipantMatch[] = [];
  const used = new Set<string>();
  for (const { key, seat } of seats(a)) {
    const other = inB.get(key);
    const m: ParticipantMatch = {
      key,
      name: seat.participant.persona.name,
      color: seat.participant.persona.color,
      a: seat,
      ...(other ? { b: other } : {}),
    };
    if (other) {
      used.add(key);
      shared.push(m);
    } else onlyA.push(m);
  }
  const onlyB: ParticipantMatch[] = seatsB
    .filter((s) => !used.has(s.key))
    .map(({ key, seat }) => ({
      key,
      name: seat.participant.persona.name,
      color: seat.participant.persona.color,
      b: seat,
    }));
  return [...shared, ...onlyA, ...onlyB];
}

function contradictionCount(s: SessionSnapshot): number | null {
  if (!s.claims || s.claims.error) return null;
  return s.claims.contradictions?.length ?? 0;
}

function majority(s: SessionSnapshot): string | null {
  if (!s.judge) return null;
  const text = s.judge.majorityPosition?.trim() || s.judge.content?.trim();
  return text ? excerpt(text, MAJORITY_MAX) : null;
}

const money = (n: number) => formatCost(n);
const whole = (n: number) => Math.round(n).toLocaleString("en-US");

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-fg-muted">{children}</span>;
}

function Row({
  label,
  a,
  b,
  change,
  labelSub,
}: {
  label: ReactNode;
  a: ReactNode;
  b: ReactNode;
  change?: string;
  labelSub?: ReactNode;
}) {
  return (
    <tr className="border-t border-border align-top">
      <th scope="row" className="w-40 py-3 pr-4 text-left text-[13px] font-medium text-fg-muted">
        {label}
        {labelSub && <span className="block font-normal">{labelSub}</span>}
      </th>
      <td className="py-3 pr-4 text-sm text-fg">{a}</td>
      <td className="py-3 pr-4 text-sm text-fg">{b}</td>
      <td className="py-3 text-right text-sm tabular-nums text-fg">
        {change === undefined ? null : change === "—" ? <Muted>—</Muted> : change}
      </td>
    </tr>
  );
}

function Score({ score }: { score: number | null }) {
  if (score === null) return <Muted>No score</Muted>;
  const l = scoreLabel(score);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-base font-semibold tabular-nums">{score}</span>
      <Badge tone={l.tone}>{l.label}</Badge>
    </span>
  );
}

function Claims({ snapshot }: { snapshot: SessionSnapshot }) {
  const count = contradictionCount(snapshot);
  if (count === null)
    return <Muted>{snapshot.claims?.error ? "Extraction failed" : "Not extracted"}</Muted>;
  const list = snapshot.claims?.contradictions ?? [];
  return (
    <div>
      <span className="font-semibold tabular-nums">{count}</span>
      {list.length > 0 && (
        <ul className="mt-1 list-disc space-y-1 pl-4 text-[13px] text-fg-muted">
          {list.map((c) => (
            <li key={c.id}>{c.claim}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Participants({ snapshot }: { snapshot: SessionSnapshot }) {
  const list = snapshot.participants ?? [];
  if (list.length === 0) return <Muted>None</Muted>;
  return (
    <ul className="space-y-1">
      {list.map((p) => (
        <li key={p.id} className="flex gap-2">
          <PersonaDot color={p.persona.color} className="mt-1.5 ring-1 ring-border" />
          <span className="min-w-0">
            {p.persona.name}
            <span className="block text-[13px] text-fg-muted">
              {p.modelInfo.providerName} / {p.modelInfo.modelId}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Confidence({ seat }: { seat?: SeatConfidence }) {
  if (!seat) return <Muted>Not on this panel</Muted>;
  if (seat.confidence === null) return <Muted>No answer</Muted>;
  return (
    <span className="tabular-nums">
      {seat.confidence}
      <span className="block text-[13px] text-fg-muted">{seat.participant.modelInfo.modelId}</span>
    </span>
  );
}

/** Two saved runs side by side: score, verdict, contradictions, panel, cost. */
export default function CompareRuns({ a: first, b: second, onClose }: CompareRunsProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [a, b] = first.savedAt <= second.savedAt ? [first, second] : [second, first];
  const sa = a.snapshot;
  const sb = b.snapshot;

  // A comparison opens below the list; bring it (and focus) into view.
  useEffect(() => {
    const h = headingRef.current;
    h?.focus();
    h?.scrollIntoView?.({ block: "start" });
  }, [a.id, b.id]);

  const sameQuestion = (sa.prompt ?? "").trim() === (sb.prompt ?? "").trim();
  const matches = matchParticipants(sa, sb);
  const ca = contradictionCount(sa);
  const cb = contradictionCount(sb);
  const ma = majority(sa);
  const mb = majority(sb);

  return (
    <section
      aria-labelledby="rt-compare-heading"
      className="rounded-card border border-border bg-surface p-4 sm:p-5"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="rt-compare-heading"
            ref={headingRef}
            tabIndex={-1}
            className="text-base font-semibold text-fg focus:outline-none"
          >
            Compare runs
          </h2>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            Run A is the older run; “Change” is Run B minus Run A.
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon={<X className="h-4 w-4" />}
          onClick={onClose}
          aria-label="Close comparison"
        >
          Close
        </Button>
      </div>

      <div
        role="region"
        aria-label="Comparison table"
        tabIndex={0}
        className="-mx-1 overflow-x-auto px-1"
      >
        <table className="w-full min-w-[640px] border-collapse">
          <caption className="sr-only">
            {a.title} compared with {b.title}
          </caption>
          <thead>
            <tr className="align-bottom">
              <td className="w-40" />
              <th scope="col" className="pb-2 pr-4 text-left">
                <span className="block text-[13px] font-medium text-fg-muted">Run A</span>
                <span className="block text-sm font-semibold text-fg">{a.title}</span>
              </th>
              <th scope="col" className="pb-2 pr-4 text-left">
                <span className="block text-[13px] font-medium text-fg-muted">Run B</span>
                <span className="block text-sm font-semibold text-fg">{b.title}</span>
              </th>
              <th
                scope="col"
                className="w-28 pb-2 text-right text-[13px] font-medium text-fg-muted"
              >
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {sameQuestion ? (
              <tr className="border-t border-border align-top">
                <th
                  scope="row"
                  className="w-40 py-3 pr-4 text-left text-[13px] font-medium text-fg-muted"
                >
                  Question
                </th>
                <td colSpan={3} className="py-3 text-sm text-fg">
                  <span className="mr-2">
                    <Badge>Same question</Badge>
                  </span>
                  {excerpt(sa.prompt ?? "", QUESTION_MAX)}
                </td>
              </tr>
            ) : (
              <Row
                label="Question"
                a={excerpt(sa.prompt ?? "", QUESTION_MAX)}
                b={excerpt(sb.prompt ?? "", QUESTION_MAX)}
              />
            )}
            <Row label="Engine" a={engineLabel(a.engine)} b={engineLabel(b.engine)} />
            <Row
              label="Final score"
              a={<Score score={a.score} />}
              b={<Score score={b.score} />}
              change={formatChange(a.score, b.score)}
            />
            <Row
              label="Judge majority"
              a={ma ?? <Muted>No judge verdict</Muted>}
              b={mb ?? <Muted>No judge verdict</Muted>}
            />
            <Row
              label="Contradictions"
              labelSub="claim-level"
              a={<Claims snapshot={sa} />}
              b={<Claims snapshot={sb} />}
              change={formatChange(ca, cb)}
            />
            <Row
              label="Disagreement flags"
              labelSub="confidence spread"
              a={<span className="tabular-nums">{sa.disagreements?.length ?? 0}</span>}
              b={<span className="tabular-nums">{sb.disagreements?.length ?? 0}</span>}
              change={formatChange(sa.disagreements?.length ?? 0, sb.disagreements?.length ?? 0)}
            />
            <Row
              label="Participants"
              a={<Participants snapshot={sa} />}
              b={<Participants snapshot={sb} />}
            />
          </tbody>
          <tbody>
            <tr className="border-t border-border">
              <th
                scope="rowgroup"
                colSpan={4}
                className="pb-1 pt-4 text-left text-[13px] font-semibold text-fg"
              >
                Final confidence by participant
              </th>
            </tr>
            {matches.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-3 text-sm text-fg-muted">
                  No participants.
                </td>
              </tr>
            ) : (
              matches.map((m) => (
                <Row
                  key={m.key}
                  label={
                    <span className="flex gap-2 text-fg">
                      <PersonaDot color={m.color} className="mt-1.5 ring-1 ring-border" />
                      <span>{m.name}</span>
                    </span>
                  }
                  a={<Confidence seat={m.a} />}
                  b={<Confidence seat={m.b} />}
                  change={m.a && m.b ? formatChange(m.a.confidence, m.b.confidence) : "—"}
                />
              ))
            )}
          </tbody>
          <tbody>
            <Row
              label="Cost"
              a={<span className="tabular-nums">{formatCost(a.cost)}</span>}
              b={<span className="tabular-nums">{formatCost(b.cost)}</span>}
              change={a.cost > 0 && b.cost > 0 ? formatChange(a.cost, b.cost, money) : "—"}
            />
            <Row
              label="Tokens"
              a={<span className="tabular-nums">{formatTokens(sa.tokenTotal?.totalTokens)}</span>}
              b={<span className="tabular-nums">{formatTokens(sb.tokenTotal?.totalTokens)}</span>}
              change={
                sa.tokenTotal?.totalTokens && sb.tokenTotal?.totalTokens
                  ? formatChange(sa.tokenTotal.totalTokens, sb.tokenTotal.totalTokens, whole)
                  : "—"
              }
            />
            <Row
              label="Saved"
              a={formatAbsoluteTime(a.savedAt)}
              b={formatAbsoluteTime(b.savedAt)}
            />
          </tbody>
        </table>
      </div>
    </section>
  );
}
