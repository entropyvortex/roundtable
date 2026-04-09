import { describe, it, expect } from "vitest";
import { PERSONAS, getPersona } from "@/lib/personas";

describe("personas", () => {
  it("exports at least 5 personas", () => {
    expect(PERSONAS.length).toBeGreaterThanOrEqual(5);
  });

  it("each persona has required fields", () => {
    for (const p of PERSONAS) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.emoji).toBeTruthy();
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.systemPrompt.length).toBeGreaterThan(20);
      expect(p.description.length).toBeGreaterThan(10);
    }
  });

  it("all IDs are unique", () => {
    const ids = PERSONAS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getPersona returns correct persona by ID", () => {
    const fp = getPersona("first-principles");
    expect(fp.name).toBe("First-Principles Engineer");
  });

  it("getPersona falls back to first persona for unknown ID", () => {
    const fallback = getPersona("nonexistent-id");
    expect(fallback).toBe(PERSONAS[0]);
  });
});
