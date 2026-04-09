import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getResolvedModels,
  getResolvedModelsAsync,
  getModelInfoListAsync,
  findResolvedModel,
} from "@/lib/providers";

const PROVIDERS_JSON = JSON.stringify([
  {
    id: "grok",
    name: "Grok",
    baseUrl: "https://api.x.ai/v1",
    apiKey: "env:GROK_API_KEY",
    models: ["grok-3"],
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "literal-key-123",
    models: ["gpt-4o"],
  },
]);

describe("providers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getResolvedModels (sync)", () => {
    it("returns empty when AI_PROVIDERS not set", () => {
      delete process.env.AI_PROVIDERS;
      expect(getResolvedModels()).toEqual([]);
    });

    it("returns empty when AI_PROVIDERS is invalid JSON", () => {
      process.env.AI_PROVIDERS = "not-json";
      expect(getResolvedModels()).toEqual([]);
    });

    it("returns empty when AI_PROVIDERS is not an array", () => {
      process.env.AI_PROVIDERS = '{"not": "array"}';
      expect(getResolvedModels()).toEqual([]);
    });

    it("resolves env: API key references", () => {
      process.env.AI_PROVIDERS = PROVIDERS_JSON;
      process.env.GROK_API_KEY = "resolved-key";
      const models = getResolvedModels();
      const grok = models.find((m) => m.providerId === "grok");
      expect(grok?.apiKey).toBe("resolved-key");
    });

    it("uses literal API keys directly", () => {
      process.env.AI_PROVIDERS = PROVIDERS_JSON;
      process.env.GROK_API_KEY = "key";
      const models = getResolvedModels();
      const openai = models.find((m) => m.providerId === "openai");
      expect(openai?.apiKey).toBe("literal-key-123");
    });

    it("skips providers with missing API keys", () => {
      process.env.AI_PROVIDERS = PROVIDERS_JSON;
      // GROK_API_KEY not set
      const models = getResolvedModels();
      expect(models.every((m) => m.providerId !== "grok")).toBe(true);
      expect(models.some((m) => m.providerId === "openai")).toBe(true);
    });

    it("handles providers with no models field", () => {
      process.env.AI_PROVIDERS = JSON.stringify([
        { id: "x", name: "X", baseUrl: "http://x", apiKey: "key" },
      ]);
      expect(getResolvedModels()).toEqual([]);
    });
  });

  describe("getResolvedModelsAsync", () => {
    it("in strict mode only returns listed models", async () => {
      process.env.AI_PROVIDERS = PROVIDERS_JSON;
      process.env.GROK_API_KEY = "key";
      process.env.STRICT_MODELS = "true";

      const models = await getResolvedModelsAsync();
      expect(models).toHaveLength(2);
      expect(models.every((m) => m.preferred)).toBe(true);
    });

    it("in default mode fetches from API and merges with preferred", async () => {
      process.env.AI_PROVIDERS = JSON.stringify([
        {
          id: "test",
          name: "Test",
          baseUrl: "https://test.com/v1",
          apiKey: "key",
          models: ["preferred-model"],
        },
      ]);
      delete process.env.STRICT_MODELS;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { id: "preferred-model" },
              { id: "other-model" },
              { id: "text-embedding-ada-002" }, // should be filtered
            ],
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const models = await getResolvedModelsAsync();
      expect(models).toHaveLength(2); // preferred + other (embedding filtered)
      expect(models[0].modelId).toBe("preferred-model");
      expect(models[0].preferred).toBe(true);
      expect(models[1].modelId).toBe("other-model");
      expect(models[1].preferred).toBe(false);
    });

    it("handles fetch failure gracefully, still returns preferred", async () => {
      process.env.AI_PROVIDERS = JSON.stringify([
        {
          id: "test",
          name: "Test",
          baseUrl: "https://test.com/v1",
          apiKey: "key",
          models: ["fallback-model"],
        },
      ]);
      delete process.env.STRICT_MODELS;

      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

      const models = await getResolvedModelsAsync();
      expect(models).toHaveLength(1);
      expect(models[0].modelId).toBe("fallback-model");
      expect(models[0].preferred).toBe(true);
    });

    it("handles non-ok HTTP response", async () => {
      process.env.AI_PROVIDERS = JSON.stringify([
        { id: "test", name: "Test", baseUrl: "https://test.com/v1", apiKey: "key", models: ["m1"] },
      ]);
      delete process.env.STRICT_MODELS;

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

      const models = await getResolvedModelsAsync();
      expect(models).toHaveLength(1); // just the preferred one
    });

    it("filters non-chat models by pattern", async () => {
      process.env.AI_PROVIDERS = JSON.stringify([
        { id: "test", name: "Test", baseUrl: "https://test.com/v1", apiKey: "key" },
      ]);
      delete process.env.STRICT_MODELS;

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                { id: "gpt-4o" },
                { id: "dall-e-3" },
                { id: "tts-1" },
                { id: "whisper-1" },
                { id: "text-embedding-3-large" },
                { id: "grok-4.20-multi-agent-0309" },
                { id: "claude-sonnet-4" },
                { id: "grok-imagine-image" },
                { id: "babbage-002" },
              ],
            }),
        }),
      );

      const models = await getResolvedModelsAsync();
      const ids = models.map((m) => m.modelId);
      expect(ids).toContain("gpt-4o");
      expect(ids).toContain("claude-sonnet-4");
      expect(ids).not.toContain("dall-e-3");
      expect(ids).not.toContain("tts-1");
      expect(ids).not.toContain("whisper-1");
      expect(ids).not.toContain("text-embedding-3-large");
      expect(ids).not.toContain("grok-4.20-multi-agent-0309");
      expect(ids).not.toContain("grok-imagine-image");
      expect(ids).not.toContain("babbage-002");
    });

    it("uses Anthropic headers for anthropic.com URLs", async () => {
      process.env.AI_PROVIDERS = JSON.stringify([
        {
          id: "claude",
          name: "Claude",
          baseUrl: "https://api.anthropic.com/v1",
          apiKey: "sk-ant-key",
        },
      ]);
      delete process.env.STRICT_MODELS;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: "claude-sonnet-4", type: "model" }] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await getResolvedModelsAsync();

      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders["x-api-key"]).toBe("sk-ant-key");
      expect(callHeaders["anthropic-version"]).toBe("2023-06-01");
      expect(callHeaders["Authorization"]).toBeUndefined();
    });

    it("uses Bearer auth for non-Anthropic URLs", async () => {
      process.env.AI_PROVIDERS = JSON.stringify([
        { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", apiKey: "sk-key" },
      ]);
      delete process.env.STRICT_MODELS;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: "gpt-4o" }] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await getResolvedModelsAsync();

      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders["Authorization"]).toBe("Bearer sk-key");
      expect(callHeaders["x-api-key"]).toBeUndefined();
    });
  });

  describe("getModelInfoListAsync", () => {
    it("returns client-safe model info with preferred flags", async () => {
      process.env.AI_PROVIDERS = PROVIDERS_JSON;
      process.env.GROK_API_KEY = "key";
      process.env.STRICT_MODELS = "true";

      const models = await getModelInfoListAsync();
      expect(models).toHaveLength(2);
      expect(models[0].id).toBe("grok:grok-3");
      expect(models[0].preferred).toBe(true);
      // No apiKey exposed
      expect((models[0] as Record<string, unknown>)["apiKey"]).toBeUndefined();
    });
  });

  describe("findResolvedModel", () => {
    it("finds a statically defined model", () => {
      process.env.AI_PROVIDERS = PROVIDERS_JSON;
      process.env.GROK_API_KEY = "key";
      const model = findResolvedModel("grok:grok-3");
      expect(model?.modelId).toBe("grok-3");
      expect(model?.apiKey).toBe("key");
    });

    it("resolves dynamically discovered models on the fly", () => {
      process.env.AI_PROVIDERS = PROVIDERS_JSON;
      process.env.GROK_API_KEY = "key";
      const model = findResolvedModel("grok:grok-4-turbo");
      expect(model?.modelId).toBe("grok-4-turbo");
      expect(model?.providerId).toBe("grok");
    });

    it("returns undefined for unknown provider", () => {
      process.env.AI_PROVIDERS = PROVIDERS_JSON;
      expect(findResolvedModel("unknown:model")).toBeUndefined();
    });

    it("returns undefined when provider has no API key", () => {
      process.env.AI_PROVIDERS = JSON.stringify([
        { id: "nokey", name: "NoKey", baseUrl: "http://x", apiKey: "env:MISSING_KEY" },
      ]);
      expect(findResolvedModel("nokey:model")).toBeUndefined();
    });

    it("handles model IDs containing colons", () => {
      process.env.AI_PROVIDERS = JSON.stringify([
        { id: "test", name: "Test", baseUrl: "http://x", apiKey: "key", models: ["org:model:v2"] },
      ]);
      const model = findResolvedModel("test:org:model:v2");
      expect(model?.modelId).toBe("org:model:v2");
    });
  });
});
