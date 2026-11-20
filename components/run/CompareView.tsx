"use client";

// ─────────────────────────────────────────────────────────────
// CompareView — the Run view for Compare attempts
// ─────────────────────────────────────────────────────────────
// Verdict, aggregate ranking with Borda points, juror agreement
// (Kendall's W), each juror's status, quote-verified findings per
// attempt with the dropped count, and the judge's synthesis.

import { Scale } from "lucide-react";
import type { NoClearWinnerReason, VerifiedFinding } from "ai-consensus-core";
import Markdown from "@/components/Markdown";
import { Badge, Button, Card, EmptyState, cn } from "@/components/ui";
import { useArenaStore } from "@/lib/store";
import type { CompareRunState } from "@/lib/types";

export interface CompareViewProps {
  onCancel: () => void;
  onNewRun: () => void;
  onRerun: () => void;
}

const REASONS: Record<NoClearWinnerReason, (c: CompareRunState) => string> = {
  incomplete: () => "Not every juror finished the first round, so no attempt is recommended.",
  "insufficient-votes": () => "Fewer than two jurors returned a valid verdict.",
  "low-agreement": (c) => {
    const a = c.result?.agreement;
    const w = a?.kendallW;
    return `The jurors disagree: agreement (Kendall's W) is ${w === null || w === undefined ? "n/a" : w.toFixed(2)}, below ${a?.threshold.toFixed(2) ?? "the threshold"}.`;
  },
  tie: () => "The top attempts are tied on points.",
};

const STOP_REASONS: Record<string, string> = {
  deadline: "Stopped at the time limit — results are partial.",
  "token-budget": "Stopped at the token budget — results are partial.",
  "cost-cap": "Stopped at the cost cap — results are partial.",
  aborted: "Stopped.",
};

const SEVERITY_TONE = { high: "danger", medium: "warning", low: "info" } as const;

