"use client";

// ─────────────────────────────────────────────────────────────
// AttemptsEditor — the candidate solutions for Compare attempts
// ─────────────────────────────────────────────────────────────
// 2–6 pasted attempts (a diff or code), each with an optional label
// and optional check results (build, tests, lint…). Labels stay on the
// user's screen: jurors see neutral letters in a shuffled order.

import { Plus, Trash2 } from "lucide-react";
import {
  MAX_ATTEMPT_CHARS,
  MAX_ATTEMPT_LABEL_CHARS,
  MAX_ATTEMPTS,
  MAX_CHECK_NAME_CHARS,
  MAX_CHECK_OUTPUT_CHARS,
  MAX_CHECKS_PER_ATTEMPT,
  MIN_ATTEMPTS,
} from "@/lib/limits";
import { useArenaStore } from "@/lib/store";
import type { AttemptCheckStatus, AttemptDraft } from "@/lib/types";
import { Button, Card, Field, Input, Select, Textarea, cn } from "@/components/ui";

const NUMBER = new Intl.NumberFormat("en-US");

const STATUSES: { value: AttemptCheckStatus; label: string }[] = [
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "unknown", label: "Unknown" },
];

export interface AttemptsEditorProps {
  className?: string;
}

export default function AttemptsEditor({ className }: AttemptsEditorProps) {
  const attempts = useArenaStore((s) => s.attempts);
  const addAttempt = useArenaStore((s) => s.addAttempt);
  const isRunning = useArenaStore((s) => s.isRunning);

  return (
    <Card as="section" aria-labelledby="attempts-heading" className={className}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 id="attempts-heading" className="text-base font-semibold text-fg">
          Attempts
        </h2>
        <span className="text-[13px] tabular-nums text-fg-muted">
          {attempts.length} of {MAX_ATTEMPTS}
        </span>
      </div>
      <p className="mb-3 text-[13px] text-fg-muted">
        Paste {MIN_ATTEMPTS}–{MAX_ATTEMPTS} solutions to the task (a diff or the changed code).
        Labels stay on your screen: each juror sees the attempts as A, B, C… in its own shuffled
        order. A failed check keeps an attempt from being recommended unless every attempt failed.
      </p>
      <ol className="flex flex-col gap-4">
        {attempts.map((attempt, i) => (
          <AttemptRow
            key={attempt.id}
            attempt={attempt}
            index={i}
            canRemove={attempts.length > MIN_ATTEMPTS}
            disabled={isRunning}
          />
        ))}
      </ol>
      <Button
        variant="secondary"
        size="sm"
        className="mt-3"
        onClick={addAttempt}
        disabled={isRunning || attempts.length >= MAX_ATTEMPTS}
      >
        <Plus aria-hidden className="size-4" />
        Add attempt
      </Button>
    </Card>
  );
}

function AttemptRow({
  attempt,
  index,
  canRemove,
  disabled,
}: {
  attempt: AttemptDraft;
  index: number;
  canRemove: boolean;
  disabled: boolean;
}) {
  const updateAttempt = useArenaStore((s) => s.updateAttempt);
  const removeAttempt = useArenaStore((s) => s.removeAttempt);
  const addAttemptCheck = useArenaStore((s) => s.addAttemptCheck);
  const updateAttemptCheck = useArenaStore((s) => s.updateAttemptCheck);
  const removeAttemptCheck = useArenaStore((s) => s.removeAttemptCheck);
  const name = attempt.label.trim() || `Attempt ${index + 1}`;
  const tooLong = attempt.content.length > MAX_ATTEMPT_CHARS;

  return (
    <li className="rounded-lg border border-border p-3" aria-label={name}>
      <div className="flex items-end gap-2">
        <Field label="Label" className="flex-1">
          <Input
            value={attempt.label}
            maxLength={MAX_ATTEMPT_LABEL_CHARS}
            placeholder={`Attempt ${index + 1}`}
            onChange={(e) => updateAttempt(attempt.id, { label: e.target.value })}
            disabled={disabled}
          />
        </Field>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Remove ${name}`}
          onClick={() => removeAttempt(attempt.id)}
          disabled={disabled || !canRemove}
        >
          <Trash2 aria-hidden className="size-4" />
        </Button>
      </div>
      <Field
        label="Solution"
        className="mt-2"
        aside={
          <span className={cn("tabular-nums", tooLong ? "text-danger" : undefined)}>
            {NUMBER.format(attempt.content.length)} / {NUMBER.format(MAX_ATTEMPT_CHARS)}
          </span>
        }
        error={tooLong ? `Shorten to ${NUMBER.format(MAX_ATTEMPT_CHARS)} characters` : undefined}
      >
        <Textarea
          value={attempt.content}
          rows={6}
          spellCheck={false}
          placeholder="Paste the diff or the changed code"
          className="min-h-[7rem] resize-y font-mono text-[12.5px]"
          onChange={(e) => updateAttempt(attempt.id, { content: e.target.value })}
          disabled={disabled}
        />
      </Field>

      {attempt.checks.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2" aria-label={`Checks for ${name}`}>
          {attempt.checks.map((check, k) => (
            <li key={k} className="rounded-md bg-surface-2 p-2">
              <div className="flex items-end gap-2">
                <Field label="Check" className="flex-1">
                  <Input
                    value={check.name}
                    maxLength={MAX_CHECK_NAME_CHARS}
                    placeholder="e.g. tests"
                    onChange={(e) => updateAttemptCheck(attempt.id, k, { name: e.target.value })}
                    disabled={disabled}
                  />
                </Field>
                <Field label="Result">
                  <Select
                    value={check.status}
                    onChange={(e) =>
                      updateAttemptCheck(attempt.id, k, {
                        status: e.target.value as AttemptCheckStatus,
                      })
                    }
                    disabled={disabled}
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove check ${check.name || k + 1}`}
                  onClick={() => removeAttemptCheck(attempt.id, k)}
                  disabled={disabled}
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </div>
              <Field label="Output excerpt (optional)" className="mt-2">
                <Textarea
                  value={check.output ?? ""}
                  rows={2}
                  maxLength={MAX_CHECK_OUTPUT_CHARS}
                  spellCheck={false}
                  className="font-mono text-[12px]"
                  onChange={(e) => updateAttemptCheck(attempt.id, k, { output: e.target.value })}
                  disabled={disabled}
                />
              </Field>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="mt-2"
        onClick={() => addAttemptCheck(attempt.id)}
        disabled={disabled || attempt.checks.length >= MAX_CHECKS_PER_ATTEMPT}
      >
        <Plus aria-hidden className="size-4" />
        Add check result
      </Button>
    </li>
  );
}
