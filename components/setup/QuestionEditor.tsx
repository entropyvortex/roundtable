"use client";

// ─────────────────────────────────────────────────────────────
// QuestionEditor — the question the panel will debate
// ─────────────────────────────────────────────────────────────
// Large textarea bound to the store's `prompt`, a character count
// against the server's 10,000 limit, and example questions from
// lib/prompt-library.ts grouped by category. Clicking an example
// fills the textarea. Once the user writes their own question the
// examples fold behind a "Show examples" button so a stray click
// can't wipe their text.

import { useId, useState, type KeyboardEvent } from "react";
import { MAX_PROMPT_LENGTH } from "@/lib/limits";
import { PROMPT_LIBRARY, type PromptPreset } from "@/lib/prompt-library";
import { useArenaStore } from "@/lib/store";
import { Button, Card, Textarea, cn } from "@/components/ui";

export interface QuestionEditorProps {
  /** Called on Ctrl/⌘ + Enter in the textarea (e.g. start the run). */
  onSubmit?: () => void;
  className?: string;
}

const NUMBER = new Intl.NumberFormat("en-US");

/** Examples grouped by category, categories in first-appearance order. */
function groupByCategory(presets: readonly PromptPreset[]) {
  const groups = new Map<PromptPreset["category"], PromptPreset[]>();
  for (const p of presets) {
    const list = groups.get(p.category);
    if (list) list.push(p);
    else groups.set(p.category, [p]);
  }
  return [...groups.entries()];
}

const GROUPS = groupByCategory(PROMPT_LIBRARY);

export default function QuestionEditor({ onSubmit, className }: QuestionEditorProps) {
  const prompt = useArenaStore((s) => s.prompt);
  const setPrompt = useArenaStore((s) => s.setPrompt);
  const isRunning = useArenaStore((s) => s.isRunning);

  const uid = useId();
  const headingId = `question-${uid}`;
  const helpId = `question-help-${uid}`;
  const countId = `question-count-${uid}`;
  const errorId = `question-error-${uid}`;
  const examplesId = `question-examples-${uid}`;

  const [examplesToggled, setExamplesToggled] = useState(false);

  const length = prompt.length;
  const tooLong = length > MAX_PROMPT_LENGTH;
  const isExample = PROMPT_LIBRARY.some((p) => p.prompt === prompt);
  const ownText = prompt.trim().length > 0 && !isExample;
  // Examples show while the box is empty or holds an example; otherwise
  // they fold away until the user asks for them.
  const showExamples = !ownText || examplesToggled;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <Card as="section" aria-labelledby={headingId} className={className}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-base font-semibold text-fg">
          Question
        </h2>
        <span
          id={countId}
          className={cn("text-[13px] tabular-nums", tooLong ? "text-danger" : "text-fg-muted")}
        >
          {NUMBER.format(length)} / {NUMBER.format(MAX_PROMPT_LENGTH)}
          <span className="sr-only"> characters</span>
        </span>
      </div>

      <Textarea
        aria-labelledby={headingId}
        aria-describedby={[helpId, countId, tooLong ? errorId : null].filter(Boolean).join(" ")}
        aria-invalid={tooLong || undefined}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={isRunning}
        rows={5}
        placeholder="What should the panel decide? Include the context and constraints that matter."
        className="min-h-[8rem] resize-y"
      />
      <p id={helpId} className="mt-1.5 text-[13px] text-fg-muted">
        One clear question works best. Ctrl or ⌘ + Enter runs it.
      </p>
      {tooLong && (
        <p id={errorId} className="mt-1 text-[13px] text-danger">
          The server accepts up to {NUMBER.format(MAX_PROMPT_LENGTH)} characters. Remove{" "}
          {NUMBER.format(length - MAX_PROMPT_LENGTH)} to run.
        </p>
      )}

      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-fg">Examples</h3>
          {ownText && (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showExamples}
              aria-controls={examplesId}
              onClick={() => setExamplesToggled((v) => !v)}
            >
              {showExamples ? "Hide examples" : "Show examples"}
            </Button>
          )}
        </div>
        <div id={examplesId} hidden={!showExamples} className="mt-2">
          <div className="flex flex-col gap-2.5">
            {ownText && (
              <p className="text-[13px] text-fg-muted">
                Picking an example replaces your question.
              </p>
            )}
            {GROUPS.map(([category, presets]) => (
              <div
                key={category}
                role="group"
                aria-label={`${category} examples`}
                className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-3"
              >
                <span aria-hidden className="w-24 shrink-0 text-[13px] text-fg-muted">
                  {category}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((preset) => {
                    const active = prompt === preset.prompt;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-pressed={active}
                        title={preset.prompt}
                        disabled={isRunning}
                        onClick={() => setPrompt(preset.prompt)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-[13px] transition-colors",
                          "disabled:cursor-not-allowed disabled:opacity-50",
                          active
                            ? "border-accent/40 bg-accent/10 text-accent"
                            : "border-border bg-surface text-fg hover:bg-surface-2",
                        )}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
