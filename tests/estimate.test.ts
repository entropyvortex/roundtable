import { describe, it, expect } from "vitest";
import {
  estimateRun,
  formatEstimate,
  ESTIMATE_ASSUMPTIONS,
  type EstimateOptions,
  type RunEstimate,
} from "@/lib/estimate";

const p = (modelId: string) => ({ modelInfo: { modelId } });
const mini = p("gpt-4o-mini"); // $0.15 in / $0.60 out per 1M

const base: EstimateOptions = {
  engine: "cvp",
  rounds: 5,
  blindFirstRound: true,
  earlyStop: true,
  judgeEnabled: false,
  extractClaimsEnabled: false,
};

const opts = (o: Partial<EstimateOptions>): EstimateOptions => ({ ...base, ...o });

// Cost of one gpt-4o-mini call in USD.
const miniCost = (input: number, output: number) => (input * 0.15 + output * 0.6) / 1_000_000;

describe("estimateRun — blind jury", () => {
  it("is one parallel call per participant", () => {
    const est = estimateRun([mini, mini, mini], opts({ engine: "blind-jury" }), 400);
    expect(est.calls).toBe(3);
    expect(est.minCalls).toBe(3);
    expect(est.minRounds).toBe(1);
    expect(est.maxRounds).toBe(1);
    // 350 system + 100 prompt tokens in; 1,200 (low) / 1,500 (high) out.
    expect(est.estCostUSD.low).toBeCloseTo(3 * miniCost(450, 1200), 10);
    expect(est.estCostUSD.high).toBeCloseTo(3 * miniCost(450, 1500), 10);
    expect(est.estMinutes).toBe(0.4); // one parallel step × 25 s
    expect(est.unpricedModels).toEqual([]);
    expect(est.exceedsCostCap).toBe(false);
  });

  it("adds judge and claim extraction calls", () => {
    const est = estimateRun(
      [mini, mini],
      opts({
        engine: "blind-jury",
        judgeEnabled: true,
        judgeModelId: "openai:gpt-4o",
        extractClaimsEnabled: true,
      }),
    );
    expect(est.calls).toBe(4);
    expect(est.estMinutes).toBe(1.3); // 3 steps × 25 s = 75 s
  });

  it("ignores the judge when no judge model is chosen, but claims still run", () => {
    const est = estimateRun(
      [mini, mini],
      opts({ engine: "blind-jury", judgeEnabled: true, extractClaimsEnabled: true }),
    );
    expect(est.calls).toBe(3);
  });
});

describe("estimateRun — CVP debate", () => {
  it("uses 2 rounds as the early-stop minimum and the configured rounds as maximum", () => {
    const est = estimateRun(
      [mini, mini, mini],
      opts({ judgeEnabled: true, judgeModelId: "openai:gpt-4o", extractClaimsEnabled: true }),
    );
    expect(est.minRounds).toBe(2);
    expect(est.maxRounds).toBe(5);
    expect(est.calls).toBe(3 * 5 + 2);
    expect(est.minCalls).toBe(3 * 2 + 2);
    // Blind R1 (1 step) + 4 sequential rounds × 3 + judge + claims = 15 steps → 6.25 min.
    expect(est.estMinutes).toBe(6.3);
    expect(est.estCostUSD.high).toBeGreaterThan(est.estCostUSD.low);
  });

  it("has no range when early stop is off or rounds < 3", () => {
    expect(estimateRun([mini], opts({ earlyStop: false })).minRounds).toBe(5);
    const two = estimateRun([mini], opts({ rounds: 2 }));
    expect(two.minRounds).toBe(2);
    expect(two.maxRounds).toBe(2);
  });

  it("charges later rounds for the prior responses in context", () => {
    const off = { earlyStop: false };
    const est = estimateRun([mini, mini], opts({ ...off, rounds: 2 }));
    const { typicalOutputTokens: out, contextFramingTokens: frame } = ESTIMATE_ASSUMPTIONS;
    // R1 blind: no context. R2 sequential: 2 prior + on average 0.5 same-round responses.
    const r1 = 2 * miniCost(350, out);
    const r2 = 2 * miniCost(350 + 2.5 * (out + frame), out);
    expect(est.estCostUSD.low).toBeCloseTo(r1 + r2, 10);

    const one = estimateRun([mini, mini], opts({ ...off, rounds: 1 }));
    const three = estimateRun([mini, mini], opts({ ...off, rounds: 3 }));
    const d1 = est.estCostUSD.low - one.estCostUSD.low;
    const d2 = three.estCostUSD.low - est.estCostUSD.low;
    expect(d2).toBeGreaterThan(d1);
  });

  it("gives round 1 sequential context when blind round 1 is off", () => {
    const blind = estimateRun([mini, mini], opts({ rounds: 1 }));
    const open = estimateRun([mini, mini], opts({ rounds: 1, blindFirstRound: false }));
    expect(open.estCostUSD.low).toBeGreaterThan(blind.estCostUSD.low);
    expect(open.estMinutes).toBeGreaterThan(blind.estMinutes);
  });

  it("clamps rounds to 1–10", () => {
    expect(estimateRun([mini], opts({ rounds: 50, earlyStop: false })).maxRounds).toBe(10);
    expect(estimateRun([mini], opts({ rounds: 0 })).maxRounds).toBe(1);
    expect(estimateRun([mini], opts({ rounds: Number.NaN })).maxRounds).toBe(1);
  });

  it("grows with the question length", () => {
    const short = estimateRun([mini, mini], opts({}), 0);
    const long = estimateRun([mini, mini], opts({}), 8000);
    expect(long.estCostUSD.low).toBeGreaterThan(short.estCostUSD.low);
    // Negative lengths are treated as 0.
    expect(estimateRun([mini, mini], opts({}), -10).estCostUSD).toEqual(short.estCostUSD);
  });
});

