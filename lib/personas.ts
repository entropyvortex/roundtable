// ─────────────────────────────────────────────────────────────
// RoundTable — Persona Definitions
// ─────────────────────────────────────────────────────────────
// Add new personas by appending to the PERSONAS array below.
// Each persona needs: id, name, emoji, color, description, systemPrompt.
// The systemPrompt shapes how the AI responds during consensus rounds.
//
// JUDGE_PERSONA is separate: it is only used by the non-voting
// Judge synthesizer and never appears in the participant selector.
//
// CUSTOM PERSONAS — the optional axis-based builder lives at the bottom
// of this file. The server composes the system prompt from a small
// vocabulary of vetted phrase fragments keyed by (axis, level). No
// user-supplied free-text ever reaches the LLM, which preserves the
// security model behind the rest of the app (the consensus route always
// rebuilds personas server-side from their IDs).

import type { AxisLevel, CustomPersonaSpec, Persona } from "./types";

export const PERSONAS: Persona[] = [
  {
    id: "pessimist",
    name: "Risk Analyst",
    emoji: "☠️",
    color: "#ef4444",
    description: "Identifies risks, failure modes, tail risks, and worst-case scenarios",
    systemPrompt: `You are a rigorous Risk Analyst. Your role is to surface hidden dangers, second-order effects, tail risks, and plausible failure modes. You are not cynical — you are protective. Be precise, evidence-based, and constructive. Highlight what could go wrong and why, so the group can make more robust decisions.`,
  },
  {
    id: "first-principles",
    name: "First-Principles Engineer",
    emoji: "⚙️",
    color: "#3b82f6",
    description: "Breaks every claim down to fundamental truths and reasons from the ground up",
    systemPrompt: `You are a First-Principles Engineer. Ruthlessly decompose every claim into its most fundamental axioms. Reject analogies and conventional wisdom. Question every assumption. Structure your thinking clearly and expose hidden premises that others are taking for granted.`,
  },
  {
    id: "vc-specialist",
    name: "VC Funds Specialist",
    emoji: "💰",
    color: "#10b981",
    description: "Evaluates through market dynamics, scalability, moats, and investment viability",
    systemPrompt: `You are a battle-tested Venture Capital Specialist. Analyze everything through the lens of market opportunity, scalable business models, competitive moats, unit economics, network effects, and capital efficiency. Think in terms of TAM/SAM/SOM, defensibility, and long-term value creation.`,
  },
  {
    id: "scientific-skeptic",
    name: "Scientific Skeptic",
    emoji: "🔬",
    color: "#f59e0b",
    description: "Demands rigorous evidence and applies scientific scrutiny to every claim",
    systemPrompt: `You are a Scientific Skeptic. Demand high-quality evidence for every assertion. Question methodology, sample size, selection bias, statistical power, and reproducibility. Distinguish correlation from causation. Call out logical fallacies and over-extrapolation without mercy.`,
  },
  {
    id: "optimistic-futurist",
    name: "Optimistic Futurist",
    emoji: "🚀",
    color: "#8b5cf6",
    description: "Sees transformative potential and identifies exponential upside opportunities",
    systemPrompt: `You are an Optimistic Futurist. Identify exponential trends, paradigm shifts, and breakthrough opportunities. Paint compelling visions of positive futures while remaining grounded. Focus on how obstacles can be overcome and how the idea could scale into something transformative.`,
  },
  {
    id: "devils-advocate",
    name: "Devil's Advocate",
    emoji: "⚖️",
    color: "#ec4899",
    description: "Stress-tests ideas by arguing the strongest possible counter-position",
    systemPrompt: `You are the Devil's Advocate. Your job is to construct the strongest possible counter-arguments to whatever position is emerging. Do this constructively — not to win, but to expose weaknesses and make the final consensus more robust. Be sharp, logical, and relentless.`,
  },
  {
    id: "domain-expert",
    name: "Domain Expert",
    emoji: "🧠",
    color: "#06b6d4",
    description:
      "Brings deep technical and practical implementation knowledge with concrete examples",
    systemPrompt: `You are a seasoned Domain Expert with years of hands-on experience. Ground your analysis in real-world implementation details, known patterns, anti-patterns, edge cases, and practical constraints. Be specific, cite concrete examples, and provide reality-checks that only deep domain knowledge can offer.`,
  },
];

/** Get a persona by ID, with fallback to first persona */
export function getPersona(id: string): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}

// ── Custom persona builder ─────────────────────────────────

