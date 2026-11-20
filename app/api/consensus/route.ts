// POST /api/consensus — SSE stream of consensus process
//
// Security hardening:
// - Server-side limits on prompt size, participant count, round count
// - Personas are server-rebuilt from persona IDs (client systemPrompts ignored)
// - Engine options are validated and clamped server-side
// - Request abort signal is forwarded to the engine
// - Basic rate limiting via in-memory sliding window

import type { ConsensusEvent, ConsensusOptions, EngineType } from "@/lib/types";
import { runConsensus } from "@/lib/consensus-engine";
import {
  clientIp,
  createRateLimiter,
  jsonError,
  judgeModelError,
  rebuildParticipants,
} from "@/lib/route-guards";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ── Server-side limits ─────────────────────────────────────

const MAX_PROMPT_LENGTH = 10_000;
const MAX_PARTICIPANTS = 8;
const MAX_ROUNDS = 10;

// ── Simple in-memory rate limiter (per-IP, sliding window) ─

const isRateLimited = createRateLimiter("roundtable.consensus-route.cleanup");

// ── Options parsing & validation ───────────────────────────

interface LooseRequestBody {
  prompt?: unknown;
  participants?: unknown;
  rounds?: unknown; // legacy
  options?: unknown;
}

function parseEngine(v: unknown): EngineType {
  if (v === "blind-jury") return "blind-jury";
  if (v === "adversarial") return "adversarial";
  return "cvp";
}

function parseBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function parseOptions(body: LooseRequestBody): ConsensusOptions {
  const raw = (body.options ?? {}) as Record<string, unknown>;
  const legacyRounds = typeof body.rounds === "number" ? body.rounds : undefined;
  const requestedRounds = typeof raw.rounds === "number" ? raw.rounds : (legacyRounds ?? 5);

  const rounds = Math.min(Math.max(1, Math.floor(requestedRounds)), MAX_ROUNDS);

  const judgeModelId =
    typeof raw.judgeModelId === "string" && raw.judgeModelId.length > 0
      ? (raw.judgeModelId as string)
      : undefined;

  // Cost cap is in USD. Clamp to a sensible range so a malformed body
  // can't disable the protection or set absurd values.
  const rawCap = raw.costCapUSD;
  const costCapUSD =
    typeof rawCap === "number" && Number.isFinite(rawCap) && rawCap > 0
      ? Math.min(rawCap, 50)
      : undefined;

  return {
    engine: parseEngine(raw.engine),
    rounds,
    randomizeOrder: parseBool(raw.randomizeOrder, true),
    blindFirstRound: parseBool(raw.blindFirstRound, true),
    earlyStop: parseBool(raw.earlyStop, true),
    judgeEnabled: parseBool(raw.judgeEnabled, false),
    judgeModelId,
    extractClaimsEnabled: parseBool(raw.extractClaimsEnabled, false),
    costCapUSD,
  };
}

// ── Route handler ──────────────────────────────────────────

export async function POST(request: Request) {
  // Rate limit by IP
  if (isRateLimited(clientIp(request))) {
    return jsonError("Rate limit exceeded. Try again in a minute.", 429);
  }

  const body = (await request.json()) as LooseRequestBody;

  // ── Validation ───────────────────────────────────────────

  const hasRounds =
    body.rounds !== undefined ||
    (typeof body.options === "object" &&
      body.options !== null &&
      "rounds" in (body.options as Record<string, unknown>));

  if (
    !body.prompt ||
    !Array.isArray(body.participants) ||
    body.participants.length === 0 ||
    !hasRounds
  ) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (typeof body.prompt !== "string" || body.prompt.length > MAX_PROMPT_LENGTH) {
    return new Response(
      JSON.stringify({ error: `Prompt must be under ${MAX_PROMPT_LENGTH} characters` }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (body.participants.length > MAX_PARTICIPANTS) {
    return new Response(
      JSON.stringify({ error: `Maximum ${MAX_PARTICIPANTS} participants allowed` }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const options = parseOptions(body);

  // ── Rebuild participants server-side ─────────────────────
  // Never trust client-supplied systemPrompts or arbitrary model IDs.
  // Re-resolve models and personas from their IDs.

  const rebuilt = rebuildParticipants(body.participants);
  if ("error" in rebuilt) return jsonError(rebuilt.error);
  const validatedParticipants = rebuilt.participants;

  // Validate judge model, if requested
  const judgeError = judgeModelError(options.judgeEnabled, options.judgeModelId);
  if (judgeError) return jsonError(judgeError);

  // ── Stream with abort support ────────────────────────────

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: ConsensusEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // stream closed by client
        }
      };

      try {
        await runConsensus(
          body.prompt as string,
          validatedParticipants,
          options,
          emit,
          request.signal, // forward abort signal
        );
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Internal error";
        emit({ type: "error", message });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
