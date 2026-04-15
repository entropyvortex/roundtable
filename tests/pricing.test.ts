import { describe, it, expect } from "vitest";
import {
  getModelPricing,
  estimateCost,
  addUsage,
  estimateUsageFromText,
  ZERO_USAGE,
  PRICING_TABLE,
  ZERO_PRICING,
} from "@/lib/pricing";

describe("pricing", () => {
  it("returns ZERO_PRICING for unknown models", () => {
    expect(getModelPricing("some-random-model-xyz")).toEqual(ZERO_PRICING);
  });

  it("matches a simple model by inclusion", () => {
    expect(getModelPricing("gpt-4o").output).toBe(PRICING_TABLE["gpt-4o"].output);
  });

  it("prefers the longest matching prefix", () => {
    // gpt-4o-mini should win over gpt-4o for `gpt-4o-mini-2024`
    const price = getModelPricing("gpt-4o-mini-2024-07-18");
    expect(price).toEqual(PRICING_TABLE["gpt-4o-mini"]);
  });

  it("resolves dated claude variants", () => {
    expect(getModelPricing("claude-sonnet-4-20250514")).toEqual(PRICING_TABLE["claude-sonnet-4"]);
  });

  it("estimateCost scales with tokens", () => {
    const cost = estimateCost("gpt-4o", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(PRICING_TABLE["gpt-4o"].input + PRICING_TABLE["gpt-4o"].output);
  });

  it("estimateCost returns 0 for unknown models", () => {
    expect(estimateCost("zzz", 1000, 1000)).toBe(0);
  });

  it("addUsage is associative-ish and non-mutating", () => {
    const a = { inputTokens: 1, outputTokens: 2, totalTokens: 3, estimatedCostUSD: 0.001 };
    const b = { inputTokens: 4, outputTokens: 5, totalTokens: 9, estimatedCostUSD: 0.002 };
    const sum = addUsage(a, b);
    expect(sum).toEqual({
      inputTokens: 5,
      outputTokens: 7,
      totalTokens: 12,
      estimatedCostUSD: 0.003,
    });
    // Originals untouched
    expect(a.inputTokens).toBe(1);
  });

  it("estimateUsageFromText uses a 4-chars-per-token heuristic", () => {
    const usage = estimateUsageFromText("gpt-4o", "1234", "1234567890123456"); // 4 in, 16 out
    expect(usage.inputTokens).toBe(1);
    expect(usage.outputTokens).toBe(4);
    expect(usage.totalTokens).toBe(5);
  });

  it("ZERO_USAGE is well-defined", () => {
    expect(ZERO_USAGE.totalTokens).toBe(0);
  });
});