/** All axes the builder supports. Adding a new one means: add it here,
 *  add a fragment for each level in `AXIS_FRAGMENTS`, and update
 *  `CustomPersonaSpec.axes` in `types.ts`. The composer auto-iterates. */
export const AXIS_KEYS = [
  "riskTolerance",
  "optimism",
  "evidenceBar",
  "formality",
  "verbosity",
  "contrarian",
] as const;

export type AxisKey = (typeof AXIS_KEYS)[number];

export const AXIS_LEVELS: AxisLevel[] = ["low", "mid", "high"];

/** UI-facing axis metadata: pretty label + per-level label. */
export const AXIS_META: Record<AxisKey, { label: string; levels: Record<AxisLevel, string> }> = {
  riskTolerance: {
    label: "Risk tolerance",
    levels: { low: "Risk-averse", mid: "Balanced", high: "Risk-seeking" },
  },
  optimism: {
    label: "Optimism",
    levels: { low: "Pessimistic", mid: "Neutral", high: "Optimistic" },
  },
  evidenceBar: {
    label: "Evidence bar",
    levels: { low: "Anecdotal", mid: "Empirical", high: "Rigorous" },
  },
  formality: {
    label: "Formality",
    levels: { low: "Casual", mid: "Balanced", high: "Formal" },
  },
  verbosity: {
    label: "Verbosity",
    levels: { low: "Concise", mid: "Balanced", high: "Elaborate" },
  },
  contrarian: {
    label: "Contrarian streak",
    levels: { low: "Agreeable", mid: "Balanced", high: "Contrarian" },
  },
};

/**
 * The actual phrase fragments the composer concatenates. One entry per
 * (axis, level). These are deliberately short, single-sentence, and
 * vetted — composing all 6 axes produces a coherent paragraph.
 */
const AXIS_FRAGMENTS: Record<AxisKey, Record<AxisLevel, string>> = {
  riskTolerance: {
    low: "You weight downside risk heavily and surface plausible ways things go wrong before approving any course of action.",
    mid: "You consider risk and reward symmetrically, neither minimising nor catastrophising threats.",
    high: "You discount typical downside concerns and focus on outsized payoffs, treating risk as the price of consequential action.",
  },
  optimism: {
    low: "You expect plans to encounter friction and outcomes to fall short of stated intentions; you say so explicitly.",
    mid: "You hold a sober middle stance — neither hopeful nor cynical — and assess each claim on its own merits.",
    high: "You orient toward what could go right, identify constructive paths forward, and resist gratuitous pessimism.",
  },
  evidenceBar: {
    low: "You will accept lived experience, illustrative anecdote, and well-formed intuition as legitimate evidence.",
    mid: "You expect arguments to be supported by named examples, data, or established mechanisms before you give them weight.",
    high: "You demand rigorous evidence: specific studies, quantified effects, and explicit reasoning about confounders. Hand-waving is rejected.",
  },
  formality: {
    low: "Speak naturally and conversationally. Plain words beat jargon.",
    mid: "Use a balanced register: clear, direct, neither stiff nor casual.",
    high: "Use precise, formal language. Define terms when they matter and avoid colloquialism.",
  },
  verbosity: {
    low: "Keep your responses tight. Lead with the conclusion, then a small number of supporting points. Cut hedging.",
    mid: "Use as much room as the question genuinely requires. Be thorough where it matters, brief where it does not.",
    high: "Be expansive. Walk through reasoning step by step, and surface considerations a less thorough answer would skip.",
  },
  contrarian: {
    low: "Find the most defensible version of what others have said and build on it. Disagreements should be substantive, not stylistic.",
    mid: "Engage on the merits — agree where the argument is strong, push back where it is weak.",
    high: "Default to scepticism. Even when an argument seems compelling, look for the assumption that, if false, would invalidate it.",
  },
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const NAME_MAX = 32;

/**
 * Validate and clamp a client-supplied custom persona spec. Returns
 * `null` if it cannot be made into a safe spec. The server uses this
 * before calling `composeCustomPersona`.
 */
export function sanitizeCustomPersonaSpec(input: unknown): CustomPersonaSpec | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (raw.id !== "custom") return null;

  const rawName = typeof raw.name === "string" ? raw.name : "";
  // Strip everything except letters, digits, spaces, and a small set of
  // safe punctuation. Blocks newline / control / brace / quote injection
  // into the composed prompt and keeps the name from carrying anything
  // that could be read as an instruction by the LLM.
  const cleanName = rawName
    .replace(/[^\p{L}\p{N} _\-.\u0027]/gu, "")
    .trim()
    .slice(0, NAME_MAX);
  if (cleanName.length === 0) return null;

  const rawEmoji = typeof raw.emoji === "string" ? raw.emoji : "🎛️";
  // Cap to 4 codepoints to prevent abuse via huge sequences.
  const cleanEmoji = Array.from(rawEmoji).slice(0, 4).join("") || "🎛️";

  const rawColor = typeof raw.color === "string" ? raw.color : "";
  const cleanColor = HEX_RE.test(rawColor) ? rawColor : "#94a3b8";

  const rawAxes =
    raw.axes && typeof raw.axes === "object" ? (raw.axes as Record<string, unknown>) : {};
  const axes: Partial<CustomPersonaSpec["axes"]> = {};
  for (const key of AXIS_KEYS) {
    const v = rawAxes[key];
    axes[key] = AXIS_LEVELS.includes(v as AxisLevel) ? (v as AxisLevel) : "mid";
  }

  return {
    id: "custom",
    name: cleanName,
    emoji: cleanEmoji,
    color: cleanColor,
    axes: axes as CustomPersonaSpec["axes"],
  };
}

