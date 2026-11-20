// ─────────────────────────────────────────────────────────────
// RoundTable — request guards shared by the API routes
// ─────────────────────────────────────────────────────────────
// Rate limiting and server-side participant rebuilding for
// /api/consensus and /api/adjudicate. Client-supplied system prompts
// and model ids are never trusted: personas are rebuilt from their ids
// (or a sanitised custom spec) and models are re-resolved.

import type { Participant } from "./types";
import { composeCustomPersona, getPersona, sanitizeCustomPersonaSpec } from "./personas";
import { findResolvedModel } from "./providers";

/** JSON error response with the given status. */
export function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Best-effort client IP from proxy headers. */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Simple in-memory per-IP sliding-window limiter. Returns `isRateLimited`.
 *
 * Periodic cleanup prevents a memory leak. On Vercel serverless the module
 * is fresh per cold start, so the interval is harmless; in dev with HMR
 * the same module can be re-evaluated many times, so the interval is keyed
 * on a global symbol (`cleanupKey`) and never registered twice.
 */
export function createRateLimiter(
  cleanupKey: string,
  limit = 5,
  windowMs = 60_000,
): (ip: string) => boolean {
  const requestLog = new Map<string, number[]>();
  const key = Symbol.for(cleanupKey);
  const globalAny = globalThis as unknown as Record<symbol, NodeJS.Timeout | undefined>;
  if (!globalAny[key]) {
    globalAny[key] = setInterval(() => {
      const now = Date.now();
      for (const [ip, log] of requestLog.entries()) {
        const recent = log.filter((t) => now - t < windowMs);
        if (recent.length === 0) requestLog.delete(ip);
        else requestLog.set(ip, recent);
      }
    }, windowMs);
  }
  return (ip: string) => {
    const now = Date.now();
    const log = requestLog.get(ip) ?? [];
    const recent = log.filter((t) => now - t < windowMs);
    if (recent.length >= limit) return true;
    recent.push(now);
    requestLog.set(ip, recent);
    return false;
  };
}

/**
 * Rebuild participants server-side. Never trusts client-supplied system
 * prompts or arbitrary model ids: models are re-resolved and personas
 * rebuilt from their ids (custom personas from a sanitised axis spec).
 */
export function rebuildParticipants(
  raw: unknown[],
): { participants: Participant[] } | { error: string } {
  const participants: Participant[] = [];
  for (const p of raw as Array<{
    id?: unknown;
    modelInfo?: { id?: unknown };
    persona?: { id?: unknown };
    customPersonaSpec?: unknown;
  }>) {
    const modelCompositeId = typeof p.modelInfo?.id === "string" ? p.modelInfo.id : "";
    const resolved = findResolvedModel(modelCompositeId);
    if (!resolved) return { error: `Model not available: ${modelCompositeId}` };

    const personaId = typeof p.persona?.id === "string" ? p.persona.id : "";
    let persona;
    let customSpec;
    if (personaId === "custom") {
      const sanitized = sanitizeCustomPersonaSpec(p.customPersonaSpec);
      if (!sanitized) return { error: "Invalid custom persona spec" };
      persona = composeCustomPersona(sanitized);
      customSpec = sanitized;
    } else {
      persona = getPersona(personaId);
    }

    participants.push({
      id: typeof p.id === "string" ? p.id : `p-${participants.length + 1}`,
      modelInfo: {
        id: modelCompositeId,
        providerId: resolved.providerId,
        providerName: resolved.providerName,
        modelId: resolved.modelId,
      },
      persona,
      ...(customSpec ? { customPersonaSpec: customSpec } : {}),
    });
  }
  return { participants };
}

/** Error text when an enabled judge has no usable model, else null. */
export function judgeModelError(
  judgeEnabled: boolean,
  judgeModelId: string | undefined,
): string | null {
  if (!judgeEnabled) return null;
  if (!judgeModelId) return "Judge enabled but no judgeModelId was supplied";
  if (!findResolvedModel(judgeModelId)) return `Judge model not available: ${judgeModelId}`;
  return null;
}
