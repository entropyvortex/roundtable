"use client";

// ─────────────────────────────────────────────────────────────
// Confidence Trajectory — per-participant confidence by round
// ─────────────────────────────────────────────────────────────
// Lines are an inline SVG stretched to the plot box (non-scaling
// strokes keep them crisp); points and axis labels are HTML so text
// stays at a readable 12px at any width. Errored answers are skipped.

import { useMemo } from "react";
import { useArenaStore } from "@/lib/store";
import { PersonaDot } from "@/components/ui";
import { BriefSection } from "./run/BriefSection";

const X_PAD = 5; // % of the plot width kept free at each end
const Y_PAD = 6; // % of the plot height kept free at top/bottom
const GRID = [100, 50, 0];

export default function ConfidenceTrajectory() {
  const rounds = useArenaStore((s) => s.rounds);
  const participants = useArenaStore((s) => s.participants);

  const series = useMemo(
    () =>
      participants.map((p) => ({
        participant: p,
        points: rounds.flatMap((r, index) => {
          const res = r.responses.find((x) => x.participantId === p.id && !x.error);
          return res && Number.isFinite(res.confidence)
            ? [{ index, round: r.number, value: res.confidence }]
            : [];
        }),
      })),
    [participants, rounds],
  );

  if (rounds.length < 1 || series.every((s) => s.points.length === 0)) return null;

  const n = rounds.length;
  const x = (i: number) => (n === 1 ? 50 : X_PAD + (i / (n - 1)) * (100 - 2 * X_PAD));
  const y = (v: number) => Y_PAD + (1 - Math.max(0, Math.min(100, v)) / 100) * (100 - 2 * Y_PAD);

  const summary = series
    .filter((s) => s.points.length > 0)
    .map(
      ({ participant, points }) =>
        `${participant.persona.name}: ${points.map((p) => `R${p.round} ${p.value}`).join(", ")}`,
    )
    .join("; ");

  return (
    <BriefSection
      title="Confidence trajectory"
      meta="Each participant's self-reported confidence (0–100) per round."
    >
      <div className="flex gap-2">
        <div aria-hidden className="relative w-7 shrink-0 text-xs tabular-nums text-fg-muted">
          {GRID.map((v) => (
            <span
              key={v}
              className="absolute right-0 -translate-y-1/2 leading-none"
              style={{ top: `${y(v)}%` }}
            >
              {v}
            </span>
          ))}
        </div>
        <div className="relative h-40 min-w-0 flex-1">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            role="img"
            aria-label="Confidence trajectory chart"
          >
            <desc>{summary}</desc>
            {GRID.map((v) => (
              <line
                key={v}
                x1={0}
                x2={100}
                y1={y(v)}
                y2={y(v)}
                className="stroke-border"
                strokeWidth={1}
                strokeDasharray={v === 50 ? "3 4" : undefined}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {series.map(({ participant, points }) =>
              points.length > 1 ? (
                <polyline
                  key={participant.id}
                  points={points.map((p) => `${x(p.index)},${y(p.value)}`).join(" ")}
                  fill="none"
                  stroke={participant.persona.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null,
            )}
          </svg>
          {series.flatMap(({ participant, points }) =>
            points.map((p) => (
              <span
                key={`${participant.id}-${p.round}`}
                aria-hidden
                title={`${participant.persona.name} — Round ${p.round}: ${p.value}`}
                className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
                style={{
                  left: `${x(p.index)}%`,
                  top: `${y(p.value)}%`,
                  backgroundColor: participant.persona.color,
                }}
              />
            )),
          )}
        </div>
      </div>
      <div aria-hidden className="relative ml-9 h-4 text-xs tabular-nums text-fg-muted">
        {rounds.map((r, i) => (
          <span
            key={r.number}
            className="absolute -translate-x-1/2 leading-none"
            style={{ left: `${x(i)}%` }}
          >
            R{r.number}
          </span>
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]" aria-label="Latest confidence">
        {series.map(({ participant, points }) => {
          const last = points[points.length - 1];
          return (
            <li key={participant.id} className="flex min-w-0 items-center gap-1.5">
              <PersonaDot color={participant.persona.color} />
              <span className="truncate text-fg">{participant.persona.name}</span>
              {last !== undefined && (
                <span className="tabular-nums text-fg-muted">{last.value}%</span>
              )}
            </li>
          );
        })}
      </ul>
    </BriefSection>
  );
}
