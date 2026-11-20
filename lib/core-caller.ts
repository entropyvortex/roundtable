// ─────────────────────────────────────────────────────────────
// RoundTable — ModelCaller adapter for ai-consensus-core
// ─────────────────────────────────────────────────────────────
// Bridges the provider-agnostic `ModelCaller` contract onto the
// Vercel AI SDK. One call = one `streamText` against the provider's
// OpenAI-compatible chat endpoint:
//
//   - streaming: every text chunk is forwarded to `request.onToken`
//   - usage: provider-reported usage when present, otherwise the
//     chars/4 heuristic from lib/pricing.ts (same as before the port)
//   - abort: `request.signal` is passed to the SDK and checked per chunk
//   - errors: rethrown with the provider-formatted message, so the
//     engine records them on the response's `error` field
//
// Model routing is by participant id: the engine's `modelId` is a
// display label, the composite `provider:model` id comes from `route`.

import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { ModelCaller, ModelCallResponse } from "ai-consensus-core";
import { findResolvedModel } from "./providers";
import { estimateUsageFromText } from "./pricing";

/** Maps an engine participant id (or "judge") to a composite `provider:model` id. */
export type ModelRoute = (participantId: string) => string | undefined;

/**
 * Safely extract token usage from a streamText result. The Vercel AI
 * SDK returns `usage` as either a Promise or an object depending on
 * version; both are handled. All field reads go through type guards
 * rather than `as` casts so a malformed value falls cleanly through to
 * the `estimateUsageFromText` heuristic.
 */
export async function extractUsage(
  result: { usage?: unknown } | undefined,
): Promise<{ inputTokens: number; outputTokens: number } | null> {
  if (!result || result.usage == null) return null;
  let u: unknown;
  try {
    // Tolerate both Promise<usage> and plain usage object.
    u = await (result.usage as Promise<unknown> | unknown);
  } catch {
    return null;
  }
  if (!u || typeof u !== "object") return null;
  const obj = u as Record<string, unknown>;
  const inputCandidate = obj.inputTokens ?? obj.promptTokens;
  const outputCandidate = obj.outputTokens ?? obj.completionTokens;
  const input = typeof inputCandidate === "number" ? inputCandidate : null;
  const output = typeof outputCandidate === "number" ? outputCandidate : null;
  if (input === null || output === null) return null;
  return { inputTokens: input, outputTokens: output };
}

/**
 * Format a provider error for display. Pulls out the common fields
 * that the Vercel AI SDK attaches to `AI_APICallError` (statusCode)
 * and falls back to the message when they are absent.
 */
export function formatProviderError(err: unknown): string {
  if (!(err instanceof Error)) return typeof err === "string" ? err : "Unknown provider error";
  const msg = err.message || err.name || "Unknown provider error";
  const info = err as unknown as { statusCode?: number };
  const parts: string[] = [msg];
  if (typeof info.statusCode === "number") parts.push(`HTTP ${info.statusCode}`);
  return parts.join(" — ");
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

/** Build a ModelCaller that streams through the Vercel AI SDK. */
export function createVercelCaller(route: ModelRoute): ModelCaller {
  return async (req): Promise<ModelCallResponse> => {
    const compositeId = route(req.participantId);
    const resolved = compositeId ? findResolvedModel(compositeId) : undefined;
    if (!resolved) {
      console.error(`[RoundTable] Model resolution failed for ${compositeId ?? req.modelId}`);
      throw new Error(`Model not available: ${compositeId ?? req.modelId}`);
    }

    const provider = createOpenAI({ baseURL: resolved.baseUrl, apiKey: resolved.apiKey });
    let content = "";
    try {
      // Vercel AI SDK v6 surfaces provider errors via the `onError`
      // callback rather than throwing from `textStream`. We capture
      // them here and re-throw after the iteration.
      let capturedError: unknown = null;

      // Use `.chat()` — the OpenAI chat-completions endpoint
      // (`/v1/chat/completions`) is the only one every provider's
      // OpenAI-compat shim implements (Anthropic, xAI, Mistral,
      // Groq, Together, …). The default `provider(modelId)` call
      // would target `/v1/responses`, which is OpenAI-only.
      const result = streamText({
        model: provider.chat(resolved.modelId),
        system: req.system,
        prompt: req.user,
        maxOutputTokens: req.maxOutputTokens,
        temperature: req.temperature,
        abortSignal: req.signal,
        onError: ({ error }: { error: unknown }) => {
          capturedError = error;
        },
      } as Parameters<typeof streamText>[0]);

      const awaited = await result;
      for await (const chunk of awaited.textStream) {
        if (req.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        content += chunk;
        req.onToken?.(chunk);
      }
      if (capturedError) throw capturedError;

      const raw = await extractUsage(awaited as { usage?: unknown });
      const usage = raw
        ? { ...raw, totalTokens: raw.inputTokens + raw.outputTokens }
        : estimateUsageFromText(resolved.modelId, req.system + req.user, content);
      return {
        content,
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        },
      };
    } catch (err) {
      if (isAbortError(err)) throw err;
      console.error(
        "[RoundTable] Provider error from %s/%s:",
        resolved.providerName,
        resolved.modelId,
        err,
      );
      throw new Error(formatProviderError(err));
    }
  };
}
