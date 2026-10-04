"use client";

// ─────────────────────────────────────────────────────────────
// History — one saved run
// ─────────────────────────────────────────────────────────────

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, FileJson, FileText, FolderOpen, GitCompare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { HistoryEntry } from "@/lib/history";
import { engineLabel, scoreLabel } from "@/lib/score-label";
import { exportSnapshot, type ExportFormat } from "@/lib/export";
import { formatAbsoluteTime, formatCost, formatRelativeTime } from "@/lib/format";
import type { Participant } from "@/lib/types";
import { Badge, Button, Input, Menu, PersonaDot, Tooltip, cn } from "@/components/ui";

export interface RunRowProps {
  entry: HistoryEntry;
  /** Open the run in the Run view. */
  onOpen: (entry: HistoryEntry) => void;
  /** Called after the user confirms the inline delete prompt. */
  onDelete: (id: string) => void;
  /** Save the note (empty string clears it). */
  onUpdateNote: (id: string, note: string) => void;
  /** Whether this run is picked for comparison. */
  selected?: boolean;
  /** Toggle this run in/out of the comparison. Omit to hide the Compare button. */
  onToggleCompare?: (id: string) => void;
  /** Two other runs are already picked — this one can't be added. */
  compareDisabled?: boolean;
  /** Reference time for the relative date (tests); defaults to now. */
  now?: number;
}

const MAX_DOTS = 8;
const NOTE_MAX = 500;

export function ParticipantDots({ participants }: { participants: Participant[] }) {
  if (participants.length === 0) return null;
  const names = participants.map((p) => p.persona.name);
  const shown = participants.slice(0, MAX_DOTS);
  const extra = participants.length - shown.length;
  return (
    <Tooltip
      content={
        <ul className="space-y-0.5">
          {participants.map((p) => (
            <li key={p.id}>
              {p.persona.name}
              <span className="opacity-75">
                {" "}
                · {p.modelInfo.providerName} / {p.modelInfo.modelId}
              </span>
            </li>
          ))}
        </ul>
      }
    >
      <span
        role="img"
        tabIndex={0}
        aria-label={`${participants.length} participants: ${names.join(", ")}`}
        className="inline-flex items-center gap-1 rounded-full px-0.5 py-1"
      >
        {shown.map((p) => (
          <PersonaDot key={p.id} color={p.persona.color} className="ring-1 ring-border" />
        ))}
        {extra > 0 && (
          <span aria-hidden className="text-xs tabular-nums text-fg-muted">
            +{extra}
          </span>
        )}
      </span>
    </Tooltip>
  );
}

function NoteEditor({
  note,
  title,
  onSave,
}: {
  note: string | undefined;
  title: string;
  onSave: (note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef(false);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
    else if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  const start = () => {
    cancelRef.current = false;
    setDraft(note ?? "");
    setEditing(true);
  };

  const finish = () => {
    const cancelled = cancelRef.current;
    cancelRef.current = false;
    setEditing(false);
    if (!cancelled && draft.trim() !== (note ?? "")) onSave(draft.trim());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter during IME composition picks a candidate; it is not a commit.
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      if (e.key === "Escape") {
        e.stopPropagation();
        cancelRef.current = true;
      }
      restoreFocusRef.current = true;
      inputRef.current?.blur();
    }
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        maxLength={NOTE_MAX}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={finish}
        onKeyDown={onKeyDown}
        aria-label={`Note for “${title}”`}
        placeholder="Add a note — Enter to save, Esc to cancel"
        className="mt-2 h-9"
      />
    );
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={start}
      aria-label={note ? `Edit note: ${note}` : `Add a note to “${title}”`}
      className={cn(
        "mt-2 block max-w-full truncate rounded-control px-1 py-0.5 -mx-1 text-left text-[13px]",
        "hover:bg-surface-2",
        note ? "text-fg" : "text-fg-muted",
      )}
    >
      {note ? note : "+ Add a note"}
    </button>
  );
}

