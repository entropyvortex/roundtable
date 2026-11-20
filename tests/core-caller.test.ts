import { describe, it, expect, vi, beforeEach } from "vitest";

// Contract: the ModelCaller adapter streams through the Vercel AI SDK,
// forwards every chunk to onToken, maps usage (reported, else the chars/4
// heuristic), honours the abort signal, and turns provider failures into
// thrown errors carrying the provider-formatted message.

const created: Array<{ baseURL: string; apiKey: string }> = [];
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: (cfg: { baseURL: string; apiKey: string }) => {
    created.push(cfg);
    const make = (modelId: string) => ({ modelId });
    const p = make as ((m: string) => { modelId: string }) & { chat: typeof make };
    p.chat = make;
    return p;
  },
}));

type Behaviour = {
  chunks?: string[];
  usage?: unknown;
  onError?: unknown;
  throwInStream?: unknown;
};
let behaviour: Behaviour = {};
const seen: Array<Record<string, unknown>> = [];

vi.mock("ai", () => ({
  streamText: vi.fn(
    (opts: Record<string, unknown> & { onError?: (e: { error: unknown }) => void }) => {
      seen.push(opts);
      if (behaviour.onError) opts.onError?.({ error: behaviour.onError });
      return {
        textStream: (async function* () {
          for (const c of behaviour.chunks ?? []) yield c;
          if (behaviour.throwInStream) throw behaviour.throwInStream;
        })(),
        ...(behaviour.usage === undefined ? {} : { usage: Promise.resolve(behaviour.usage) }),
      };
    },
  ),
}));

vi.mock("@/lib/providers", () => ({
  findResolvedModel: (id: string) =>
    id === "missing:model"
      ? undefined
      : {
          providerId: "p",
          providerName: "Prov",
          modelId: "the-model",
          baseUrl: "https://x/v1",
          apiKey: "k",
        },
}));

const { createVercelCaller } = await import("@/lib/core-caller");

const req = (over: Record<string, unknown> = {}) => ({
  participantId: "p-1",
  modelId: "display",
  round: 1,
  phase: "initial-analysis" as const,
  system: "SYS",
  user: "USER",
  temperature: 0.4,
  maxOutputTokens: 321,
  ...over,
});

describe("createVercelCaller — ModelCaller over the Vercel AI SDK", () => {
  beforeEach(() => {
    behaviour = {};
    seen.length = 0;
    created.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("routes by participant id, streams every chunk to onToken and returns the content", async () => {
    behaviour = { chunks: ["Hel", "lo"], usage: { inputTokens: 7, outputTokens: 3 } };
    const route = vi.fn(() => "prov:the-model");
    const tokens: string[] = [];
    const out = await createVercelCaller(route)(req({ onToken: (t: string) => tokens.push(t) }));
    expect(route).toHaveBeenCalledWith("p-1");
    expect(tokens).toEqual(["Hel", "lo"]);
    expect(out).toEqual({
      content: "Hello",
      usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 },
    });
    expect(created).toEqual([{ baseURL: "https://x/v1", apiKey: "k" }]);
    expect(seen[0]).toMatchObject({
      model: { modelId: "the-model" },
      system: "SYS",
      prompt: "USER",
      temperature: 0.4,
      maxOutputTokens: 321,
    });
  });

  it("accepts legacy promptTokens/completionTokens usage", async () => {
    behaviour = { chunks: ["x"], usage: { promptTokens: 2, completionTokens: 5 } };
    const out = await createVercelCaller(() => "prov:m")(req());
    expect(out.usage).toEqual({ inputTokens: 2, outputTokens: 5, totalTokens: 7 });
  });

  it("estimates usage at chars/4 when the SDK reports none", async () => {
    behaviour = { chunks: ["12345678"] };
    const out = await createVercelCaller(() => "prov:m")(req({ system: "abcd", user: "efgh" }));
    expect(out.usage).toEqual({ inputTokens: 2, outputTokens: 2, totalTokens: 4 });
  });

  it("passes the abort signal to the SDK and rethrows AbortError", async () => {
    const ac = new AbortController();
    behaviour = { chunks: ["a", "b"] };
    const caller = createVercelCaller(() => "prov:m");
    const p = caller(req({ signal: ac.signal, onToken: () => ac.abort() }));
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(seen[0]!.abortSignal).toBe(ac.signal);
  });

  it("throws the provider-formatted message for onError-reported and in-stream failures", async () => {
    behaviour = { onError: Object.assign(new Error("Not Found"), { statusCode: 404 }) };
    await expect(createVercelCaller(() => "prov:m")(req())).rejects.toThrow("Not Found — HTTP 404");
    behaviour = { chunks: ["part"], throwInStream: new Error("socket hang up") };
    await expect(createVercelCaller(() => "prov:m")(req())).rejects.toThrow("socket hang up");
  });

  it("throws when the model cannot be resolved", async () => {
    await expect(createVercelCaller(() => "missing:model")(req())).rejects.toThrow(
      "Model not available: missing:model",
    );
    await expect(createVercelCaller(() => undefined)(req())).rejects.toThrow(
      "Model not available: display",
    );
  });
});
