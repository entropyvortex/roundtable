// ─────────────────────────────────────────────────────────────
// Shared test fixture — a realistic completed CVP run
// ─────────────────────────────────────────────────────────────
// 3 participants (cross-provider), 4 rounds, judge synthesis, and
// 2 claim-level contradictions with quotes that verify against the
// response bodies. Used by run-view tests and by the visual
// verification permalink (encode with `encodeSnapshotToHash`).

import type { Participant, SessionSnapshot } from "@/lib/types";
import { PERSONAS } from "@/lib/personas";

const persona = (id: string) => {
  const p = PERSONAS.find((x) => x.id === id);
  if (!p) throw new Error(`fixture: unknown persona ${id}`);
  return p;
};

export const FIXTURE_PARTICIPANTS: Participant[] = [
  {
    id: "p-1",
    modelInfo: {
      id: "grok:grok-4-fast-reasoning",
      providerId: "grok",
      providerName: "Grok",
      modelId: "grok-4-fast-reasoning",
      preferred: true,
    },
    persona: persona("pessimist"),
  },
  {
    id: "p-2",
    modelInfo: {
      id: "claude:claude-sonnet-4-20250514",
      providerId: "claude",
      providerName: "Claude",
      modelId: "claude-sonnet-4-20250514",
      preferred: true,
    },
    persona: persona("optimistic-futurist"),
  },
  {
    id: "p-3",
    modelInfo: {
      id: "openai:gpt-4o",
      providerId: "openai",
      providerName: "OpenAI",
      modelId: "gpt-4o",
      preferred: true,
    },
    persona: persona("first-principles"),
  },
];

const usage = (inTok: number, outTok: number, cost: number) => ({
  inputTokens: inTok,
  outputTokens: outTok,
  totalTokens: inTok + outTok,
  estimatedCostUSD: cost,
});

const T0 = 1_780_000_000_000;

const R1_RISK = `## Initial analysis

Microservices introduce distributed-systems complexity — network partitions, eventual consistency, deployment orchestration — **before the team has validated product-market fit**. Premature architecture is a top-5 startup killer.

- Every service boundary is a contract you now have to version.
- On-call load scales with the number of deployables, not with revenue.

CONFIDENCE: 85`;

const R1_FUT = `## Initial analysis

Starting with microservices positions the team for scale from day one. The tooling has matured — Kubernetes, service meshes, and managed cloud services reduce the operational burden significantly.

Teams that design for independent deployability early avoid the "big rewrite" that so often stalls a scaling company.

CONFIDENCE: 75`;

const R1_FPE = `## Initial analysis

The question conflates *architecture* with *deployment strategy*. A modular monolith can be decomposed later. The real constraint is team size — a 3-person team cannot operate 8 services.

Axioms:
1. Coordination cost grows with the number of independently deployed units.
2. Module boundaries are cheaper to change inside one process than across a network.

CONFIDENCE: 90`;

const R2_RISK = `The Optimistic Futurist overstates tooling maturity. Kubernetes is not "reduced complexity" — it is *traded* complexity. Agree with First-Principles on the team-size constraint. Revising slightly upward.

CONFIDENCE: 88`;

const R2_FUT = `The First-Principles argument about modular monoliths is valid. However, decomposing a monolith later is not free — the argument assumes clean module boundaries that rarely exist in practice. Lowering confidence.

CONFIDENCE: 65`;

const R2_FPE = `Risk Analyst's point about premature optimisation aligns with my position. The Futurist raises a fair concern about decomposition cost, but this is solvable with discipline. Maintaining position.

CONFIDENCE: 88`;

const R3_RISK = `Evidence pattern across rounds: 2 of 3 participants favour monolith-first. The tooling argument was partially conceded. Remaining disagreement is about decomposition cost — a real but secondary concern.

CONFIDENCE: 90`;

const R3_FUT = `I concede the monolith-first approach is lower-risk for most startups. My position narrows to: startups with **known scale requirements** (real-time data pipelines, multi-region from day one) may justify early microservices.

CONFIDENCE: 70`;

const R3_FPE = `Consensus is forming around monolith-first with clean boundaries. The Futurist's exception for known-scale cases is reasonable and worth noting explicitly.

CONFIDENCE: 92`;

const R4_RISK = `**Final position.** Monolith first. Decompose only when a specific service has a demonstrated, divergent scaling or deployment need. The Futurist's exception is legitimate but rare.

CONFIDENCE: 91`;

const R4_FUT = `**Final position.** Monolith first for most teams, with an explicit carve-out: when the product's core is a known high-scale pipeline, design the pipeline as a separate service from day one.

CONFIDENCE: 72`;