/** One saved run: summary line, participants, note, and actions. */
export default function RunRow({
  entry,
  onOpen,
  onDelete,
  onUpdateNote,
  selected = false,
  onToggleCompare,
  compareDisabled = false,
  now,
}: RunRowProps) {
  const titleId = useId();
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const restoreDeleteFocus = useRef(false);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else if (restoreDeleteFocus.current) {
      restoreDeleteFocus.current = false;
      deleteRef.current?.focus();
    }
  }, [confirming]);

  const { snapshot } = entry;
  const label = scoreLabel(entry.score);
  const participants = snapshot.participants ?? [];

  const exportAs = (format: ExportFormat) => {
    exportSnapshot(snapshot, format);
    toast.success(format === "md" ? "Markdown downloaded" : "JSON downloaded");
  };

  const cancelDelete = () => {
    restoreDeleteFocus.current = true;
    setConfirming(false);
  };

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        "rounded-card border bg-surface p-4 transition-colors duration-150",
        selected ? "border-accent" : "border-border",
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="break-words text-[15px] font-semibold leading-snug text-fg">
            {entry.title}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-fg-muted">
            <Badge>{engineLabel(entry.engine, "short")}</Badge>
            {entry.score === null ? (
              <span>No score</span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[15px] font-semibold tabular-nums text-fg">
                  {entry.score}
                </span>
                <Badge tone={label.tone}>{label.label}</Badge>
              </span>
            )}
            <span className="sr-only">Estimated cost</span>
            <span className="tabular-nums">{formatCost(entry.cost)}</span>
            <time
              dateTime={new Date(entry.savedAt).toISOString()}
              title={formatAbsoluteTime(entry.savedAt)}
            >
              {formatRelativeTime(entry.savedAt, now)}
            </time>
            <ParticipantDots participants={participants} />
          </div>
          <NoteEditor
            note={entry.note}
            title={entry.title}
            onSave={(note) => onUpdateNote(entry.id, note)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 md:shrink-0 md:justify-end">
          <Button
            size="sm"
            variant="secondary"
            icon={<FolderOpen className="h-4 w-4" />}
            onClick={() => onOpen(entry)}
            aria-label={`Open “${entry.title}”`}
          >
            Open
          </Button>
          {onToggleCompare && (
            <Button
              size="sm"
              variant="secondary"
              aria-pressed={selected}
              disabled={!selected && compareDisabled}
              icon={selected ? <Check className="h-4 w-4" /> : <GitCompare className="h-4 w-4" />}
              onClick={() => onToggleCompare(entry.id)}
              className={cn(selected && "border-accent text-accent")}
            >
              Compare
            </Button>
          )}
          <Menu
            label="Export"
            size="sm"
            variant="ghost"
            align="end"
            items={[
              {
                id: "md",
                label: "Markdown",
                icon: <FileText className="h-4 w-4" />,
                onSelect: () => exportAs("md"),
              },
              {
                id: "json",
                label: "JSON",
                icon: <FileJson className="h-4 w-4" />,
                onSelect: () => exportAs("json"),
              },
            ]}
          />
          <Button
            ref={deleteRef}
            size="sm"
            variant="ghost"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => setConfirming(true)}
            aria-expanded={confirming}
            className="text-fg-muted hover:text-danger"
          >
            Delete
          </Button>
        </div>
      </div>

      {confirming && (
        <div
          role="group"
          aria-label="Confirm delete"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              cancelDelete();
            }
          }}
          className="mt-3 flex flex-col gap-2 rounded-control border border-danger/40 bg-danger/5 p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-fg">Delete this run from history? This can’t be undone.</p>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="danger" onClick={() => onDelete(entry.id)}>
              Delete run
            </Button>
            <Button ref={cancelRef} size="sm" variant="ghost" onClick={cancelDelete}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
