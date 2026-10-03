import { describe, it, expect } from "vitest";
import {
  scoreLabel,
  roundTypeLabel,
  engineLabel,
  engineDescription,
  SCORE_EXPLAINER,
} from "@/lib/score-label";
import type { EngineType, RoundType } from "@/lib/types";

describe("scoreLabel", () => {
  it.each([
    [100, "Strong agreement", "success"],
    [80, "Strong agreement", "success"],
    [79.9, "Broad agreement with reservations", "info"],
    [60, "Broad agreement with reservations", "info"],
    [59, "Split", "warning"],
    [40, "Split", "warning"],
    [39, "Deep disagreement", "danger"],
    [0, "Deep disagreement", "danger"],
    [-5, "Deep disagreement", "danger"],
  ])("score %s → %s (%s)", (score, label, tone) => {
    const r = scoreLabel(score);
    expect(r.label).toBe(label);
    expect(r.tone).toBe(tone);
    expect(r.description.length).toBeGreaterThan(10);
  });

  it("handles missing scores", () => {
    for (const v of [null, undefined, Number.NaN]) {
      const r = scoreLabel(v);
      expect(r.label).toBe("No score yet");
      expect(r.tone).toBe("info");
    }
  });

  it("returns a fresh object each call", () => {
    const a = scoreLabel(90);
    a.label = "mutated";
    expect(scoreLabel(90).label).toBe("Strong agreement");
    const b = scoreLabel(null);
    b.label = "mutated";
    expect(scoreLabel(null).label).toBe("No score yet");
  });

  it("explains the formula", () => {
    expect(SCORE_EXPLAINER).toMatch(/average confidence minus half the spread/i);
  });
});

describe("roundTypeLabel", () => {
  it("returns short labels by default", () => {
    expect(roundTypeLabel("initial-analysis")).toBe("Initial");
    expect(roundTypeLabel("counterarguments")).toBe("Counter");
    expect(roundTypeLabel("evidence-assessment")).toBe("Evidence");
    expect(roundTypeLabel("synthesis")).toBe("Synthesis");
  });

  it("returns long labels on request", () => {
    expect(roundTypeLabel("initial-analysis", "long")).toBe("Initial analysis");
    expect(roundTypeLabel("evidence-assessment", "long")).toBe("Evidence assessment");
  });

  it("falls back to the raw value for unknown types", () => {
    expect(roundTypeLabel("mystery" as RoundType)).toBe("mystery");
  });
});

describe("engineLabel / engineDescription", () => {
  it("names each engine in plain language", () => {
    expect(engineLabel("cvp")).toBe("Debate (CVP)");
    expect(engineLabel("cvp", "short")).toBe("Debate");
    expect(engineLabel("blind-jury")).toBe("Blind jury");
    expect(engineLabel("adversarial")).toBe("Red team");
  });

  it("describes each engine", () => {
    expect(engineDescription("blind-jury")).toMatch(/Cheapest/);
    expect(engineDescription("adversarial")).toMatch(/attacker/);
    expect(engineDescription("cvp")).toMatch(/rounds/);
  });

  it("falls back for unknown engines", () => {
    expect(engineLabel("other" as EngineType)).toBe("other");
    expect(engineDescription("other" as EngineType)).toBe("");
  });
});
