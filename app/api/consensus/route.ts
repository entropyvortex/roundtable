// POST /api/consensus — SSE stream of consensus process
//
// Security hardening:
// - Server-side limits on prompt size, participant count, round count
// - Personas are server-rebuilt from persona IDs (client systemPrompts ignored)
// - Request abort signal is forwarded to the engine
// - Basic rate limiting via in-memory sliding window

import type { ConsensusRequest, ConsensusEvent } from "@/lib/types";
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

  const body = (await request.json()) as ConsensusRequest;

  // ── Validation ───────────────────────────────────────────

  if (!body.prompt || !body.participants?.length || !body.rounds) {
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

  if (!Array.isArray(body.participants) || body.participants.length > MAX_PARTICIPANTS) {
    return new Response(
      JSON.stringify({ error: `Maximum ${MAX_PARTICIPANTS} participants allowed` }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const rounds = Math.min(Math.max(1, Math.floor(body.rounds)), MAX_ROUNDS);

  // ── Rebuild participants server-side ─────────────────────
  // Never trust client-supplied systemPrompts or arbitrary model IDs.
  // Re-resolve models and personas from their IDs.

  const validatedParticipants: Array<{
    id: string;
    modelInfo: { id: string; providerId: string; providerName: string; modelId: string };
    persona: ReturnType<typeof getPersona>;
  }> = [];
  for (const p of body.participants) {
    const resolved = findResolvedModel(p.modelInfo?.id ?? "");
    if (!resolved) {
      return new Response(JSON.stringify({ error: `Model not available: ${p.modelInfo?.id}` }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Rebuild persona from server-side definitions (ignore client systemPrompt)
    const persona = getPersona(p.persona?.id ?? "");

    validatedParticipants.push({
      id: p.id,
      modelInfo: {
        id: p.modelInfo.id,
        providerId: resolved.providerId,
        providerName: resolved.providerName,
        modelId: resolved.modelId,
      },
      persona,
    });
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
          body.prompt,
          validatedParticipants,
          rounds,
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
