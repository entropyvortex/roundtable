// ─────────────────────────────────────────────────────────────
// RoundTable — Download a run as Markdown or JSON
// ─────────────────────────────────────────────────────────────

import { downloadBlob, snapshotFilename, snapshotToJSON, snapshotToMarkdown } from "./session";
import type { SessionSnapshot } from "./types";

export type ExportFormat = "md" | "json";

/** Trigger a browser download of `snapshot` in `format`, named after its question. */
export function exportSnapshot(snapshot: SessionSnapshot, format: ExportFormat): void {
  if (format === "md") {
    downloadBlob(snapshotFilename(snapshot, "md"), snapshotToMarkdown(snapshot), "text/markdown");
  } else {
    downloadBlob(snapshotFilename(snapshot, "json"), snapshotToJSON(snapshot), "application/json");
  }
}
