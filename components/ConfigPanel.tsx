"use client";

// ─────────────────────────────────────────────────────────────
// Config Panel — Engine selector, toggles, judge model
// ─────────────────────────────────────────────────────────────

import { useArenaStore } from "@/lib/store";
import { ChevronDown, Dices, Eye, ZapOff, Gavel, Sliders } from "lucide-react";
import { useMemo, useState, useRef, useEffect } from "react";

function Toggle({
  label,
  description,
  icon,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`w-full flex items-start gap-3 px-3.5 py-3 rounded-xl transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed border ${
        checked
          ? "bg-arena-accent/10 border-arena-accent/45 shadow-[0_0_14px_-6px_rgba(255,98,0,0.4)]"
          : "bg-black/35 border-white/[0.06] hover:border-arena-blue/40"
      }`}
    >
      <div
        className={`w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 shrink-0 transition-all ${
          checked
            ? "bg-gradient-to-br from-[#ff8a3a] to-[#e25400] text-white shadow-glow-orange-sm"
            : "bg-black/40 text-arena-muted border border-white/[0.08]"
        }`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-[12px] font-semibold tracking-tight ${checked ? "text-arena-glow" : "text-arena-text"}`}
        >
          {label}
        </p>
        <p className="text-[10px] text-arena-muted leading-relaxed mt-0.5">{description}</p>
      </div>
      <div className={`glass-toggle ${checked ? "on" : ""} mt-1`}>
        <div className="knob" />
      </div>
    </button>
  );
}

export default function ConfigPanel() {
  const options = useArenaStore((s) => s.options);
  const setOption = useArenaStore((s) => s.setOption);
  const availableModels = useArenaStore((s) => s.availableModels);
  const isRunning = useArenaStore((s) => s.isRunning);

  const [judgeOpen, setJudgeOpen] = useState(false);
  const judgeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (judgeRef.current && !judgeRef.current.contains(e.target as Node)) setJudgeOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const judgeModel = useMemo(
    () => availableModels.find((m) => m.id === options.judgeModelId),
    [availableModels, options.judgeModelId],
  );

  const isCvp = options.engine === "cvp";

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <p className="section-label">
          <Sliders className="w-2.5 h-2.5" /> AI Engine
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(["cvp", "blind-jury"] as const).map((eng) => {
            const active = options.engine === eng;
            return (
              <button
                key={eng}
                onClick={() => setOption("engine", eng)}
                disabled={isRunning}
                className={`relative px-3 py-2.5 rounded-xl text-[12px] font-semibold border transition-colors disabled:opacity-40 overflow-hidden ${
                  active
                    ? "bg-gradient-to-br from-[#ff6200]/22 to-[#ff8a3a]/12 text-arena-glow border-arena-accent/55 shadow-[0_0_16px_-6px_rgba(255,98,0,0.5)]"
                    : "bg-black/40 text-arena-text border-white/[0.07] hover:border-arena-blue/40"
                }`}
              >
                {active && (
                  <span className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-arena-accent to-transparent" />
                )}
                {eng === "cvp" ? "CVP" : "Blind Jury"}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-arena-muted leading-relaxed">
          {isCvp
            ? "Multi-round structured debate with cross-visibility between participants."
            : "One-shot parallel responses synthesised by an independent judge."}
        </p>
      </div>

      {isCvp && (
        <div className="space-y-2">
          <Toggle
            label="Randomize order"
            description="Shuffle the speaking order in rounds 2 and beyond."
            icon={<Dices className="w-3 h-3" />}
            checked={options.randomizeOrder}
            onChange={(v) => setOption("randomizeOrder", v)}
            disabled={isRunning}
          />
          <Toggle
            label="Blind Round 1"
            description="Run Round 1 in parallel with no cross-visibility."
            icon={<Eye className="w-3 h-3" />}
            checked={options.blindFirstRound}
            onChange={(v) => setOption("blindFirstRound", v)}
            disabled={isRunning}
          />
          <Toggle
            label="Early stop"
            description="Stop once consensus stabilises between rounds."
            icon={<ZapOff className="w-3 h-3" />}
            checked={options.earlyStop}
            onChange={(v) => setOption("earlyStop", v)}
            disabled={isRunning}
          />
        </div>
      )}

      <div className="space-y-2">
        <Toggle
          label="Judge synthesis"
          description="A non-voting model produces a majority/minority summary."
          icon={<Gavel className="w-3 h-3" />}
          checked={options.judgeEnabled}
          onChange={(v) => {
            setOption("judgeEnabled", v);
            if (v && !options.judgeModelId && availableModels[0]) {
              setOption("judgeModelId", availableModels[0].id);
            }
          }}
          disabled={isRunning}
        />
        {options.judgeEnabled && (
          <div className="relative" ref={judgeRef}>
            <button
              onClick={() => setJudgeOpen((v) => !v)}
              disabled={isRunning}
              className="glass-input w-full flex items-center gap-2 px-3 py-2.5 text-[11.5px] text-arena-text disabled:opacity-40"
            >
              <Gavel className="w-3 h-3 text-arena-warning shrink-0 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
              <span className="flex-1 text-left truncate">
                {judgeModel ? (
                  <>
                    <span className="text-arena-muted">{judgeModel.providerName}</span>
                    <span className="mx-1 text-arena-border-strong">/</span>
                    <span className="font-medium">{judgeModel.modelId}</span>
                  </>
                ) : (
                  <span className="text-arena-muted">Select judge model…</span>
                )}
              </span>
              <ChevronDown className={`w-3 h-3 text-arena-muted transition-transform ${judgeOpen ? "rotate-180 text-arena-accent" : ""}`} />
            </button>
            {judgeOpen && (
              <div className="absolute z-50 left-0 right-0 top-full mt-1.5 max-h-[260px] overflow-y-auto glass-strong rounded-2xl">
                {availableModels.length === 0 && (
                  <p className="px-3 py-2 text-[10px] text-arena-muted">No models available.</p>
                )}
                {availableModels.map((m) => {
                  const isSel = options.judgeModelId === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        setOption("judgeModelId", m.id);
                        setJudgeOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3.5 py-2 text-[11.5px] transition-all ${
                        isSel
                          ? "bg-arena-accent/12 text-arena-glow"
                          : "text-arena-text hover:bg-white/[0.03]"
                      }`}
                    >
                      <span className="text-arena-muted text-[9.5px] min-w-[60px] truncate">
                        {m.providerName}
                      </span>
                      <span className="flex-1 text-left truncate">{m.modelId}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
