// ─────────────────────────────────────────────────────────────
// RoundTable — Model Pricing Table (USD per 1M tokens)
// ─────────────────────────────────────────────────────────────
// Used only for the live cost meter. Figures are best-effort
// public list prices and are clearly surfaced as *estimates* in
// the UI. Unknown models fall back to zero — the meter simply
// reports what it can price.
//
// To add a model, append an entry below. Fuzzy matching picks
// the longest prefix match, so `claude-sonnet-4` covers every
// dated revision of that family.

import type { TokenUsage } from "./types";

export interface ModelPricing {
  /** USD per 1,000,000 input tokens */
  input: number;
  /** USD per 1,000,000 output tokens */
  output: number;
}

/**
 * Keys are matched against modelId using a case-insensitive
 * longest-prefix lookup. Order does not matter.
 */
export const PRICING_TABLE: Record<string, ModelPricing> = {
  // OpenAI
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5": { input: 1.25, output: 10 },
  "o1-mini": { input: 3, output: 12 },
  o1: { input: 15, output: 60 },

  // Anthropic
  "claude-haiku": { input: 0.8, output: 4 },
  "claude-sonnet-3-5": { input: 3, output: 15 },
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-opus-4": { input: 15, output: 75 },

  // xAI
  "grok-3-mini": { input: 0.3, output: 0.5 },
  "grok-3": { input: 3, output: 15 },
  "grok-4": { input: 5, output: 15 },

  // Google
  "gemini-1.5-flash": { input: 0.075, output: 0.3 },
  "gemini-1.5-pro": { input: 1.25, output: 5 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },

  // Mistral
  "mistral-small": { input: 0.2, output: 0.6 },
  "mistral-large": { input: 2, output: 6 },

  // Groq-hosted open models
  "llama-3.3-70b": { input: 0.59, output: 0.79 },
  "llama-3.1-8b": { input: 0.05, output: 0.08 },
};

/** Zero pricing used when a model has no pricing entry. */
export const ZERO_PRICING: ModelPricing = { input: 0, output: 0 };

/**
 * Look up pricing for a model id using case-insensitive
 * longest-prefix matching, e.g. `claude-sonnet-4-20250514`
 * resolves to the `claude-sonnet-4` entry.
 */
export function getModelPricing(modelId: string): ModelPricing {
  const normalized = modelId.toLowerCase();
  let best: { key: string; price: ModelPricing } | null = null;
  for (const [key, price] of Object.entries(PRICING_TABLE)) {
    if (!normalized.includes(key)) continue;
    if (!best || key.length > best.key.length) best = { key, price };
  }
  return best?.price ?? ZERO_PRICING;
}

/** Estimate USD cost of a single call from raw token counts. */
export function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const p = getModelPricing(modelId);
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

/** Sum token usages without mutating either argument. */
export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    estimatedCostUSD: a.estimatedCostUSD + b.estimatedCostUSD,
  };
}

export const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  estimatedCostUSD: 0,
};

/** Heuristic fallback when the SDK does not report usage: ~4 chars per token. */
export function estimateUsageFromText(
  modelId: string,
  inputText: string,
  outputText: string,
): TokenUsage {
  const inputTokens = Math.max(0, Math.round(inputText.length / 4));
  const outputTokens = Math.max(0, Math.round(outputText.length / 4));
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCostUSD: estimateCost(modelId, inputTokens, outputTokens),
  };
}
