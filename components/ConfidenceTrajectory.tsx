"use client";

// ─────────────────────────────────────────────────────────────
// Confidence Trajectory — SVG sparkline per participant
// ─────────────────────────────────────────────────────────────

import { useArenaStore } from "@/lib/store";
import { useMemo } from "react";
import { TrajectoryArt } from "./HeroArt";
import { TrendingUp } from "lucide-react";

const WIDTH = 280;
const HEIGHT = 100;
const PADDING_X = 22;
const PADDING_Y = 12;

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
    <div className="glass overflow-hidden">
      <TrajectoryArt className="h-[100px]" />
      <div className="p-5 space-y-3">
        <p className="section-label">
          <TrendingUp className="w-2.5 h-2.5" /> Confidence Trajectory
        </p>
        <div className="rounded-xl bg-black/35 p-3 border border-white/[0.05]">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="w-full h-auto"
            role="img"
            aria-label="Confidence trajectory chart"
          >
            <defs>
              <filter id="ct-line-glow">
                <feGaussianBlur stdDeviation="1.5" />
              </filter>
            </defs>
            <line
              x1={PADDING_X}
              x2={WIDTH - PADDING_X}
              y1={yFor(50)}
              y2={yFor(50)}
              stroke="rgba(77, 122, 199, 0.35)"
              strokeWidth={0.5}
              strokeDasharray="2 3"
            />
            <text x={2} y={yFor(50) + 3} fill="#8B9CB8" fontSize={8} fontFamily="JetBrains Mono">
              50
            </text>
            <text x={2} y={yFor(100) + 3} fill="#8B9CB8" fontSize={8} fontFamily="JetBrains Mono">
              100
            </text>
            <text x={2} y={yFor(0) + 3} fill="#8B9CB8" fontSize={8} fontFamily="JetBrains Mono">
              0
            </text>

            {rounds.map((r, i) => (
              <text
                key={`tick-${r.number}`}
                x={xFor(i)}
                y={HEIGHT - 1}
                fill="#8B9CB8"
                fontSize={7}
                fontFamily="JetBrains Mono"
                textAnchor="middle"
              >
                R{r.number}
              </text>
            ))}

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
                    strokeWidth={2.4}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.55"
                    filter="url(#ct-line-glow)"
                  />
                  <path
                    d={path}
                    stroke={participant.persona.color}
                    strokeWidth={1.6}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {points.map((p, i) => (
                    <g key={i}>
                      <circle cx={xFor(i)} cy={yFor(p)} r={4} fill={participant.persona.color} opacity="0.25" />
                      <circle cx={xFor(i)} cy={yFor(p)} r={2.2} fill={participant.persona.color}>
                        <title>
                          {participant.persona.name} — Round {i + 1}: {p}%
                        </title>
                      </circle>
                    </g>
                  ))}
                </g>
              );
            })}
          </svg>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {series.map(({ participant, points }) => {
            const last = points[points.length - 1];
            return (
              <div
                key={participant.id}
                className="flex items-center gap-1.5 text-[9.5px] font-medium px-2 py-1 rounded-lg"
                style={{
                  backgroundColor: `${participant.persona.color}18`,
                  color: participant.persona.color,
                  border: `1px solid ${participant.persona.color}30`,
                }}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: participant.persona.color,
                    boxShadow: `0 0 6px ${participant.persona.color}`,
                  }}
                />
                <span className="truncate max-w-[80px]">{participant.persona.name}</span>
                {last !== undefined && <span className="font-mono tabular-nums">{last}%</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