const R4_FPE = `**Final position.** Modular monolith with enforced module boundaries; extract services only under measured pressure. The decomposition-cost objection is real and should be mitigated with boundary tests from the start.

CONFIDENCE: 93`;

export const FIXTURE_SNAPSHOT: SessionSnapshot = {
  v: 1,
  prompt:
    "Should an early-stage startup use a microservices architecture from day one, or begin with a modular monolith and decompose later? Consider team size, operational complexity, and product-market-fit risk.",
  engine: "cvp",
  options: {
    engine: "cvp",
    rounds: 5,
    randomizeOrder: true,
    blindFirstRound: true,
    earlyStop: true,
    judgeEnabled: true,
    judgeModelId: "claude:claude-sonnet-4-20250514",
    extractClaimsEnabled: true,
    costCapUSD: 5,
  },
  participants: FIXTURE_PARTICIPANTS,
  rounds: [
    {
      number: 1,
      type: "initial-analysis",
      label: "Initial Analysis",
      consensusScore: 80,
      responses: [
        {
          participantId: "p-1",
          roundNumber: 1,
          content: R1_RISK,
          confidence: 85,
          timestamp: T0 + 12_000,
          durationMs: 11_800,
          usage: usage(420, 260, 0.0021),
        },
        {
          participantId: "p-2",
          roundNumber: 1,
          content: R1_FUT,
          confidence: 75,
          timestamp: T0 + 13_000,
          durationMs: 12_400,
          usage: usage(420, 210, 0.0044),
        },
        {
          participantId: "p-3",
          roundNumber: 1,
          content: R1_FPE,
          confidence: 90,
          timestamp: T0 + 14_000,
          durationMs: 13_100,
          usage: usage(420, 240, 0.0035),
        },
      ],
    },
    {
      number: 2,
      type: "counterarguments",
      label: "Counterarguments",
      consensusScore: 77,
      responses: [
        {
          participantId: "p-3",
          roundNumber: 2,
          content: R2_FPE,
          confidence: 88,
          timestamp: T0 + 30_000,
          durationMs: 9_000,
          usage: usage(1_300, 150, 0.0048),
        },
        {
          participantId: "p-1",
          roundNumber: 2,
          content: R2_RISK,
          confidence: 88,
          timestamp: T0 + 40_000,
          durationMs: 9_600,
          usage: usage(1_500, 140, 0.0029),
        },
        {
          participantId: "p-2",
          roundNumber: 2,
          content: R2_FUT,
          confidence: 65,
          timestamp: T0 + 50_000,
          durationMs: 10_200,
          usage: usage(1_700, 160, 0.0075),
        },
      ],
    },
    {
      number: 3,
      type: "evidence-assessment",
      label: "Evidence Assessment",
      consensusScore: 79,
      responses: [
        {
          participantId: "p-2",
          roundNumber: 3,
          content: R3_FUT,
          confidence: 70,
          timestamp: T0 + 65_000,
          durationMs: 10_800,
          usage: usage(2_300, 170, 0.0094),
        },
        {
          participantId: "p-3",
          roundNumber: 3,
          content: R3_FPE,
          confidence: 92,
          timestamp: T0 + 76_000,
          durationMs: 8_900,
          usage: usage(2_500, 120, 0.0075),
        },
        {
          participantId: "p-1",
          roundNumber: 3,
          content: R3_RISK,
          confidence: 90,
          timestamp: T0 + 86_000,
          durationMs: 9_900,
          usage: usage(2_700, 130, 0.0044),
        },
      ],
    },
    {
      number: 4,
      type: "synthesis",
      label: "Final Synthesis",
      consensusScore: 80,
      responses: [
        {
          participantId: "p-1",
          roundNumber: 4,
          content: R4_RISK,
          confidence: 91,
          timestamp: T0 + 100_000,
          durationMs: 8_400,
          usage: usage(3_200, 120, 0.0049),
        },
        {
          participantId: "p-3",
          roundNumber: 4,
          content: R4_FPE,
          confidence: 93,
          timestamp: T0 + 110_000,
          durationMs: 8_700,
          usage: usage(3_400, 130, 0.0098),
        },
        {
          participantId: "p-2",
          roundNumber: 4,
          content: R4_FUT,
          confidence: 72,
          timestamp: T0 + 120_000,
          durationMs: 9_300,
          usage: usage(3_600, 140, 0.0129),
        },
      ],
    },
  ],
  finalScore: 80,
  finalSummary: "Consensus reached after 4 rounds (early stop: delta 1).",
  judge: {
    modelId: "claude-sonnet-4-20250514",
    providerName: "Claude",
    content: `## Majority Position
Start with a modular monolith with enforced module boundaries. Extract services only when a specific component shows measured, divergent scaling or deployment needs.

## Minority Positions
The Optimistic Futurist holds a conditional exception: when the product's core is a known high-scale pipeline, that pipeline should be a separate service from day one.

## Unresolved Disputes
The true cost of later decomposition remains contested. The Risk Analyst and First-Principles Engineer see it as manageable with discipline; the Futurist sees it as routinely underestimated.

## Synthesis Confidence
High. Positions converged over four rounds and the remaining disagreement is scoped to a narrow, explicitly stated exception.`,
    majorityPosition:
      "Start with a modular monolith with enforced module boundaries. Extract services only when a specific component shows measured, divergent scaling or deployment needs.",
    minorityPositions:
      "The Optimistic Futurist holds a conditional exception: when the product's core is a known high-scale pipeline, that pipeline should be a separate service from day one.",
    unresolvedDisputes:
      "The true cost of later decomposition remains contested. The Risk Analyst and First-Principles Engineer see it as manageable with discipline; the Futurist sees it as routinely underestimated.",
    usage: usage(4_800, 320, 0.0192),
  },
  disagreements: [
    {
      id: "r2-p-2-p-3",
      round: 2,
      participantAId: "p-2",
      participantBId: "p-3",
      severity: 23,
      label: "Confidence split of 23 points",
    },
    {
      id: "r2-p-1-p-2",
      round: 2,
      participantAId: "p-1",
      participantBId: "p-2",
      severity: 23,
      label: "Confidence split of 23 points",
    },
    {
      id: "r3-p-2-p-3",
      round: 3,
      participantAId: "p-2",
      participantBId: "p-3",
      severity: 22,
      label: "Confidence split of 22 points",
    },
    {
      id: "r4-p-2-p-3",
      round: 4,
      participantAId: "p-2",
      participantBId: "p-3",
      severity: 21,
      label: "Confidence split of 21 points",
    },
  ],
  claims: {
    modelId: "claude-sonnet-4-20250514",
    providerName: "Claude",
    contradictions: [
      {
        id: "c-1",
        claim: "Whether decomposing a monolith later is cheap enough to defer",
        sides: [
          {
            stance: "Decomposition cost is routinely underestimated",
            participantIds: ["p-2"],
            quote:
              "decomposing a monolith later is not free — the argument assumes clean module boundaries that rarely exist in practice.",
          },
          {
            stance: "Manageable with discipline and boundary tests",
            participantIds: ["p-3", "p-1"],
            quote:
              "The decomposition-cost objection is real and should be mitigated with boundary tests from the start.",
          },
        ],
      },
      {
        id: "c-2",
        claim: "Whether modern tooling reduces microservice operational burden",
        sides: [
          {
            stance: "Tooling has matured enough to absorb it",
            participantIds: ["p-2"],
            quote:
              "Kubernetes, service meshes, and managed cloud services reduce the operational burden significantly.",
          },
          {
            stance: "Tooling trades complexity rather than removing it",
            participantIds: ["p-1"],
            quote: 'Kubernetes is not "reduced complexity" — it is *traded* complexity.',
          },
        ],
      },
    ],
    rawContent: "{...}",
    usage: usage(5_100, 410, 0.0215),
  },
  tokenTotal: usage(39_580, 3_120, 0.1327),
  createdAt: T0 + 125_000,
};

/** A second, smaller Blind Jury run for history / compare tests. */
export const FIXTURE_SNAPSHOT_JURY: SessionSnapshot = {
  ...FIXTURE_SNAPSHOT,
  engine: "blind-jury",
  options: { ...FIXTURE_SNAPSHOT.options, engine: "blind-jury", judgeEnabled: true },
  rounds: [
    {
      ...FIXTURE_SNAPSHOT.rounds[0],
      label: "Independent Verdicts",
      consensusScore: 74,
      responses: FIXTURE_SNAPSHOT.rounds[0].responses.map((r) => ({
        ...r,
        confidence: r.participantId === "p-2" ? 60 : r.confidence,
      })),
    },
  ],
  finalScore: 74,
  finalSummary: "Blind jury complete.",
  disagreements: [FIXTURE_SNAPSHOT.disagreements[0]],
  claims: {
    ...FIXTURE_SNAPSHOT.claims!,
    contradictions: [FIXTURE_SNAPSHOT.claims!.contradictions[1]],
  },
  tokenTotal: usage(6_200, 1_030, 0.0311),
  createdAt: T0 + 400_000,
};
