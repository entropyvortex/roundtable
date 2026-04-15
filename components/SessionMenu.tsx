"use client";

// ─────────────────────────────────────────────────────────────
// Session Menu — Export & Share dropdown
// ─────────────────────────────────────────────────────────────
// Shows up once a run has finished. Lets the user download the
// session as Markdown/JSON or copy a permalink that rehydrates
// the run into the read-only viewer.

import { useArenaStore } from "@/lib/store";
import {
  downloadBlob,
  encodeSnapshotToHash,
  snapshotFilename,
  snapshotToJSON,
  snapshotToMarkdown,
} from "@/lib/session";
import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Download, Share2, FileText, FileJson, Link2, Check } from "lucide-react";

export default function SessionMenu() {
  const getSnapshot = useArenaStore((s) => s.getSnapshot);
  const finalScore = useArenaStore((s) => s.finalScore);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleMarkdown = useCallback(() => {
    const snap = getSnapshot();
    downloadBlob(snapshotFilename(snap, "md"), snapshotToMarkdown(snap), "text/markdown");
    toast.success("Markdown downloaded");
    setOpen(false);
  }, [getSnapshot]);

  const handleJSON = useCallback(() => {
    const snap = getSnapshot();
    downloadBlob(snapshotFilename(snap, "json"), snapshotToJSON(snap), "application/json");
    toast.success("JSON downloaded");
    setOpen(false);
  }, [getSnapshot]);

  const handleLink = useCallback(async () => {
    const snap = getSnapshot();
    try {
      const encoded = await encodeSnapshotToHash(snap);
      const url = `${window.location.origin}${window.location.pathname}#${encoded}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Permalink copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to build permalink");
    }
    setOpen(false);
  }, [getSnapshot]);

  if (finalScore === null) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-arena-surface border border-arena-border/60 text-[11px] text-arena-muted hover:text-arena-text hover:border-arena-accent/40 transition-colors"
      >
        <Share2 className="w-3 h-3" />
        Export
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-arena-surface border border-arena-border rounded-lg shadow-xl shadow-black/30 overflow-hidden z-50">
          <button
            onClick={handleMarkdown}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-[11px] text-arena-text hover:bg-arena-accent/5"
          >
            <FileText className="w-3.5 h-3.5 text-arena-accent" />
            <span className="flex-1 text-left">Download Markdown</span>
          </button>
          <button
            onClick={handleJSON}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-[11px] text-arena-text hover:bg-arena-accent/5"
          >
            <FileJson className="w-3.5 h-3.5 text-arena-accent" />
            <span className="flex-1 text-left">Download JSON</span>
          </button>
          <div className="h-px bg-arena-border/40" />
          <button
            onClick={handleLink}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-[11px] text-arena-text hover:bg-arena-accent/5"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-arena-success" />
            ) : (
              <Link2 className="w-3.5 h-3.5 text-arena-accent" />
            )}
            <span className="flex-1 text-left">{copied ? "Copied" : "Copy permalink"}</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** Stand-alone icon button for the "Download" UX without a menu */
export function DownloadIconButton() {
  const getSnapshot = useArenaStore((s) => s.getSnapshot);
  const finalScore = useArenaStore((s) => s.finalScore);

  const handleClick = useCallback(() => {
    const snap = getSnapshot();
    downloadBlob(snapshotFilename(snap, "md"), snapshotToMarkdown(snap), "text/markdown");
    toast.success("Markdown downloaded");
  }, [getSnapshot]);

  if (finalScore === null) return null;

  return (
    <button
      onClick={handleClick}
      className="p-1.5 rounded-md bg-arena-surface border border-arena-border/60 text-arena-muted hover:text-arena-text transition-colors"
      title="Download as Markdown"
    >
      <Download className="w-3 h-3" />
    </button>
  );
}