export default function CompareView({ onCancel, onNewRun, onRerun }: CompareViewProps) {
  const compare = useArenaStore((s) => s.compare);
  const isRunning = useArenaStore((s) => s.isRunning);
  const runError = useArenaStore((s) => s.runError);
  const participants = useArenaStore((s) => s.participants);

  if (!compare) {
    return (
      <EmptyState
        icon={<Scale />}
        title="No comparison yet"
        description="Paste the attempts in Setup and run Compare attempts."
        action={
          <Button variant="primary" onClick={onNewRun}>
            New run
          </Button>
        }
      />
    );
  }

  const labelOf = (id: string) => compare.attempts.find((a) => a.id === id)?.label ?? id;
  const jurorName = (id: string) => {
    const p = participants.find((x) => x.id === id);
    return p ? `${p.persona.name} · ${p.modelInfo.modelId}` : id;
  };
  const result = compare.result;
  const doneJurors = Object.values(compare.jurors).filter(
    (j) => j.round === compare.round && j.status !== "running",
  ).length;

  return (
    <div className="space-y-4">
      <Card as="section" aria-labelledby="compare-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 id="compare-heading" className="text-lg font-semibold text-fg">
              Compare attempts
            </h1>
            <p className="mt-0.5 text-[13px] text-fg-muted" aria-live="polite">
              {isRunning
                ? compare.judgeRunning
                  ? "Judge is writing the synthesis…"
                  : compare.round === 0
                    ? "Starting…"
                    : `${compare.roundKind === "rebuttal" ? "Rebuttal round" : "Blind round"} · ${doneJurors} of ${compare.jurorIds.length} jurors done`
                : runError
                  ? `Failed: ${runError}`
                  : result
                    ? `${compare.attempts.length} attempts · ${result.rounds.length} round${result.rounds.length === 1 ? "" : "s"} · ${result.agreement.votes} counted vote${result.agreement.votes === 1 ? "" : "s"}`
                    : "Stopped."}
            </p>
          </div>
          <div className="flex gap-2">
            {isRunning ? (
              <Button variant="danger" onClick={onCancel}>
                Stop
              </Button>
            ) : (
              <>
                <Button onClick={onNewRun}>New run</Button>
                <Button variant="primary" onClick={onRerun}>
                  Run again
                </Button>
              </>
            )}
          </div>
        </div>

        {result && (
          <div
            className={cn(
              "mt-4 rounded-lg border p-3",
              result.verdict === "winner"
                ? "border-success/30 bg-success/10"
                : "border-warning/30 bg-warning/10",
            )}
          >
            {result.verdict === "winner" && result.recommended ? (
              <p className="text-base font-semibold text-fg">
                Recommended: {labelOf(result.recommended)}
              </p>
            ) : (
              <>
                <p className="text-base font-semibold text-fg">No clear winner</p>
                {result.noClearWinnerReason && (
                  <p className="mt-0.5 text-[13px] text-fg-muted">
                    {REASONS[result.noClearWinnerReason](compare)}
                  </p>
                )}
                {result.leader && (
                  <p className="mt-0.5 text-[13px] text-fg-muted">
                    Leading on points: {labelOf(result.leader)}
                  </p>
                )}
              </>
            )}
            {result.stopReason !== "completed" && (
              <p className="mt-1 text-[13px] text-warning">{STOP_REASONS[result.stopReason]}</p>
            )}
          </div>
        )}
      </Card>

      {result && (
        <Card as="section" aria-labelledby="compare-ranking">
          <h2 id="compare-ranking" className="text-base font-semibold text-fg">
            Ranking
          </h2>
          <p className="mb-2 text-[13px] text-fg-muted">
            Agreement (Kendall&apos;s W):{" "}
            <span className="font-medium text-fg">
              {result.agreement.kendallW === null ? "n/a" : result.agreement.kendallW.toFixed(2)}
            </span>{" "}
            · threshold {result.agreement.threshold.toFixed(2)} · {result.agreement.votes} of{" "}
            {compare.jurorIds.length} jurors counted
          </p>
          <table className="w-full text-left text-sm">
            <thead className="text-[12px] text-fg-muted">
              <tr>
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">Attempt</th>
                <th className="py-1 pr-2 text-right">Points</th>
                <th className="py-1 pr-2 text-right">1st places</th>
                <th className="py-1 pr-2 text-right">Findings</th>
                <th className="py-1">Checks</th>
              </tr>
            </thead>
            <tbody>
              {result.ranking.map((r) => (
                <tr key={r.candidateId} className="border-t border-border">
                  <td className="py-1.5 pr-2 tabular-nums">{r.rank}</td>
                  <td className="py-1.5 pr-2 font-medium text-fg">
                    {labelOf(r.candidateId)}
                    {r.candidateId === result.recommended && (
                      <Badge tone="success" className="ml-2">
                        recommended
                      </Badge>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.points}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.firstPlaceVotes}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.findingWeight}</td>
                  <td className="py-1.5">
                    {r.failedChecks.length > 0 ? (
                      <Badge tone={r.eligible ? "warning" : "danger"}>
                        failed: {r.failedChecks.join(", ")}
                      </Badge>
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card as="section" aria-labelledby="compare-jurors">
        <h2 id="compare-jurors" className="mb-2 text-base font-semibold text-fg">
          Jurors
        </h2>
        <ul className="flex flex-col gap-1 text-sm">
          {compare.jurorIds.map((id) => {
            const j = compare.jurors[id];
            const status = j?.status ?? "waiting";
            return (
              <li key={id} className="flex flex-wrap items-baseline gap-2">
                <span className="text-fg">{jurorName(id)}</span>
                <Badge
                  tone={
                    status === "valid"
                      ? "success"
                      : status === "abstained"
                        ? "warning"
                        : status === "cancelled"
                          ? "danger"
                          : "neutral"
                  }
                >
                  {status === "valid" ? "voted" : status}
                </Badge>
                {j?.reason && <span className="text-[12px] text-fg-muted">{j.reason}</span>}
              </li>
            );
          })}
        </ul>
      </Card>

      {result && (
        <Card as="section" aria-labelledby="compare-findings">
          <h2 id="compare-findings" className="text-base font-semibold text-fg">
            Findings
          </h2>
          <p className="mb-2 text-[13px] text-fg-muted">
            Only findings whose quote appears in that attempt are kept. {result.droppedFindings}{" "}
            dropped in total.
          </p>
          <div className="flex flex-col gap-4">
            {result.findings.map((f) => (
              <section key={f.candidateId} aria-label={`Findings for ${labelOf(f.candidateId)}`}>
                <h3 className="text-sm font-medium text-fg">
                  {labelOf(f.candidateId)}{" "}
                  <span className="font-normal text-fg-muted">
                    · {f.verified.length} verified · {f.dropped} dropped
                  </span>
                </h3>
                {f.verified.length === 0 ? (
                  <p className="text-[13px] text-fg-muted">No verified findings.</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-2">
                    {f.verified.map((v, i) => (
                      <FindingItem key={i} finding={v} />
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </Card>
      )}

      {(compare.judge || compare.judgeRunning) && (
        <Card as="section" aria-labelledby="compare-judge">
          <h2 id="compare-judge" className="mb-2 text-base font-semibold text-fg">
            Judge synthesis
          </h2>
          {compare.judge ? (
            <div className="flex flex-col gap-3 text-sm">
              <JudgeSection title="Majority position" body={compare.judge.majorityPosition} />
              <JudgeSection title="Minority positions" body={compare.judge.minorityPositions} />
              <JudgeSection title="Unresolved disputes" body={compare.judge.unresolvedDisputes} />
              {!compare.judge.majorityPosition && <Markdown>{compare.judge.content}</Markdown>}
            </div>
          ) : (
            <Markdown>{compare.judgeStream || "…"}</Markdown>
          )}
        </Card>
      )}

      {compare.tokenTotal && (
        <p className="text-[12px] text-fg-muted">
          {compare.tokenTotal.totalTokens.toLocaleString("en-US")} tokens · est. $
          {compare.tokenTotal.estimatedCostUSD.toFixed(4)}
        </p>
      )}
    </div>
  );
}

function FindingItem({ finding }: { finding: VerifiedFinding }) {
  const at = finding.line === null ? finding.file : `${finding.file}:${finding.line}`;
  return (
    <li className="rounded-md bg-surface-2 p-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <Badge tone={SEVERITY_TONE[finding.severity]}>{finding.severity}</Badge>
        <code className="text-[12px] text-fg-muted">{at}</code>
        {finding.reportedBy.length > 1 && (
          <span className="text-[12px] text-fg-muted">
            reported by {finding.reportedBy.length} jurors
          </span>
        )}
      </div>
      <p className="mt-1 text-fg">{finding.issue}</p>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-surface p-1.5 font-mono text-[12px] text-fg-muted">
        {finding.quote}
      </pre>
    </li>
  );
}

function JudgeSection({ title, body }: { title: string; body: string }) {
  if (!body) return null;
  return (
    <div>
      <h3 className="text-[13px] font-medium text-fg-muted">{title}</h3>
      <Markdown>{body}</Markdown>
    </div>
  );
}