describe("estimateRun — red team", () => {
  it("is rounds × participants with an attacker step per middle round", () => {
    const est = estimateRun([mini, mini, mini], opts({ engine: "adversarial", rounds: 4 }));
    expect(est.calls).toBe(12);
    expect(est.minRounds).toBe(4);
    expect(est.maxRounds).toBe(4);
    // R1 (1) + R2, R3 (attacker then defenders: 2 each) + final (1) = 6 steps.
    expect(est.estMinutes).toBe(2.5);
  });

  it("handles a single round and a single participant", () => {
    expect(estimateRun([mini, mini], opts({ engine: "adversarial", rounds: 1 })).calls).toBe(2);
    const solo = estimateRun([mini], opts({ engine: "adversarial", rounds: 3 }));
    expect(solo.calls).toBe(3);
    expect(solo.estMinutes).toBe(1.3); // 3 steps, no defender step
  });
});

describe("estimateRun — pricing edge cases", () => {
  it("returns zeros for an empty panel", () => {
    const est = estimateRun([], opts({ judgeEnabled: true, judgeModelId: "openai:gpt-4o" }));
    expect(est).toMatchObject({
      calls: 0,
      minCalls: 0,
      estCostUSD: { low: 0, high: 0 },
      estMinutes: 0,
      unpricedModels: [],
      exceedsCostCap: false,
    });
  });

  it("lists models without a pricing entry (judge ids without provider prefix)", () => {
    const est = estimateRun(
      [p("mystery-model"), mini],
      opts({
        engine: "blind-jury",
        judgeEnabled: true,
        judgeModelId: "acme:secret-judge",
        extractClaimsEnabled: true,
      }),
    );
    expect(est.unpricedModels.sort()).toEqual(["mystery-model", "secret-judge"]);
  });

  it("uses the first participant's model for claims when the judge is off", () => {
    const est = estimateRun(
      [p("unpriced-first"), mini],
      opts({ engine: "blind-jury", extractClaimsEnabled: true }),
    );
    expect(est.calls).toBe(3);
    expect(est.unpricedModels).toEqual(["unpriced-first"]);
  });

  it("flags when the high estimate exceeds the cost cap", () => {
    expect(estimateRun([mini, mini], opts({ costCapUSD: 0.0001 })).exceedsCostCap).toBe(true);
    expect(estimateRun([mini, mini], opts({ costCapUSD: 100 })).exceedsCostCap).toBe(false);
    expect(estimateRun([mini, mini], opts({ costCapUSD: 0 })).exceedsCostCap).toBe(false);
  });
});

describe("formatEstimate", () => {
  const est = (o: Partial<RunEstimate>): RunEstimate => ({
    calls: 12,
    minCalls: 12,
    minRounds: 4,
    maxRounds: 4,
    estCostUSD: { low: 0.4, high: 0.9 },
    estMinutes: 3.2,
    unpricedModels: [],
    exceedsCostCap: false,
    ...o,
  });

  it("formats the canonical example", () => {
    expect(formatEstimate(est({}))).toBe("≈ 12 calls · ~$0.40–0.90 · ~3 min");
  });

  it("shows a call range when early stop could end sooner", () => {
    expect(formatEstimate(est({ minCalls: 8, calls: 17 }))).toMatch(/^≈ 8–17 calls · /);
  });

  it("uses the singular for one call and <1 min for short runs", () => {
    expect(formatEstimate(est({ calls: 1, minCalls: 1, estMinutes: 0.4 }))).toBe(
      "≈ 1 call · ~$0.40–0.90 · <1 min",
    );
  });

  it("collapses equal low/high costs", () => {
    expect(formatEstimate(est({ estCostUSD: { low: 0.5, high: 0.504 } }))).toContain("~$0.50 ·");
  });

  it("marks tiny, partial and unknown costs", () => {
    expect(formatEstimate(est({ estCostUSD: { low: 0.001, high: 0.004 } }))).toContain("<$0.01 ·");
    expect(
      formatEstimate(est({ estCostUSD: { low: 0.001, high: 0.004 }, unpricedModels: ["x"] })),
    ).toContain("<$0.01+ ·");
    expect(formatEstimate(est({ unpricedModels: ["x"] }))).toContain("~$0.40–0.90+ ·");
    expect(
      formatEstimate(est({ estCostUSD: { low: 0, high: 0 }, unpricedModels: ["x"] })),
    ).toContain("cost n/a");
  });

  it("round-trips a real estimate", () => {
    const s = formatEstimate(estimateRun([mini, mini, mini], opts({ engine: "blind-jury" })));
    expect(s).toBe("≈ 3 calls · <$0.01 · <1 min");
  });
});