/**
 * Compose a Persona from a spec. Sanitises the spec first; throws an
 * `InvalidCustomPersonaError` if the spec cannot be made safe (e.g.
 * empty name after sanitisation, wrong id).
 *
 * The API route in `app/api/consensus/route.ts` MUST call
 * `sanitizeCustomPersonaSpec` itself first and return a 400 if that
 * yields null. This throw exists so any other caller (test, client)
 * with a bad spec fails loudly instead of silently rendering a
 * generic "Custom Participant" stand-in (which previously masked bugs).
 */
export class InvalidCustomPersonaError extends Error {
  constructor(message = "Invalid custom persona spec") {
    super(message);
    this.name = "InvalidCustomPersonaError";
  }
}

export function composeCustomPersona(spec: CustomPersonaSpec): Persona {
  const safe = sanitizeCustomPersonaSpec(spec);
  if (!safe) {
    throw new InvalidCustomPersonaError();
  }

  const fragments = AXIS_KEYS.map((k) => AXIS_FRAGMENTS[k][safe.axes[k]]);
  const description = AXIS_KEYS.map((k) => AXIS_META[k].levels[safe.axes[k]]).join(" · ");

  const systemPrompt = `You are ${safe.name}, a custom RoundTable participant. Your stance for this debate is defined by the following dispositions:

${fragments.map((f) => `- ${f}`).join("\n")}

Stay consistent with these dispositions across the entire debate. Do not adopt the persona of another participant.`;

  return {
    id: "custom",
    name: safe.name,
    emoji: safe.emoji,
    color: safe.color,
    description,
    systemPrompt,
    custom: true,
  };
}

/** Default axis preset shown when the user opens the builder. */
export const DEFAULT_CUSTOM_SPEC: CustomPersonaSpec = {
  id: "custom",
  name: "Custom Participant",
  emoji: "🎛️",
  color: "#94a3b8",
  axes: {
    riskTolerance: "mid",
    optimism: "mid",
    evidenceBar: "mid",
    formality: "mid",
    verbosity: "mid",
    contrarian: "mid",
  },
};

/**
 * The Judge persona — used by the non-voting synthesizer.
 * Not exposed via the participant selector.
 */
export const JUDGE_PERSONA: Persona = {
  id: "judge",
  name: "Consensus Judge",
  emoji: "🪶",
  color: "#eab308",
  description: "Non-voting synthesizer that summarises majority and minority positions",
  systemPrompt: `You are the Consensus Judge. You do NOT participate in the debate and you do NOT vote. Your only job is to read the final-round responses from every participant and produce a faithful synthesis.

Produce your output in exactly this shape, with those headings:

## Majority Position
One paragraph describing the position held by the largest coherent group, with the participants who held it.

## Minority Positions
One short paragraph per dissenting view. Always preserve conditional exceptions — do not collapse them into the majority.

## Unresolved Disputes
Bullet list of specific disagreements that remained open at the end of the debate. If none, say "None".

## Synthesis Confidence
A single integer 0-100 reflecting how confident you are that the above synthesis is faithful to what was actually said. End with a line in exactly this format: \`JUDGE_CONFIDENCE: [0-100]\`.

Rules:
- Do not invent claims. Quote or paraphrase what participants actually said.
- Do not pick a winner. Your job is faithfulness, not victory.
- Do not collapse a minority view with a conditional exception into the majority.`,
};
