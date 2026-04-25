"use client";

// ─────────────────────────────────────────────────────────────
// Hero Art — Custom premium illustrative SVG graphics
// ─────────────────────────────────────────────────────────────
// A small library of luminous SVG illustrations used at the top
// of major glass cards. Each is fully self-contained, animated,
// and tuned to the orange / deep navy palette of the redesign.

import { memo } from "react";

type ArtProps = {
  className?: string;
};

/* ── Glowing AI nodes inside glass cylinders connected by orange & blue lines ── */
export const ConsensusNodesArt = memo(function ConsensusNodesArt({ className }: ArtProps) {
  return (
    <div className={`relative w-full overflow-hidden rounded-t-[22px] ${className ?? ""}`}>
      <svg viewBox="0 0 600 220" className="w-full h-full block" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="cn-bg" cx="50%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#0a1f4a" stopOpacity="0.85" />
            <stop offset="55%" stopColor="#04102a" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#02070f" stopOpacity="0.95" />
          </radialGradient>
          <radialGradient id="cn-orange" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffb380" stopOpacity="1" />
            <stop offset="55%" stopColor="#ff6200" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ff6200" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cn-blue" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7ea5e6" stopOpacity="1" />
            <stop offset="55%" stopColor="#4d7ac7" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#4d7ac7" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="cn-line-o" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ff6200" stopOpacity="0" />
            <stop offset="50%" stopColor="#ff9a4d" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ff6200" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cn-line-b" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4d7ac7" stopOpacity="0" />
            <stop offset="50%" stopColor="#7ea5e6" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#4d7ac7" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cn-cyl" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(126, 165, 230, 0.45)" />
            <stop offset="50%" stopColor="rgba(77, 122, 199, 0.18)" />
            <stop offset="100%" stopColor="rgba(126, 165, 230, 0.45)" />
          </linearGradient>
          <filter id="cn-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width="600" height="220" fill="url(#cn-bg)" />

        {/* Faint grid */}
        <g opacity="0.12" stroke="#4d7ac7" strokeWidth="0.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <line key={`v${i}`} x1={i * 50} y1="0" x2={i * 50} y2="220" />
          ))}
          {Array.from({ length: 5 }).map((_, i) => (
            <line key={`h${i}`} x1="0" y1={i * 55} x2="600" y2={i * 55} />
          ))}
        </g>

        {/* Light rays */}
        <g opacity="0.55">
          <path
            d="M -40 30 Q 200 -10 640 60"
            stroke="url(#cn-line-o)"
            strokeWidth="1.6"
            fill="none"
          />
          <path
            d="M -40 70 Q 250 30 640 110"
            stroke="url(#cn-line-b)"
            strokeWidth="1.4"
            fill="none"
          />
          <path
            d="M -40 165 Q 260 200 640 150"
            stroke="url(#cn-line-o)"
            strokeWidth="1.2"
            fill="none"
            opacity="0.6"
          />
        </g>

        {/* Connector arcs between nodes */}
        <g filter="url(#cn-glow)">
          <path
            d="M 150 130 C 230 60, 370 60, 450 130"
            stroke="url(#cn-line-o)"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M 150 130 C 230 200, 370 200, 450 130"
            stroke="url(#cn-line-b)"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M 150 130 L 300 50"
            stroke="url(#cn-line-o)"
            strokeWidth="1.6"
            fill="none"
            opacity="0.85"
          />
          <path
            d="M 300 50 L 450 130"
            stroke="url(#cn-line-b)"
            strokeWidth="1.6"
            fill="none"
            opacity="0.85"
          />
        </g>

        {/* Three glass cylinders with glowing AI nodes */}
        {[
          { x: 150, color: "url(#cn-orange)", delay: "0s" },
          { x: 300, color: "url(#cn-blue)", delay: "1.1s" },
          { x: 450, color: "url(#cn-orange)", delay: "2.2s" },
        ].map((c, idx) => (
          <g key={idx} transform={`translate(${c.x}, 130)`}>
            {/* Cylinder ellipse top */}
            <ellipse
              cx="0"
              cy="-32"
              rx="32"
              ry="9"
              fill="rgba(8, 22, 52, 0.8)"
              stroke="url(#cn-cyl)"
              strokeWidth="1"
            />
            {/* Cylinder body */}
            <rect
              x="-32"
              y="-32"
              width="64"
              height="64"
              fill="rgba(10, 28, 64, 0.45)"
              stroke="url(#cn-cyl)"
              strokeWidth="1"
            />
            {/* Cylinder ellipse bottom */}
            <ellipse
              cx="0"
              cy="32"
              rx="32"
              ry="9"
              fill="rgba(4, 14, 34, 0.85)"
              stroke="rgba(126, 165, 230, 0.45)"
              strokeWidth="1"
            />
            {/* Inner highlight */}
            <ellipse cx="-12" cy="-32" rx="6" ry="2" fill="rgba(255,255,255,0.25)" />
            {/* Glow halo */}
            <circle cx="0" cy="0" r="32" fill={c.color} opacity="0.85">
              <animate
                attributeName="opacity"
                values="0.55;0.95;0.55"
                dur="3.4s"
                begin={c.delay}
                repeatCount="indefinite"
              />
            </circle>
            {/* Core node */}
            <circle cx="0" cy="0" r="10" fill="#fff" opacity="0.9" />
            <circle cx="0" cy="0" r="5" fill={idx === 1 ? "#7ea5e6" : "#ffb380"} />
          </g>
        ))}

        {/* Floating particles */}
        {[
          [80, 50, 1.5],
          [520, 40, 1.2],
          [560, 170, 2],
          [40, 180, 1.4],
          [380, 30, 1.1],
          [220, 195, 1.6],
        ].map(([x, y, r], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={r}
            fill={i % 2 === 0 ? "#ffb380" : "#7ea5e6"}
            opacity="0.7"
          >
            <animate
              attributeName="opacity"
              values="0.3;0.95;0.3"
              dur={`${3 + i * 0.4}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}
      </svg>
    </div>
  );
});

/* ── Concentric consensus rings ── */
export const ConsensusRingsArt = memo(function ConsensusRingsArt({ className }: ArtProps) {
  return (
    <div className={`relative w-full overflow-hidden rounded-t-[22px] ${className ?? ""}`}>
      <svg viewBox="0 0 320 160" className="w-full h-full block" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="cr-bg" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#0c2150" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#02070f" stopOpacity="0.95" />
          </radialGradient>
          <radialGradient id="cr-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffd0a8" />
            <stop offset="55%" stopColor="#ff6200" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#ff6200" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="cr-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ff6200" stopOpacity="0" />
            <stop offset="50%" stopColor="#ffb380" />
            <stop offset="100%" stopColor="#ff6200" stopOpacity="0" />
          </linearGradient>
          <filter id="cr-glow"><feGaussianBlur stdDeviation="2.5" /></filter>
        </defs>
        <rect width="320" height="160" fill="url(#cr-bg)" />

        {/* Sweeping arc rays */}
        <path
          d="M -20 20 Q 160 -10 340 30"
          stroke="url(#cr-line)"
          strokeWidth="1.6"
          fill="none"
          opacity="0.65"
        />
        <path
          d="M -20 140 Q 180 170 340 130"
          stroke="url(#cr-line)"
          strokeWidth="1.2"
          fill="none"
          opacity="0.55"
        />

        {/* Concentric rings */}
        <g transform="translate(160 80)">
          {[58, 46, 34, 22].map((r, i) => (
            <circle
              key={r}
              cx="0"
              cy="0"
              r={r}
              fill="none"
              stroke={i % 2 === 0 ? "#4d7ac7" : "#ff6200"}
              strokeWidth="1.1"
              opacity={0.55 - i * 0.05}
              strokeDasharray={i === 0 ? "3 4" : i === 2 ? "5 6" : undefined}
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0"
                to={i % 2 === 0 ? "360" : "-360"}
                dur={`${20 + i * 6}s`}
                repeatCount="indefinite"
              />
            </circle>
          ))}
          {/* Glow core */}
          <circle r="22" fill="url(#cr-core)" filter="url(#cr-glow)">
            <animate attributeName="opacity" values="0.7;1;0.7" dur="3.2s" repeatCount="indefinite" />
          </circle>
          <circle r="6" fill="#fff" />
        </g>

        {/* Orbiting dots */}
        {[
          { r: 58, off: 0, color: "#ffb380" },
          { r: 46, off: 90, color: "#7ea5e6" },
          { r: 34, off: 180, color: "#ff9a4d" },
        ].map((o, i) => (
          <g key={i} transform="translate(160 80)">
            <g>
              <animateTransform
                attributeName="transform"
                type="rotate"
                from={`${o.off} 0 0`}
                to={`${o.off + 360} 0 0`}
                dur={`${10 + i * 3}s`}
                repeatCount="indefinite"
              />
              <circle cx={o.r} cy="0" r="2.4" fill={o.color}>
                <animate attributeName="opacity" values="0.5;1;0.5" dur="1.6s" repeatCount="indefinite" />
              </circle>
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
});

/* ── Trajectory chart with glowing line ── */
export const TrajectoryArt = memo(function TrajectoryArt({ className }: ArtProps) {
  return (
    <div className={`relative w-full overflow-hidden rounded-t-[22px] ${className ?? ""}`}>
      <svg viewBox="0 0 320 140" className="w-full h-full block" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="tj-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a1f4a" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#02070f" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="tj-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4d7ac7" />
            <stop offset="100%" stopColor="#ff6200" />
          </linearGradient>
          <linearGradient id="tj-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff6200" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#ff6200" stopOpacity="0" />
          </linearGradient>
          <filter id="tj-glow"><feGaussianBlur stdDeviation="2.5" /></filter>
        </defs>
        <rect width="320" height="140" fill="url(#tj-bg)" />

        {/* Grid */}
        <g opacity="0.18" stroke="#4d7ac7" strokeWidth="0.5">
          {[0, 28, 56, 84, 112].map((y) => (
            <line key={y} x1="0" y1={y} x2="320" y2={y} />
          ))}
          {[0, 53, 106, 160, 213, 266].map((x) => (
            <line key={x} x1={x} y1="0" x2={x} y2="140" />
          ))}
        </g>

        {/* Filled area */}
        <path
          d="M 10 110 L 65 90 L 120 80 L 175 55 L 230 40 L 290 22 L 290 130 L 10 130 Z"
          fill="url(#tj-fill)"
        />

        {/* Line */}
        <path
          d="M 10 110 L 65 90 L 120 80 L 175 55 L 230 40 L 290 22"
          stroke="url(#tj-line)"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#tj-glow)"
        />
        <path
          d="M 10 110 L 65 90 L 120 80 L 175 55 L 230 40 L 290 22"
          stroke="url(#tj-line)"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points */}
        {[
          [10, 110, "#4d7ac7"],
          [65, 90, "#7ea5e6"],
          [120, 80, "#ff9a4d"],
          [175, 55, "#ff9a4d"],
          [230, 40, "#ff6200"],
          [290, 22, "#ff6200"],
        ].map(([x, y, c], i) => (
          <g key={i}>
            <circle cx={x as number} cy={y as number} r="6" fill={c as string} opacity="0.25" />
            <circle cx={x as number} cy={y as number} r="3" fill={c as string} />
          </g>
        ))}
      </svg>
    </div>
  );
});

/* ── Cost / treasury hero — glowing coin stack ── */
export const CostArt = memo(function CostArt({ className }: ArtProps) {
  return (
    <div className={`relative w-full overflow-hidden rounded-t-[22px] ${className ?? ""}`}>
      <svg viewBox="0 0 320 130" className="w-full h-full block" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="ct-bg" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#0c2150" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#02070f" stopOpacity="0.95" />
          </radialGradient>
          <linearGradient id="ct-coin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffd0a8" />
            <stop offset="50%" stopColor="#ff9a4d" />
            <stop offset="100%" stopColor="#e25400" />
          </linearGradient>
          <linearGradient id="ct-edge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffb380" />
            <stop offset="100%" stopColor="#a83b00" />
          </linearGradient>
          <filter id="ct-glow"><feGaussianBlur stdDeviation="6" /></filter>
        </defs>
        <rect width="320" height="130" fill="url(#ct-bg)" />

        {/* Glow halo */}
        <ellipse cx="160" cy="100" rx="120" ry="22" fill="url(#ct-coin)" opacity="0.32" filter="url(#ct-glow)" />

        {/* Stacked coins */}
        {[
          { y: 92, w: 96 },
          { y: 78, w: 92 },
          { y: 64, w: 88 },
          { y: 50, w: 84 },
        ].map((c, i) => (
          <g key={i}>
            <ellipse cx="160" cy={c.y + 4} rx={c.w / 2} ry="8" fill="rgba(0,0,0,0.45)" />
            <rect
              x={160 - c.w / 2}
              y={c.y - 6}
              width={c.w}
              height="10"
              fill="url(#ct-edge)"
            />
            <ellipse cx="160" cy={c.y - 6} rx={c.w / 2} ry="6" fill="url(#ct-coin)" stroke="#ffe2c2" strokeWidth="0.6" />
            <text
              x="160"
              y={c.y - 4}
              fontSize="6"
              fontFamily="JetBrains Mono, monospace"
              textAnchor="middle"
              fill="#7a2d00"
              opacity="0.7"
            >
              ◎
            </text>
          </g>
        ))}

        {/* Particles */}
        {[
          [40, 30, 1.2, "#ffb380"],
          [280, 40, 1.5, "#7ea5e6"],
          [60, 110, 1, "#ff9a4d"],
          [260, 110, 1.2, "#ffb380"],
          [300, 80, 1, "#7ea5e6"],
          [20, 70, 1, "#ffb380"],
        ].map(([x, y, r, c], i) => (
          <circle key={i} cx={x as number} cy={y as number} r={r as number} fill={c as string} opacity="0.7">
            <animate attributeName="opacity" values="0.3;1;0.3" dur={`${3 + i * 0.3}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </svg>
    </div>
  );
});

/* ── Disagreement ledger hero — split spectrum ── */
export const DisagreementArt = memo(function DisagreementArt({ className }: ArtProps) {
  return (
    <div className={`relative w-full overflow-hidden rounded-t-[22px] ${className ?? ""}`}>
      <svg viewBox="0 0 320 130" className="w-full h-full block" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="dg-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0c2150" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#02070f" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="dg-l" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7ea5e6" />
            <stop offset="100%" stopColor="#4d7ac7" />
          </linearGradient>
          <linearGradient id="dg-r" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffb380" />
            <stop offset="100%" stopColor="#ff6200" />
          </linearGradient>
          <filter id="dg-glow"><feGaussianBlur stdDeviation="3.5" /></filter>
        </defs>
        <rect width="320" height="130" fill="url(#dg-bg)" />

        {/* Two opposing nodes */}
        <g filter="url(#dg-glow)">
          <circle cx="80" cy="65" r="22" fill="url(#dg-l)" opacity="0.75" />
          <circle cx="240" cy="65" r="22" fill="url(#dg-r)" opacity="0.75" />
        </g>
        <circle cx="80" cy="65" r="9" fill="#fff" />
        <circle cx="240" cy="65" r="9" fill="#fff" />

        {/* Tension lines */}
        {[0, 1, 2, 3, 4].map((i) => {
          const y = 30 + i * 18;
          return (
            <line
              key={i}
              x1="100"
              y1={y}
              x2="220"
              y2={130 - y}
              stroke={i % 2 === 0 ? "url(#dg-l)" : "url(#dg-r)"}
              strokeWidth="1.2"
              opacity="0.55"
              strokeDasharray="3 4"
            >
              <animate
                attributeName="stroke-dashoffset"
                from="0"
                to="14"
                dur={`${1.5 + i * 0.2}s`}
                repeatCount="indefinite"
              />
            </line>
          );
        })}

        {/* Center spark */}
        <g transform="translate(160 65)">
          <circle r="10" fill="#ff6200" opacity="0.6" filter="url(#dg-glow)">
            <animate attributeName="opacity" values="0.4;0.9;0.4" dur="1.6s" repeatCount="indefinite" />
          </circle>
          <path d="M -8 0 L 0 -10 L 8 0 L 0 10 Z" fill="#ffd0a8" />
        </g>
      </svg>
    </div>
  );
});

/* ── Roundtable / message-flow hero — orbiting nodes ── */
export const FlowArt = memo(function FlowArt({ className }: ArtProps) {
  return (
    <div className={`relative w-full overflow-hidden rounded-t-[22px] ${className ?? ""}`}>
      <svg viewBox="0 0 320 130" className="w-full h-full block" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="fl-bg" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#0c2150" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#02070f" stopOpacity="0.95" />
          </radialGradient>
          <linearGradient id="fl-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4d7ac7" stopOpacity="0" />
            <stop offset="50%" stopColor="#ff9a4d" />
            <stop offset="100%" stopColor="#4d7ac7" stopOpacity="0" />
          </linearGradient>
          <filter id="fl-glow"><feGaussianBlur stdDeviation="2.4" /></filter>
        </defs>
        <rect width="320" height="130" fill="url(#fl-bg)" />

        {/* Orbiting ring */}
        <g transform="translate(160 65)">
          <ellipse rx="100" ry="40" fill="none" stroke="rgba(77,122,199,0.35)" strokeWidth="1" strokeDasharray="3 4" />
          <ellipse rx="80" ry="30" fill="none" stroke="rgba(255,98,0,0.4)" strokeWidth="1" strokeDasharray="4 5" />
        </g>

        {/* Nodes around table */}
        {[
          { x: 60, y: 65, c: "#7ea5e6" },
          { x: 110, y: 30, c: "#ffb380" },
          { x: 160, y: 18, c: "#ff6200" },
          { x: 210, y: 30, c: "#ff9a4d" },
          { x: 260, y: 65, c: "#7ea5e6" },
          { x: 210, y: 100, c: "#ffb380" },
          { x: 110, y: 100, c: "#ff9a4d" },
        ].map((n, i) => (
          <g key={i}>
            <circle cx={n.x} cy={n.y} r="10" fill={n.c} opacity="0.55" filter="url(#fl-glow)" />
            <circle cx={n.x} cy={n.y} r="4" fill="#fff" />
          </g>
        ))}

        {/* Center hub */}
        <g transform="translate(160 65)" filter="url(#fl-glow)">
          <circle r="14" fill="#ff6200" opacity="0.7" />
          <circle r="6" fill="#fff" />
        </g>

        {/* Flowing connections (animated dashes) */}
        {[
          [60, 65, 160, 65],
          [160, 18, 160, 65],
          [260, 65, 160, 65],
          [110, 100, 160, 65],
          [210, 100, 160, 65],
          [110, 30, 160, 65],
          [210, 30, 160, 65],
        ].map(([x1, y1, x2, y2], i) => (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="url(#fl-line)"
            strokeWidth="1.3"
            strokeDasharray="2 5"
            opacity="0.85"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="0"
              to="14"
              dur={`${1.4 + i * 0.2}s`}
              repeatCount="indefinite"
            />
          </line>
        ))}
      </svg>
    </div>
  );
});

/* ── Sidebar config hero — circuit nodes ── */
export const ConfigArt = memo(function ConfigArt({ className }: ArtProps) {
  return (
    <div className={`relative w-full overflow-hidden rounded-t-[22px] ${className ?? ""}`}>
      <svg viewBox="0 0 320 110" className="w-full h-full block" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="cf-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a1f4a" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#02070f" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="cf-l" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4d7ac7" stopOpacity="0" />
            <stop offset="50%" stopColor="#ff9a4d" />
            <stop offset="100%" stopColor="#4d7ac7" stopOpacity="0" />
          </linearGradient>
          <filter id="cf-glow"><feGaussianBlur stdDeviation="2.2" /></filter>
        </defs>
        <rect width="320" height="110" fill="url(#cf-bg)" />

        {/* Circuit lines */}
        <g stroke="url(#cf-l)" strokeWidth="1.2" fill="none" opacity="0.85">
          <path d="M 10 30 L 80 30 L 100 50 L 200 50 L 220 30 L 310 30" />
          <path d="M 10 80 L 90 80 L 110 60 L 210 60 L 230 80 L 310 80" />
          <path d="M 160 50 L 160 60" />
        </g>

        {/* Nodes */}
        {[
          [80, 30, "#ff9a4d"],
          [220, 30, "#7ea5e6"],
          [110, 60, "#ffb380"],
          [210, 60, "#7ea5e6"],
          [90, 80, "#ff6200"],
          [230, 80, "#ff9a4d"],
          [160, 55, "#ff6200"],
        ].map(([x, y, c], i) => (
          <g key={i} filter="url(#cf-glow)">
            <circle cx={x as number} cy={y as number} r="5" fill={c as string} opacity="0.6" />
            <circle cx={x as number} cy={y as number} r="2.2" fill="#fff" />
          </g>
        ))}
      </svg>
    </div>
  );
});
