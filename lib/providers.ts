// ─────────────────────────────────────────────────────────────
// RoundTable — Provider Resolution (Server-side only)
// ─────────────────────────────────────────────────────────────
// Parses AI_PROVIDERS env var, resolves API keys.
//
// Model listing behavior:
//   STRICT_MODELS=true  → Only the exact models listed in AI_PROVIDERS
//   STRICT_MODELS=false → Fetches all models from provider API,
//                          with listed models marked as "preferred"
//                          and sorted to the top. Filters to chat models.

import type { ProviderConfig, ResolvedModel, ModelInfo } from "./types";

const isStrictMode = () => process.env.STRICT_MODELS?.toLowerCase() === "true";

// ── Parsing ────────────────────────────────────────────────

function parseProviders(): ProviderConfig[] {
  const raw = process.env.AI_PROVIDERS;
  if (!raw) {
    console.warn("AI_PROVIDERS env var not set — no models available");
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as ProviderConfig[];
    if (!Array.isArray(parsed)) throw new Error("AI_PROVIDERS must be a JSON array");
    return parsed;
  } catch (err) {
    console.error("Failed to parse AI_PROVIDERS:", err);
    return [];
  }
}

function resolveApiKey(keyRef: string): string {
  if (keyRef.startsWith("env:")) {
    const envVar = keyRef.slice(4);
    const value = process.env[envVar];
    if (!value) {
      console.warn(`Environment variable ${envVar} is not set`);
      return "";
    }
    return value;
  }
  return keyRef;
}

// ── API Model Fetching ─────────────────────────────────────

/** Patterns that indicate a model is NOT a chat/text-generation model */
const NON_CHAT_PATTERNS = [
  /embed/i,
  /tts/i,
  /whisper/i,
  /dall-e/i,
  /moderation/i,
  /text-search/i,
  /text-similarity/i,
  /code-search/i,
  /audio/i,
  /realtime/i,
  /transcri/i,
  /imagine/i,
  /image/i,
  /video/i,
  /multi-agent/i,
  /multi_agent/i, // not supported (e.g. grok multi-agent)
  /chatgpt-4o-latest/i, // alias, not a real model
  /babbage/i,
  /davinci/i, // legacy completion models
  /o1-pro/i, // not generally available
];

function isChatModel(modelId: string): boolean {
  return !NON_CHAT_PATTERNS.some((p) => p.test(modelId));
}

interface ApiModel {
  id?: string;
  type?: string;
  object?: string;
  // Anthropic-specific fields
  display_name?: string;
}

/** Detect if this is an Anthropic-style API based on the URL */
function isAnthropicApi(baseUrl: string): boolean {
  return baseUrl.includes("anthropic.com");
}

/**
 * Fetch models from a provider's API.
 * Handles both OpenAI-compatible and Anthropic APIs.
 */
async function fetchModelsFromApi(
  baseUrl: string,
  apiKey: string,
  providerId: string,
): Promise<string[]> {
  try {
    const base = baseUrl.replace(/\/+$/, "");
    const isAnthropic = isAnthropicApi(base);

    const url = `${base}/models`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (isAnthropic) {
      // Anthropic uses x-api-key + anthropic-version header
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.warn(`Failed to fetch models from ${providerId}: HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();

    // Anthropic response format: { data: [{ id, type, display_name }] }
    // OpenAI response format:    { data: [{ id, object, ... }] }
    if (data?.data && Array.isArray(data.data)) {
      return (data.data as ApiModel[])
        .filter((m) => {
          if (!m.id || typeof m.id !== "string") return false;
          // Anthropic: filter by type if present
          if (isAnthropic && m.type && m.type !== "model") return false;
          // OpenAI: use API-reported type if available
          if (!isAnthropic && m.type && m.type !== "chat") return false;
          // Heuristic filter for all providers
          return isChatModel(m.id);
        })
        .map((m) => m.id as string)
        .sort();
    }

    return [];
  } catch (err) {
    console.warn(
      `Error fetching models from ${providerId}:`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

// ── Model Resolution ───────────────────────────────────────

/**
 * Async — returns all models for all providers.
 * In strict mode: only statically listed models.
 * In default mode: fetches from API, marks listed models as preferred.
 */
export async function getResolvedModelsAsync(): Promise<
  Array<ResolvedModel & { preferred: boolean }>
> {
  const providers = parseProviders();
  const strict = isStrictMode();
  const results: Array<ResolvedModel & { preferred: boolean }> = [];

  for (const provider of providers) {
    const apiKey = resolveApiKey(provider.apiKey);
    if (!apiKey) continue;

    const preferredIds = new Set(provider.models ?? []);

    if (strict) {
      // Strict: only the listed models
      for (const modelId of preferredIds) {
        results.push({
          providerId: provider.id,
          providerName: provider.name,
          modelId,
          baseUrl: provider.baseUrl,
          apiKey,
          preferred: true,
        });
      }
    } else {
      // Default: fetch all from API, merge with preferred
      const apiModels = await fetchModelsFromApi(provider.baseUrl, apiKey, provider.id);

      // Combine: preferred first, then API-discovered (deduped)
      const seen = new Set<string>();

      // Add preferred models first (even if not in API response — user knows best)
      for (const modelId of preferredIds) {
        seen.add(modelId);
        results.push({
          providerId: provider.id,
          providerName: provider.name,
          modelId,
          baseUrl: provider.baseUrl,
          apiKey,
          preferred: true,
        });
      }

      // Add remaining API models
      for (const modelId of apiModels) {
        if (seen.has(modelId)) continue;
        seen.add(modelId);
        results.push({
          providerId: provider.id,
          providerName: provider.name,
          modelId,
          baseUrl: provider.baseUrl,
          apiKey,
          preferred: false,
        });
      }

      // If no models at all (API failed + no preferred), warn
      if (seen.size === 0) {
        console.warn(`No models available for provider ${provider.id}`);
      }
    }
  }

  return results;
}

/** Sync — only statically defined models (used by consensus engine) */
export function getResolvedModels(): ResolvedModel[] {
  const providers = parseProviders();
  const models: ResolvedModel[] = [];

  for (const provider of providers) {
    const apiKey = resolveApiKey(provider.apiKey);
    if (!apiKey) continue;

    for (const modelId of provider.models ?? []) {
      models.push({
        providerId: provider.id,
        providerName: provider.name,
        modelId,
        baseUrl: provider.baseUrl,
        apiKey,
      });
    }
  }

  return models;
}

/** Client-safe model list (async) */
export async function getModelInfoListAsync(): Promise<ModelInfo[]> {
  const resolved = await getResolvedModelsAsync();
  return resolved.map((m) => ({
    id: `${m.providerId}:${m.modelId}`,
    providerId: m.providerId,
    providerName: m.providerName,
    modelId: m.modelId,
    preferred: m.preferred,
  }));
}

/** Find a resolved model by composite ID — works for any model */
export function findResolvedModel(compositeId: string): ResolvedModel | undefined {
  const [providerId, ...rest] = compositeId.split(":");
  const modelId = rest.join(":");

  // Check static models first
  const staticMatch = getResolvedModels().find(
    (m) => m.providerId === providerId && m.modelId === modelId,
  );
  if (staticMatch) return staticMatch;

  // For dynamically discovered models, resolve on the fly from provider config
  const providers = parseProviders();
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) return undefined;

  const apiKey = resolveApiKey(provider.apiKey);
  if (!apiKey) return undefined;

  return {
    providerId: provider.id,
    providerName: provider.name,
    modelId,
    baseUrl: provider.baseUrl,
    apiKey,
  };
}
