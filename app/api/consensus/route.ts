// POST /api/consensus — SSE stream of consensus process
//
// Security hardening:
// - Server-side limits on prompt size, participant count, round count
// - Personas are server-rebuilt from persona IDs (client systemPrompts ignored)
// - Engine options are validated and clamped server-side
// - Request abort signal is forwarded to the engine
// - Basic rate limiting via in-memory sliding window

import type { ConsensusEvent, ConsensusOptions, EngineType, Participant } from "@/lib/types";
import { runConsensus } from "@/lib/consensus-engine";
import { getPersona } from "@/lib/personas";
import { findResolvedModel } from "@/lib/providers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ── Server-side limits ─────────────────────────────────────

const MAX_PROMPT_LENGTH = 10_000;
const MAX_PARTICIPANTS = 8;
const MAX_ROUNDS = 10;

// ── Simple in-memory rate limiter (per-IP, sliding window) ─

const RATE_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT = 5; // max requests per window
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const log = requestLog.get(ip) ?? [];
  const recent = log.filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) return true;
  recent.push(now);
  requestLog.set(ip, recent);
  return false;
}

// Periodic cleanup to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, log] of requestLog.entries()) {
    const recent = log.filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length === 0) requestLog.delete(ip);
    else requestLog.set(ip, recent);
  }
}, RATE_WINDOW_MS);

// ── Options parsing & validation ───────────────────────────

interface LooseRequestBody {
  prompt?: unknown;
  participants?: unknown;
  rounds?: unknown; // legacy
  options?: unknown;
}

function parseEngine(v: unknown): EngineType {
  return v === "blind-jury" ? "blind-jury" : "cvp";
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

  return {
    engine: parseEngine(raw.engine),
    rounds,
    randomizeOrder: parseBool(raw.randomizeOrder, true),
    blindFirstRound: parseBool(raw.blindFirstRound, true),
    earlyStop: parseBool(raw.earlyStop, true),
    judgeEnabled: parseBool(raw.judgeEnabled, false),
    judgeModelId,
  };
}

// ── Route handler ──────────────────────────────────────────

export async function POST(request: Request) {
  // Rate limit by IP
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again in a minute." }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
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

  const validatedParticipants: Participant[] = [];
  for (const p of body.participants as Array<{
    id?: unknown;
    modelInfo?: { id?: unknown };
    persona?: { id?: unknown };
  }>) {
    const modelCompositeId = typeof p.modelInfo?.id === "string" ? p.modelInfo.id : "";
    const resolved = findResolvedModel(modelCompositeId);
    if (!resolved) {
      return new Response(JSON.stringify({ error: `Model not available: ${modelCompositeId}` }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Rebuild persona from server-side definitions (ignore client systemPrompt)
    const personaId = typeof p.persona?.id === "string" ? p.persona.id : "";
    const persona = getPersona(personaId);

    validatedParticipants.push({
      id: typeof p.id === "string" ? p.id : `p-${validatedParticipants.length + 1}`,
      modelInfo: {
        id: modelCompositeId,
        providerId: resolved.providerId,
        providerName: resolved.providerName,
        modelId: resolved.modelId,
      },
      persona,
    });
  }

  // Validate judge model, if requested
  if (options.judgeEnabled) {
    if (!options.judgeModelId) {
      return new Response(
        JSON.stringify({ error: "Judge enabled but no judgeModelId was supplied" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const judgeResolved = findResolvedModel(options.judgeModelId);
    if (!judgeResolved) {
      return new Response(
        JSON.stringify({ error: `Judge model not available: ${options.judgeModelId}` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }

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
