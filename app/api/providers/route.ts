// GET /api/providers — returns client-safe model list
// Caches results in memory for 60 seconds to avoid hitting
// provider APIs on every page load.
import { NextResponse } from "next/server";
import { getModelInfoListAsync } from "@/lib/providers";
import type { ModelInfo } from "@/lib/types";

export const dynamic = "force-dynamic";

let cache: { models: ModelInfo[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 60_000; // 1 minute

export async function GET() {
  const now = Date.now();

  if (cache && now - cache.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({ models: cache.models });
  }

  const models = await getModelInfoListAsync();
  cache = { models, timestamp: now };
  return NextResponse.json({ models });
}
