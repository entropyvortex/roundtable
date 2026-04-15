// ─────────────────────────────────────────────────────────────
// RoundTable — Session Export / Import / Share
// ─────────────────────────────────────────────────────────────
// Serialises a completed run to Markdown, JSON, or a URL-hash
// permalink. The permalink is reversible — loading a URL with
// `#rt=<payload>` rehydrates the store in read-only view mode.

import type { SessionSnapshot } from "./types";

const HASH_KEY = "rt";

// ── Snapshot → Markdown ────────────────────────────────────

export function snapshotToMarkdown(snapshot: SessionSnapshot): string {
  const date = new Date(snapshot.createdAt).toISOString();
  const engineName = snapshot.engine === "blind-jury" ? "Blind Jury" : "CVP";

  const lines: string[] = [];
  lines.push("# RoundTable Session");
  lines.push("");
  lines.push(`**Prompt**: ${snapshot.prompt}`);
  lines.push(`**Engine**: ${engineName}`);
  lines.push(`**Date**: ${date}`);
  if (snapshot.finalScore !== null) {
    lines.push(`**Final consensus score**: ${snapshot.finalScore}%`);
  }
  if (snapshot.tokenTotal && snapshot.tokenTotal.totalTokens > 0) {
    lines.push(
      `**Total cost**: $${snapshot.tokenTotal.estimatedCostUSD.toFixed(4)} (${snapshot.tokenTotal.totalTokens.toLocaleString()} tokens)`,
    );
  }
  lines.push("");

  lines.push("## Participants");
  for (const p of snapshot.participants) {
    lines.push(`- **${p.persona.name}** — ${p.modelInfo.providerName} / ${p.modelInfo.modelId}`);
  }
  lines.push("");

  for (const round of snapshot.rounds) {
    lines.push(`## Round ${round.number} — ${round.label}`);
    lines.push(`_Consensus score: ${round.consensusScore}%_`);
    lines.push("");
    for (const r of round.responses) {
      const p = snapshot.participants.find((x) => x.id === r.participantId);
      const heading = p
        ? `${p.persona.name} (${p.modelInfo.providerName}/${p.modelInfo.modelId})`
        : r.participantId;
      lines.push(`### ${heading} — confidence ${r.confidence}%`);
      lines.push(r.content.replace(/\nCONFIDENCE:\s*\d+\s*$/i, "").trim());
      lines.push("");
    }
  }

  if (snapshot.disagreements.length > 0) {
    lines.push("## Disagreements");
    for (const d of snapshot.disagreements) {
      lines.push(`- Round ${d.round}: ${d.label} (severity ${d.severity})`);
    }
    lines.push("");
  }

  if (snapshot.judge) {
    lines.push(`## Judge Synthesis — ${snapshot.judge.providerName} / ${snapshot.judge.modelId}`);
    lines.push(snapshot.judge.content);
    lines.push("");
  }

  return lines.join("\n");
}

// ── Snapshot → JSON ────────────────────────────────────────

export function snapshotToJSON(snapshot: SessionSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

// ── Snapshot ↔ URL hash ────────────────────────────────────

/**
 * Encode to a base64url payload. Uses `CompressionStream` when
 * available to keep the URL short, falls back to plain base64
 * otherwise.
 */
export async function encodeSnapshotToHash(snapshot: SessionSnapshot): Promise<string> {
  const json = JSON.stringify(snapshot);
  const bytes = new TextEncoder().encode(json);

  // Attempt compression
  const gz = await maybeCompress(bytes);
  const payload = gz ?? bytes;
  const marker = gz ? "c" : "r";
  const base64 = bytesToBase64Url(payload);
  return `${HASH_KEY}=${marker}${base64}`;
}

/** Reverse of encodeSnapshotToHash. Returns null on any failure. */
export async function decodeSnapshotFromHash(hash: string): Promise<SessionSnapshot | null> {
  try {
    const trimmed = hash.replace(/^#/, "");
    const params = new URLSearchParams(trimmed);
    const value = params.get(HASH_KEY);
    if (!value) return null;
    const marker = value[0];
    const encoded = value.slice(1);
    const bytes = base64UrlToBytes(encoded);
    let raw: Uint8Array;
    if (marker === "c") {
      const decompressed = await maybeDecompress(bytes);
      if (!decompressed) return null;
      raw = decompressed;
    } else {
      raw = bytes;
    }
    const json = new TextDecoder().decode(raw);
    const parsed = JSON.parse(json) as SessionSnapshot;
    if (parsed.v !== 1 || !Array.isArray(parsed.rounds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ── Compression helpers ────────────────────────────────────

type CompressionStreamCtor = new (format: string) => {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
};
type DecompressionStreamCtor = new (format: string) => {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
};

function getCompressionCtor(): CompressionStreamCtor | null {
  const g = globalThis as unknown as { CompressionStream?: CompressionStreamCtor };
  return typeof g.CompressionStream === "function" ? g.CompressionStream : null;
}

function getDecompressionCtor(): DecompressionStreamCtor | null {
  const g = globalThis as unknown as { DecompressionStream?: DecompressionStreamCtor };
  return typeof g.DecompressionStream === "function" ? g.DecompressionStream : null;
}

async function maybeCompress(bytes: Uint8Array): Promise<Uint8Array | null> {
  const Ctor = getCompressionCtor();
  if (!Ctor) return null;
  try {
    const cs = new Ctor("deflate-raw");
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const out = await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}

async function maybeDecompress(bytes: Uint8Array): Promise<Uint8Array | null> {
  const Ctor = getDecompressionCtor();
  if (!Ctor) return null;
  try {
    const ds = new Ctor("deflate-raw");
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const out = await new Response(ds.readable).arrayBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}

// ── base64url ──────────────────────────────────────────────

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  // `btoa` is available in both browser and Node 18+
  const base64 =
    typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4);
  const binary =
    typeof atob === "function" ? atob(padded) : Buffer.from(padded, "base64").toString("binary");
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// ── Browser file download ──────────────────────────────────

export function downloadBlob(filename: string, data: string, mime: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function snapshotFilename(snapshot: SessionSnapshot, ext: string): string {
  const stamp = new Date(snapshot.createdAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const slug =
    snapshot.prompt
      .slice(0, 40)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "session";
  return `roundtable-${slug}-${stamp}.${ext}`;
}
