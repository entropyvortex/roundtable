// POST /api/adjudicate — SSE stream of a Compare attempts run
//
// Same hardening as /api/consensus: server-side limits, personas and
// models rebuilt from ids, judge validated, request abort forwarded,
// per-IP rate limit. Attempt labels are for the UI only and never reach
// a model (see lib/compare-attempts.ts).

import type { CompareEvent } from "@/lib/types";
import { parseAttempts, runCompareAttempts } from "@/lib/compare-attempts";
import { MAX_COST_CAP_USD, MAX_PROMPT_LENGTH, MAX_SEATS, MIN_SEATS } from "@/lib/limits";
import {
  clientIp,
  createRateLimiter,
  jsonError,
  judgeModelError,
  rebuildParticipants,
} from "@/lib/route-guards";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const isRateLimited = createRateLimiter("roundtable.adjudicate-route.cleanup");

interface LooseBody {
  task?: unknown;
  attempts?: unknown;
  participants?: unknown;
  options?: unknown;
}

export async function POST(request: Request) {
  if (isRateLimited(clientIp(request))) {
    return jsonError("Rate limit exceeded. Try again in a minute.", 429);
  }

  let body: LooseBody;
  try {
    body = (await request.json()) as LooseBody;
  } catch {
    return jsonError("Body must be JSON");
  }

  if (typeof body.task !== "string" || body.task.trim() === "") {
    return jsonError("Missing task");
  }
  if (body.task.length > MAX_PROMPT_LENGTH) {
    return jsonError(`Task must be under ${MAX_PROMPT_LENGTH} characters`);
  }
  const attempts = parseAttempts(body.attempts);
  if (typeof attempts === "string") return jsonError(attempts);

  if (!Array.isArray(body.participants)) return jsonError("Missing participants");
  if (body.participants.length < MIN_SEATS || body.participants.length > MAX_SEATS) {
    return jsonError(`Use between ${MIN_SEATS} and ${MAX_SEATS} jurors`);
  }
  const rebuilt = rebuildParticipants(body.participants);
  if ("error" in rebuilt) return jsonError(rebuilt.error);

  const raw = (body.options ?? {}) as Record<string, unknown>;
  const judgeEnabled = raw.judgeEnabled === true;
  const judgeModelId =
    typeof raw.judgeModelId === "string" && raw.judgeModelId.length > 0
      ? raw.judgeModelId
      : undefined;
  const judgeError = judgeModelError(judgeEnabled, judgeModelId);
  if (judgeError) return jsonError(judgeError);
  const rawCap = raw.costCapUSD;
  const costCapUSD =
    typeof rawCap === "number" && Number.isFinite(rawCap) && rawCap > 0
      ? Math.min(rawCap, MAX_COST_CAP_USD)
      : undefined;

  const encoder = new TextEncoder();
  const task = body.task;
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: CompareEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // stream closed by client
        }
      };
      try {
        await runCompareAttempts(
          {
            task,
            attempts,
            participants: rebuilt.participants,
            ...(judgeEnabled && judgeModelId ? { judgeModelId } : {}),
            ...(costCapUSD ? { costCapUSD } : {}),
          },
          emit,
          request.signal,
        );
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        emit({ type: "error", message: err instanceof Error ? err.message : "Internal error" });
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
