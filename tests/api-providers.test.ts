import { describe, it, expect, vi } from "vitest";

// Mock providers module
vi.mock("@/lib/providers", () => ({
  getModelInfoListAsync: vi.fn().mockResolvedValue([
    {
      id: "grok:grok-3",
      providerId: "grok",
      providerName: "Grok",
      modelId: "grok-3",
      preferred: true,
    },
    {
      id: "openai:gpt-4o",
      providerId: "openai",
      providerName: "OpenAI",
      modelId: "gpt-4o",
      preferred: false,
    },
  ]),
}));

const { GET } = await import("@/app/api/providers/route");

describe("GET /api/providers", () => {
  it("returns JSON with models array", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.models).toHaveLength(2);
    expect(body.models[0].id).toBe("grok:grok-3");
    expect(body.models[0].preferred).toBe(true);
  });

  it("does not expose API keys in response", async () => {
    const response = await GET();
    const body = await response.json();
    for (const model of body.models) {
      expect(model.apiKey).toBeUndefined();
      expect(model.baseUrl).toBeUndefined();
    }
  });
});
