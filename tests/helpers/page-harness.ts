// ─────────────────────────────────────────────────────────────
// Page test harness — a fake /api server with controllable SSE
// ─────────────────────────────────────────────────────────────
// A mocked fetch that answers /api/providers and /api/consensus (the
// latter with a ReadableStream of `data: {...}\n\n` lines), where a
// test can hold a stream open, push events later, and see aborts.

import { vi, type Mock } from "vitest";
import { PERSONAS } from "@/lib/personas";
import type {
  ConsensusEvent,
  ConsensusRequest,
  ModelInfo,
  Participant,
  TokenUsage,
} from "@/lib/types";

export const MODELS: ModelInfo[] = [
  { id: "openai:gpt-4o", providerId: "openai", providerName: "OpenAI", modelId: "gpt-4o" },
  { id: "grok:grok-3", providerId: "grok", providerName: "Grok", modelId: "grok-3" },
];

/** Two seats with fixed ids so events can address them. */
export const SEATS: Participant[] = [
  { id: "p-1", modelInfo: MODELS[0], persona: PERSONAS[0] },
  { id: "p-2", modelInfo: MODELS[1], persona: PERSONAS[1] },
];

/** Serialise events the way the server does. */
export const toSse = (events: ConsensusEvent[]) =>
  events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");

export interface LiveStream {
  stream: ReadableStream<Uint8Array>;
  /** Enqueue events (or raw text) on the stream. */
  push: (events: ConsensusEvent[] | string) => void;
  close: () => void;
}

/** A response body the test drives by hand; errors with AbortError when `signal` aborts. */
export function liveStream(signal?: AbortSignal | null): LiveStream {
  const encoder = new TextEncoder();
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  signal?.addEventListener("abort", () => {
    try {
      ctrl.error(new DOMException("The operation was aborted.", "AbortError"));
    } catch {
      /* already closed */
    }
  });
  return {
    stream,
    push: (events) =>
      ctrl.enqueue(encoder.encode(typeof events === "string" ? events : toSse(events))),
    close: () => ctrl.close(),
  };
}

type FakeResponse = { ok: boolean; status: number; json?: () => Promise<unknown>; body?: unknown };

export interface FakeServer {
  fetch: Mock;
  /** Parsed bodies of every POST /api/consensus, in order. */
  requests: ConsensusRequest[];
  /** One stream per /api/consensus request, in order. */
  streams: LiveStream[];
  /**
   * Called for each /api/consensus request. Push events on `live` (and
   * close it) to answer; leave it open to keep the run in flight; or
   * return a response to use instead (e.g. an HTTP error).
   */
  onRun: (req: ConsensusRequest, live: LiveStream, index: number) => FakeResponse | void;
  /** When set, GET /api/providers rejects with this error. */
  providersError: Error | null;
  models: ModelInfo[];
}

/** Stub `fetch` with a fake server. By default runs stay open until the test pushes. */
export function installServer(): FakeServer {
  const server: FakeServer = {
    fetch: vi.fn(),
    requests: [],
    streams: [],
    onRun: () => {},
    providersError: null,
    models: MODELS,
  };
  server.fetch.mockImplementation(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/providers") {
      if (server.providersError) throw server.providersError;
      return { ok: true, status: 200, json: async () => ({ models: server.models }) };
    }
    if (url === "/api/consensus") {
      const req = JSON.parse(String(init?.body)) as ConsensusRequest;
      server.requests.push(req);
      const live = liveStream(init?.signal);
      server.streams.push(live);
      const override = server.onRun(req, live, server.requests.length - 1);
      return override ?? { ok: true, status: 200, body: live.stream };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", server.fetch);
  return server;
}

const usage = (cost: number): TokenUsage => ({
  inputTokens: 400,
  outputTokens: 200,
  totalTokens: 600,
  estimatedCostUSD: cost,
});

export interface RunScript {
  /** Final (and round-1) consensus score. */
  score?: number;
  /** Prefix for every answer / verdict so tests can tell runs apart. */
  tag?: string;
  judge?: boolean;
  claims?: boolean;
}

/** Events for the first part of a run: round 1 opens and p-1 starts streaming. */
export function openingEvents(tag = ""): ConsensusEvent[] {
  return [
    { type: "round-start", round: 1, roundType: "initial-analysis", label: "Initial analysis" },
    { type: "participant-start", participantId: "p-1", round: 1 },
    { type: "token", participantId: "p-1", round: 1, token: `${tag}Thinking out loud` },
  ];
}

/**
 * The rest of a one-round run: both answers, round end, optional judge
 * and claims, then `consensus-complete`.
 */
export function closingEvents({
  score = 80,
  tag = "",
  judge = true,
  claims = true,
}: RunScript = {}): ConsensusEvent[] {
  const answer = (id: string) => `${tag}Answer from ${id} about the question.`;
  const events: ConsensusEvent[] = [];
  SEATS.forEach((p, i) => {
    if (i > 0) {
      events.push({ type: "participant-start", participantId: p.id, round: 1 });
      events.push({ type: "token", participantId: p.id, round: 1, token: answer(p.id) });
    }
    events.push({
      type: "participant-end",
      participantId: p.id,
      round: 1,
      confidence: score + i,
      fullContent: `${answer(p.id)}\nCONFIDENCE: ${score + i}`,
      durationMs: 1500,
      usage: usage(0.002),
    });
  });
  events.push({ type: "round-end", round: 1, consensusScore: score });
  if (judge) {
    events.push({ type: "judge-start", modelId: "gpt-4o", providerName: "OpenAI" });
    events.push({ type: "judge-token", token: "Weighing" });
    events.push({
      type: "judge-end",
      result: {
        modelId: "gpt-4o",
        providerName: "OpenAI",
        content: `## Majority Position\n${tag}Majority verdict.\nJUDGE_CONFIDENCE: 85`,
        majorityPosition: `${tag}Majority verdict.`,
        minorityPositions: "A cautious minority.",
        unresolvedDisputes: "Timing.",
        usage: usage(0.001),
      },
    });
  }
  if (claims) {
    events.push({ type: "claims-start", modelId: "gpt-4o", providerName: "OpenAI" });
    events.push({
      type: "claims-end",
      digest: {
        modelId: "gpt-4o",
        providerName: "OpenAI",
        rawContent: "{}",
        contradictions: [
          {
            id: "c1",
            claim: `${tag}Whether it is worth it`,
            sides: [
              { stance: "Yes", participantIds: ["p-1"], quote: answer("p-1") },
              { stance: "Not yet", participantIds: ["p-2"], quote: answer("p-2") },
            ],
          },
        ],
      },
    });
  }
  events.push({
    type: "consensus-complete",
    finalScore: score,
    summary: "Done",
    roundsCompleted: 1,
  });
  return events;
}

/** A complete one-round run. */
export const completeRun = (script: RunScript = {}) => [
  ...openingEvents(script.tag),
  ...closingEvents(script),
];
