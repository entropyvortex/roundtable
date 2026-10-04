"use client";

// ─────────────────────────────────────────────────────────────
// Persona Builder — axis pickers, no free-text prompt
// ─────────────────────────────────────────────────────────────
// The user picks a name, emoji, color and 6 axis levels. The
// resulting CustomPersonaSpec (sanitised with the same function
// the server uses) is passed to the parent, which calls
// `composeCustomPersona` to build a Persona. Server side, the spec
// is re-sanitised and the system prompt is rebuilt from vetted
// phrase fragments: only the sanitised name reaches the model.
//
// The last spec the user saved is cached in localStorage under
// STORAGE_KEY and used as the starting point next time.

import { useId, useState } from "react";
import { Check, X } from "lucide-react";
import {
  AXIS_KEYS,
  AXIS_LEVELS,
  AXIS_META,
  DEFAULT_CUSTOM_SPEC,
  sanitizeCustomPersonaSpec,
} from "@/lib/personas";
import type { AxisLevel, CustomPersonaSpec } from "@/lib/types";
import { Button, Field, Input, Segmented, cn } from "@/components/ui";

const COLOR_PRESETS = [
  "#ef4444",
  "#f59e0b",
  "#eab308",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#94a3b8",
];

const EMOJI_PRESETS = ["🎛️", "🧭", "🦉", "🦊", "🐙", "🦄", "🌱", "🛡️", "🏛️", "💡", "🧪", "🪞"];

export const STORAGE_KEY = "roundtable.customPersonaSpec.v1";
const MAX_NAME_LEN = 32;

export interface PersonaBuilderProps {
  initial?: CustomPersonaSpec;
  /** Receives the sanitised spec (safe to pass to `composeCustomPersona`). */
  onSave: (spec: CustomPersonaSpec) => void;
  onCancel: () => void;
  className?: string;
}

function readStoredSpec(): CustomPersonaSpec | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    // The same validation the server applies; a stale or edited cache yields null.
    return sanitizeCustomPersonaSpec(JSON.parse(raw));
  } catch {
    return null;
  }
}

export default function PersonaBuilder({
  initial,
  onSave,
  onCancel,
  className,
}: PersonaBuilderProps) {
  const headingId = `persona-builder-${useId()}`;
  const [spec, setSpec] = useState<CustomPersonaSpec>(
    () => initial ?? readStoredSpec() ?? DEFAULT_CUSTOM_SPEC,
  );

  const safe = sanitizeCustomPersonaSpec(spec);
  const nameError = safe
    ? undefined
    : spec.name.trim().length === 0
      ? "Enter a name."
      : "Use at least one letter or number in the name.";

  const setAxis = (key: (typeof AXIS_KEYS)[number], v: AxisLevel) => {
    setSpec((s) => ({ ...s, axes: { ...s.axes, [key]: v } }));
  };

  const handleSave = () => {
    if (!safe) return;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
      } catch {
        // localStorage failure is non-fatal — user can still use the spec this session
      }
    }
    onSave(safe);
  };

  const summary = AXIS_KEYS.map((k) => AXIS_META[k].levels[spec.axes[k]]).join(" · ");

  return (
    <section
      aria-labelledby={headingId}
      className={cn("rounded-card border border-border bg-surface p-4", className)}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={headingId} className="text-base font-semibold text-fg">
            Custom persona
          </h3>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            Tune six traits. The server writes the instructions from fixed phrases; only the name
            reaches the model, stripped to letters, digits and basic punctuation.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          aria-label="Close persona builder"
          className="px-2"
          icon={<X className="h-4 w-4" />}
        />
      </div>

      <div className="flex flex-col gap-4">
        <Field
          label="Name"
          aside={`${spec.name.length} / ${MAX_NAME_LEN}`}
          error={nameError}
          help="Shown on the panel and in the transcript."
        >
          <Input
            type="text"
            value={spec.name}
            onChange={(e) =>
              setSpec((s) => ({ ...s, name: e.target.value.slice(0, MAX_NAME_LEN) }))
            }
            maxLength={MAX_NAME_LEN}
            placeholder="Custom Participant"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-fg">Emoji</legend>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_PRESETS.map((e) => {
                const on = spec.emoji === e;
                return (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setSpec((s) => ({ ...s, emoji: e }))}
                    aria-label={`Pick emoji ${e}`}
                    aria-pressed={on}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-control border text-base transition-colors",
                      on
                        ? "border-accent bg-accent/10"
                        : "border-border bg-surface hover:bg-surface-2",
                    )}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-fg">Color</legend>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PRESETS.map((c) => {
                const on = spec.color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSpec((s) => ({ ...s, color: c }))}
                    aria-label={`Pick color ${c}`}
                    aria-pressed={on}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-control border transition-colors",
                      on ? "border-fg" : "border-border hover:bg-surface-2",
                    )}
                  >
                    <span
                      aria-hidden
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: c }}
                    />
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          {AXIS_KEYS.map((key) => {
            const meta = AXIS_META[key];
            return (
              <div
                key={key}
                className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <span className="text-sm font-medium text-fg">{meta.label}</span>
                <Segmented<AxisLevel>
                  label={meta.label}
                  size="sm"
                  fullWidth
                  className="sm:w-[22rem]"
                  value={spec.axes[key]}
                  onChange={(v) => setAxis(key, v)}
                  options={AXIS_LEVELS.map((lvl) => ({ value: lvl, label: meta.levels[lvl] }))}
                />
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: spec.color }}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">
                <span aria-hidden className="mr-1">
                  {spec.emoji}
                </span>
                {spec.name.trim() || "Custom Participant"}
              </p>
              <p className="truncate text-[13px] text-fg-muted">{summary}</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={!safe}
              icon={<Check className="h-4 w-4" />}
            >
              Use persona
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
