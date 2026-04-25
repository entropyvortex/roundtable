"use client";

// ─────────────────────────────────────────────────────────────
// Config Panel — Engine selector, toggles, judge model
// ─────────────────────────────────────────────────────────────
// Lives in the sidebar, below the participant section. Controls
// the engine (CVP / Blind Jury), the CVP toggles (randomize
// order, blind first round, early stop), and the judge (enable
// + model picker).

import { useArenaStore } from "@/lib/store";
import { ChevronDown, Dices, Eye, ZapOff, Gavel, Sliders, GitMerge, Coins } from "lucide-react";
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
      className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg border transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed ${
        checked
          ? "bg-arena-accent/10 border-arena-accent/30"
          : "bg-arena-bg border-arena-border/60 hover:border-arena-border"
      }`}
    >
      <div
        className={`w-5 h-5 rounded flex items-center justify-center mt-0.5 ${
          checked ? "text-arena-accent" : "text-arena-muted"
        }`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-[11px] font-medium ${checked ? "text-arena-accent" : "text-arena-text"}`}
        >
          {label}
        </p>
        <p className="text-[9px] text-arena-muted leading-relaxed mt-0.5">{description}</p>
      </div>
      <div
        className={`w-7 h-4 rounded-full flex items-center px-0.5 transition-colors shrink-0 mt-0.5 ${
          checked ? "bg-arena-accent" : "bg-arena-border"
        }`}
      >
        <div
          className={`w-3 h-3 bg-white rounded-full transition-transform ${
            checked ? "translate-x-3" : "translate-x-0"
          }`}
        />
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
  const isAdversarial = options.engine === "adversarial";

  const engineDescriptions: Record<typeof options.engine, string> = {
    cvp: "Multi-round structured debate with cross-visibility.",
    "blind-jury": "One-shot parallel responses + judge synthesis.",
    adversarial: "Rotating attacker stress-tests positions before final synthesis.",
  };

  const engineLabels: Record<typeof options.engine, string> = {
    cvp: "CVP",
    "blind-jury": "Blind Jury",
    adversarial: "Red Team",
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[9px] font-semibold text-arena-muted uppercase tracking-[0.15em] flex items-center gap-1.5 mb-2">
          <Sliders className="w-2.5 h-2.5" /> Engine
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {(["cvp", "blind-jury", "adversarial"] as const).map((eng) => {
            const active = options.engine === eng;
            return (
              <button
                key={eng}
                onClick={() => setOption("engine", eng)}
                disabled={isRunning}
                className={`px-2 py-2 rounded-lg text-[10px] font-medium border transition-all disabled:opacity-40 ${
                  active
                    ? "bg-arena-accent/10 text-arena-accent border-arena-accent/40"
                    : "bg-arena-bg text-arena-text border-arena-border/60 hover:border-arena-border"
                }`}
              >
                {engineLabels[eng]}
              </button>
            );
          })}
        </div>
        <p className="text-[9px] text-arena-muted mt-1.5 leading-relaxed">
          {engineDescriptions[options.engine]}
        </p>
        {isAdversarial && (
          <p className="text-[9px] text-arena-warning/80 mt-1 leading-relaxed">
            One participant per stress round becomes the attacker (round-robin). Final round is a
            post-stress synthesis from every participant.
          </p>
        )}
      </div>

      {isCvp && (
        <div className="space-y-1.5">
          <Toggle
            label="Randomize order"
            description="Shuffle the speaking order in rounds 2+."
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
            description="Stop once consensus score stabilises between rounds."
            icon={<ZapOff className="w-3 h-3" />}
            checked={options.earlyStop}
            onChange={(v) => setOption("earlyStop", v)}
            disabled={isRunning}
          />
        </div>
      )}

      <div className="pt-1 border-t border-arena-border/30">
        <p className="text-[9px] font-semibold text-arena-muted uppercase tracking-[0.15em] flex items-center gap-1.5 mb-1.5">
          <Coins className="w-2.5 h-2.5" /> Cost cap
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-arena-muted">$</span>
          <input
            type="number"
            min={0}
            max={50}
            step={0.05}
            value={options.costCapUSD ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              const v = raw === "" ? undefined : Math.min(50, Math.max(0, parseFloat(raw) || 0));
              setOption("costCapUSD", v);
            }}
            placeholder="off"
            disabled={isRunning}
            className="flex-1 bg-arena-bg border border-arena-border rounded-md px-2 py-1 text-[11px] text-arena-text placeholder:text-arena-muted/40 focus:outline-none focus:border-arena-accent/60 disabled:opacity-40 font-mono tabular-nums"
          />
        </div>
        <p className="text-[9px] text-arena-muted leading-relaxed mt-1">
          Hard-abort the run if estimated cost crosses this cap. Leave blank to disable.
        </p>
      </div>

      <div className="space-y-1.5">
        <Toggle
          label="Claim extraction"
          description="LLM pass extracts structured semantic contradictions from final responses."
          icon={<GitMerge className="w-3 h-3" />}
          checked={!!options.extractClaimsEnabled}
          onChange={(v) => setOption("extractClaimsEnabled", v)}
          disabled={isRunning}
        />
        <Toggle
          label="Judge synthesis"
          description="Non-voting model produces majority/minority summary."
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
              className="w-full flex items-center gap-2 bg-arena-bg border border-arena-border rounded-lg px-3 py-2 text-[11px] text-arena-text hover:border-arena-accent/50 transition-all disabled:opacity-40"
            >
              <Gavel className="w-3 h-3 text-arena-warning shrink-0" />
              <span className="flex-1 text-left truncate">
                {judgeModel ? (
                  <>
                    <span className="text-arena-muted">{judgeModel.providerName}</span>
                    <span className="mx-1 text-arena-border">/</span>
                    <span className="font-medium">{judgeModel.modelId}</span>
                  </>
                ) : (
                  <span className="text-arena-muted">Select judge model...</span>
                )}
              </span>
              <ChevronDown className="w-3 h-3 text-arena-muted" />
            </button>
            {judgeOpen && (
              <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-[240px] overflow-y-auto bg-arena-surface border border-arena-border rounded-lg shadow-xl shadow-black/30">
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
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-all ${
                        isSel
                          ? "bg-arena-accent/10 text-arena-accent"
                          : "text-arena-text hover:bg-arena-accent/5"
                      }`}
                    >
                      <span className="text-arena-muted text-[9px] min-w-[56px] truncate">
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
