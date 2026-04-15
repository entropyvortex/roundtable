import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SessionSnapshot } from "@/lib/types";
import { PERSONAS } from "@/lib/personas";
import {
  encodeSnapshotToHash,
  decodeSnapshotFromHash,
  snapshotToMarkdown,
  snapshotToJSON,
  snapshotFilename,
  downloadBlob,
} from "@/lib/session";

const baseSnapshot: SessionSnapshot = {
  v: 1,
  prompt: "Should we ship on Friday?",
  engine: "cvp",
  options: {
    engine: "cvp",
    rounds: 3,
    randomizeOrder: true,
    blindFirstRound: true,
    earlyStop: true,
    judgeEnabled: true,
    judgeModelId: "openai:gpt-4o",
  },
  participants: [
    {
      id: "p-1",
      modelInfo: {
        id: "openai:gpt-4o",
        providerId: "openai",
        providerName: "OpenAI",
        modelId: "gpt-4o",
      },
      persona: PERSONAS[0],
    },
    {
      id: "p-2",
      modelInfo: {
        id: "grok:grok-3",
        providerId: "grok",
        providerName: "Grok",
        modelId: "grok-3",
      },
      persona: PERSONAS[1],
    },
  ],
  rounds: [
    {
      number: 1,
      type: "initial-analysis",
      label: "Initial Analysis",
      consensusScore: 78,
      responses: [
        {
          participantId: "p-1",
          roundNumber: 1,
          content: "Yes, ship it.\nCONFIDENCE: 85",
          confidence: 85,
          timestamp: 123,
        },
        {
          participantId: "p-2",
          roundNumber: 1,
          content: "No, wait.\nCONFIDENCE: 60",
          confidence: 60,
          timestamp: 124,
        },
      ],
    },
  ],
  finalScore: 78,
  finalSummary: "done",
  judge: {
    modelId: "gpt-4o",
    providerName: "OpenAI",
    content: "## Majority Position\nShip.",
    majorityPosition: "Ship.",
    minorityPositions: "Wait.",
    unresolvedDisputes: "None",
  },
  disagreements: [
    {
      id: "r1-p-1-p-2",
      round: 1,
      participantAId: "p-1",
      participantBId: "p-2",
      severity: 25,
      label: "Risk vs Engineer",
    },
  ],
  tokenTotal: {
    inputTokens: 1000,
    outputTokens: 500,
    totalTokens: 1500,
    estimatedCostUSD: 0.02,
  },
  createdAt: 1700000000000,
};

describe("session — markdown & json exports", () => {
  it("includes prompt, engine, round headings and participants in markdown", () => {
    const md = snapshotToMarkdown(baseSnapshot);
    expect(md).toContain("Should we ship on Friday?");
    expect(md).toContain("## Round 1 — Initial Analysis");
    expect(md).toContain(PERSONAS[0].name);
    expect(md).toContain("Judge Synthesis");
    expect(md).toContain("Disagreements");
    expect(md).toContain("$0.0200");
  });

  it("handles snapshots without judge/disagreements/cost", () => {
    const minimal: SessionSnapshot = {
      ...baseSnapshot,
      judge: null,
      disagreements: [],
      tokenTotal: null,
      finalScore: null,
    };
    const md = snapshotToMarkdown(minimal);
    expect(md).not.toContain("Judge Synthesis");
    expect(md).not.toContain("Disagreements");
    expect(md).not.toContain("Total cost");
  });

  it("snapshotToJSON round-trips via JSON.parse", () => {
    const json = snapshotToJSON(baseSnapshot);
    const parsed = JSON.parse(json);
    expect(parsed.prompt).toBe(baseSnapshot.prompt);
    expect(parsed.rounds[0].responses).toHaveLength(2);
  });

  it("snapshotFilename is slug-like and includes the extension", () => {
    const f = snapshotFilename(baseSnapshot, "md");
    expect(f).toMatch(/^roundtable-should-we-ship-on-friday-/);
    expect(f.endsWith(".md")).toBe(true);
  });

  it("snapshotFilename falls back to `session` for non-alnum prompt", () => {
    const f = snapshotFilename({ ...baseSnapshot, prompt: "??????" }, "json");
    expect(f).toContain("session");
  });
});

describe("session — hash encode/decode", () => {
  it("round-trips a full snapshot through the URL hash", async () => {
    const encoded = await encodeSnapshotToHash(baseSnapshot);
    expect(encoded.startsWith("rt=")).toBe(true);

    const decoded = await decodeSnapshotFromHash(`#${encoded}`);
    expect(decoded).not.toBeNull();
    expect(decoded?.prompt).toBe(baseSnapshot.prompt);
    expect(decoded?.rounds[0].responses).toHaveLength(2);
  });

  it("round-trips without compression when CompressionStream is absent", async () => {
    const g = globalThis as unknown as {
      CompressionStream?: unknown;
      DecompressionStream?: unknown;
    };
    const origCompression = g.CompressionStream;
    const origDecompression = g.DecompressionStream;
    g.CompressionStream = undefined;
    g.DecompressionStream = undefined;
    try {
      const encoded = await encodeSnapshotToHash(baseSnapshot);
      expect(encoded.startsWith("rt=r")).toBe(true); // raw marker
      const decoded = await decodeSnapshotFromHash(`#${encoded}`);
      expect(decoded?.prompt).toBe(baseSnapshot.prompt);
    } finally {
      g.CompressionStream = origCompression;
      g.DecompressionStream = origDecompression;
    }
  });

  it("decodeSnapshotFromHash returns null for junk", async () => {
    expect(await decodeSnapshotFromHash("#nothing")).toBeNull();
    expect(await decodeSnapshotFromHash("#rt=garbage!")).toBeNull();
    expect(await decodeSnapshotFromHash("")).toBeNull();
  });

  it("decodeSnapshotFromHash rejects wrong version", async () => {
    const fake = { ...baseSnapshot, v: 99 };
    // Manually encode as raw
    const b64 = Buffer.from(JSON.stringify(fake), "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const decoded = await decodeSnapshotFromHash(`#rt=r${b64}`);
    expect(decoded).toBeNull();
  });
});

describe("session — downloadBlob", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an anchor, clicks, and revokes the object URL", () => {
    const created: HTMLAnchorElement[] = [];
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreate(tag) as HTMLAnchorElement;
      if (tag === "a") {
        el.click = vi.fn();
        created.push(el);
      }
      return el;
    });

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();

    downloadBlob("test.md", "# hello", "text/markdown");

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
    expect(created.length).toBe(1);
    expect(created[0].click).toHaveBeenCalled();

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });
});
