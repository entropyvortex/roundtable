"use client";

// ─────────────────────────────────────────────────────────────
// Persona Builder — axis sliders, no free-text
// ─────────────────────────────────────────────────────────────
// The user picks a name, emoji, color and 6 axis levels. The
// resulting CustomPersonaSpec is passed to the parent which
// uses `composeCustomPersona` to build a Persona for the
// AISelector. Server side, the spec is re-sanitised and the
// system prompt is rebuilt from vetted phrase fragments.
// No user-typed free text reaches the LLM.

import { useState } from "react";
import { AXIS_KEYS, AXIS_LEVELS, AXIS_META, DEFAULT_CUSTOM_SPEC } from "@/lib/personas";
import type { AxisLevel, CustomPersonaSpec } from "@/lib/types";
import { Sliders, Save, X } from "lucide-react";

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

const EMOJI_PRESETS = [
  "🎛️",
  "🧭",
  "🦉",
  "🦊",
  "🐙",
  "🦄",
  "🌱",
  "🛡️",
  "🏛️",
  "💡",
  "🧪",
  "🪞",
];

const STORAGE_KEY = "roundtable.customPersonaSpec.v1";
const MAX_NAME_LEN = 32;

export interface PersonaBuilderProps {
  initial?: CustomPersonaSpec;
  onSave: (spec: CustomPersonaSpec) => void;
  onCancel: () => void;
}

function readStoredSpec(): CustomPersonaSpec | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CustomPersonaSpec;
    if (parsed && parsed.id === "custom") return parsed;
  } catch {
    // non-fatal
  }
  return null;
}

export default function PersonaBuilder({ initial, onSave, onCancel }: PersonaBuilderProps) {
  const [spec, setSpec] = useState<CustomPersonaSpec>(
    () => initial ?? readStoredSpec() ?? DEFAULT_CUSTOM_SPEC,
  );

  const setAxis = (key: (typeof AXIS_KEYS)[number], v: AxisLevel) => {
    setSpec((s) => ({ ...s, axes: { ...s.axes, [key]: v } }));
  };

  const handleSave = () => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(spec));
      } catch {
        // localStorage failure is non-fatal — user can still use the spec this session
      }
    }
    onSave(spec);
  };

  return (
    <div className="rounded-xl border border-arena-border/60 bg-arena-surface p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Sliders className="w-3.5 h-3.5 text-arena-accent" />
        <h4 className="text-[10px] font-semibold text-arena-muted uppercase tracking-[0.15em] flex-1">
          Custom Persona Builder
        </h4>
        <button
          onClick={onCancel}
          className="p-1 text-arena-muted hover:text-arena-text rounded transition-colors"
          aria-label="Close persona builder"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Identity */}
      <div className="space-y-2">
        <label className="block text-[9px] text-arena-muted uppercase tracking-[0.12em]">
          Display Name
        </label>
        <input
          type="text"
          value={spec.name}
          onChange={(e) =>
            setSpec((s) => ({ ...s, name: e.target.value.slice(0, MAX_NAME_LEN) }))
          }
          maxLength={MAX_NAME_LEN}
          placeholder="Custom Participant"
          className="w-full bg-arena-bg border border-arena-border rounded-lg px-3 py-1.5 text-[12px] text-arena-text placeholder:text-arena-muted/40 focus:outline-none focus:border-arena-accent/60"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-[9px] text-arena-muted uppercase tracking-[0.12em]">
            Emoji
          </label>
          <div className="flex flex-wrap gap-1">
            {EMOJI_PRESETS.map((e) => (
              <button
                key={e}
                onClick={() => setSpec((s) => ({ ...s, emoji: e }))}
                className={`w-7 h-7 rounded-md flex items-center justify-center text-[14px] transition-all ${
                  spec.emoji === e
                    ? "bg-arena-accent/20 ring-1 ring-arena-accent"
                    : "bg-arena-bg hover:bg-arena-accent/10"
                }`}
                aria-label={`Pick emoji ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[9px] text-arena-muted uppercase tracking-[0.12em]">
            Color
          </label>
          <div className="flex flex-wrap gap-1">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => setSpec((s) => ({ ...s, color: c }))}
                className={`w-6 h-6 rounded-md transition-all ${
                  spec.color === c ? "ring-2 ring-offset-1 ring-offset-arena-surface" : ""
                }`}
                style={{ backgroundColor: c, boxShadow: spec.color === c ? `0 0 0 1px ${c}` : undefined }}
                aria-label={`Pick color ${c}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Axis sliders */}
      <div className="space-y-2.5 pt-1 border-t border-arena-border/30">
        {AXIS_KEYS.map((key) => {
          const meta = AXIS_META[key];
          const current = spec.axes[key];
          const idx = AXIS_LEVELS.indexOf(current);
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-medium text-arena-text">{meta.label}</span>
                <span className="text-[9px] font-mono text-arena-accent tabular-nums">
                  {meta.levels[current]}
                </span>
              </div>
              <div className="flex gap-1">
                {AXIS_LEVELS.map((lvl, i) => (
                  <button
                    key={lvl}
                    onClick={() => setAxis(key, lvl)}
                    className={`flex-1 py-1 rounded-md text-[9px] font-medium transition-all border ${
                      lvl === current
                        ? "bg-arena-accent/15 text-arena-accent border-arena-accent/40"
                        : "bg-arena-bg text-arena-muted border-arena-border/60 hover:border-arena-border"
                    }`}
                    style={{ opacity: i === idx ? 1 : 0.85 }}
                    aria-pressed={lvl === current}
                  >
                    {meta.levels[lvl]}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-arena-border/30">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[14px]"
          style={{ backgroundColor: `${spec.color}20`, color: spec.color }}
        >
          {spec.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-arena-text truncate">
            {spec.name || "Custom Participant"}
          </p>
          <p className="text-[9px] text-arena-muted truncate">
            {AXIS_KEYS.map((k) => AXIS_META[k].levels[spec.axes[k]]).join(" · ")}
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!spec.name.trim()}
          className="flex items-center gap-1.5 bg-arena-accent text-white rounded-md px-3 py-1.5 text-[11px] font-medium hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <Save className="w-3 h-3" />
          Use
        </button>
      </div>
    </div>
  );
}
