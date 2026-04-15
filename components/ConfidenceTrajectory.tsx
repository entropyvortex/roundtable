"use client";

// ─────────────────────────────────────────────────────────────
// Confidence Trajectory — SVG sparkline per participant
// ─────────────────────────────────────────────────────────────
// Reads rounds + participants from the store, then draws a single
// miniature chart with one line per participant. Hovering a line
// highlights its current value. No chart library — plain SVG.

import { useArenaStore } from "@/lib/store";
import { useMemo } from "react";
import { TrendingUp } from "lucide-react";

const WIDTH = 280;
const HEIGHT = 90;
const PADDING_X = 18;
const PADDING_Y = 10;

export default function ConfidenceTrajectory() {
  const rounds = useArenaStore((s) => s.rounds);
  const participants = useArenaStore((s) => s.participants);

  const series = useMemo(() => {
    return participants.map((p) => {
      const points = rounds
        .map((r) => r.responses.find((x) => x.participantId === p.id))
        .filter((x) => x !== undefined)
        .map((x) => x!.confidence);
      return { participant: p, points };
    });
  }, [participants, rounds]);

  const maxRounds = rounds.length;
  if (maxRounds < 1 || series.every((s) => s.points.length === 0)) {
    return null;
  }

  const xFor = (i: number) => {
    if (maxRounds === 1) return WIDTH / 2;
    return PADDING_X + (i / (maxRounds - 1)) * (WIDTH - PADDING_X * 2);
  };
  const yFor = (v: number) => PADDING_Y + (1 - v / 100) * (HEIGHT - PADDING_Y * 2);

  return (
    <div className="rounded-xl border border-arena-border/60 bg-arena-surface/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-3.5 h-3.5 text-arena-accent" />
        <h4 className="text-[10px] font-semibold text-arena-muted uppercase tracking-[0.15em]">
          Confidence Trajectory
        </h4>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label="Confidence trajectory chart"
      >
        {/* Axis — 50% and 100% reference lines */}
        <line
          x1={PADDING_X}
          x2={WIDTH - PADDING_X}
          y1={yFor(50)}
          y2={yFor(50)}
          stroke="#334155"
          strokeWidth={0.5}
          strokeDasharray="2 3"
        />
        <text x={2} y={yFor(50) + 3} fill="#64748b" fontSize={8} fontFamily="monospace">
          50
        </text>
        <text x={2} y={yFor(100) + 3} fill="#64748b" fontSize={8} fontFamily="monospace">
          100
        </text>
        <text x={2} y={yFor(0) + 3} fill="#64748b" fontSize={8} fontFamily="monospace">
          0
        </text>

        {/* Round x-axis ticks */}
        {rounds.map((r, i) => (
          <text
            key={`tick-${r.number}`}
            x={xFor(i)}
            y={HEIGHT - 1}
            fill="#64748b"
            fontSize={7}
            fontFamily="monospace"
            textAnchor="middle"
          >
            R{r.number}
          </text>
        ))}

        {/* One polyline per participant */}
        {series.map(({ participant, points }) => {
          if (points.length === 0) return null;
          const path = points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p).toFixed(1)}`)
            .join(" ");
          return (
            <g key={participant.id}>
              <path
                d={path}
                stroke={participant.persona.color}
                strokeWidth={1.6}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {points.map((p, i) => (
                <circle key={i} cx={xFor(i)} cy={yFor(p)} r={2} fill={participant.persona.color}>
                  <title>
                    {participant.persona.name} — Round {i + 1}: {p}%
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-1.5">
        {series.map(({ participant, points }) => {
          const last = points[points.length - 1];
          return (
            <div
              key={participant.id}
              className="flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-md"
              style={{
                backgroundColor: `${participant.persona.color}15`,
                color: participant.persona.color,
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: participant.persona.color }}
              />
              <span className="truncate max-w-[80px]">{participant.persona.name}</span>
              {last !== undefined && <span className="font-mono tabular-nums">{last}%</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
