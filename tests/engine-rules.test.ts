import { describe, it, expect } from "vitest";
import {
  MAX_ROUNDS,
  MIN_RED_TEAM_ROUNDS,
  MIN_ROUNDS,
  effectiveRounds,
  minRoundsFor,
  optionsForEngine,
} from "@/lib/engine-rules";
import { DEFAULT_OPTIONS } from "@/lib/store";

describe("minRoundsFor", () => {
  it("is 3 for Red team and 1 otherwise", () => {
    expect(minRoundsFor("adversarial")).toBe(MIN_RED_TEAM_ROUNDS);
    expect(MIN_RED_TEAM_ROUNDS).toBe(3);
    expect(minRoundsFor("cvp")).toBe(MIN_ROUNDS);
    expect(minRoundsFor("blind-jury")).toBe(MIN_ROUNDS);
  });
});

describe("effectiveRounds", () => {
  it("Blind jury always runs one round", () => {
    expect(effectiveRounds("blind-jury", 5)).toBe(1);
    expect(effectiveRounds("blind-jury", 1)).toBe(1);
  });

  it("Debate uses the configured count within 1–10", () => {
    expect(effectiveRounds("cvp", 2)).toBe(2);
    expect(effectiveRounds("cvp", 0)).toBe(1);
    expect(effectiveRounds("cvp", 12)).toBe(MAX_ROUNDS);
    expect(effectiveRounds("cvp", Number.NaN)).toBe(1);
  });

  it("Red team never runs fewer than 3 rounds", () => {
    expect(effectiveRounds("adversarial", 1)).toBe(3);
    expect(effectiveRounds("adversarial", 2)).toBe(3);
    expect(effectiveRounds("adversarial", 5)).toBe(5);
    expect(effectiveRounds("adversarial", 11)).toBe(MAX_ROUNDS);
  });
});

describe("optionsForEngine", () => {
  const debate2 = { ...DEFAULT_OPTIONS, rounds: 2, judgeEnabled: true, judgeModelId: "a:b" };

  it("raises Red team's rounds to its minimum and keeps every other option", () => {
    const out = optionsForEngine(debate2, "adversarial");
    expect(out).toEqual({ ...debate2, engine: "adversarial", rounds: 3 });
    expect(debate2).toMatchObject({ engine: "cvp", rounds: 2 }); // not mutated
  });

  it("returns the same object when nothing changes", () => {
    expect(optionsForEngine(debate2, "cvp")).toBe(debate2);
    const red5 = { ...DEFAULT_OPTIONS, engine: "adversarial" as const, rounds: 5 };
    expect(optionsForEngine(red5, "adversarial")).toBe(red5);
  });

  it("sets the engine and leaves Blind jury's (ignored) round count alone", () => {
    expect(optionsForEngine(debate2, "blind-jury")).toEqual({ ...debate2, engine: "blind-jury" });
    const red3 = { ...DEFAULT_OPTIONS, engine: "adversarial" as const, rounds: 3 };
    expect(optionsForEngine(red3, "cvp")).toEqual({ ...red3, engine: "cvp" });
  });
});
