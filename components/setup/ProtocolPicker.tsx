"use client";

// ─────────────────────────────────────────────────────────────
// ProtocolPicker — engine + advanced run options
// ─────────────────────────────────────────────────────────────
// Engine as three radio cards in plain language, then an
// "Advanced" disclosure: rounds stepper (Debate / Red team), the
// Debate-only toggles (randomize order, blind round 1, early stop),
// judge synthesis + judge model, claim extraction and the cost cap.

import { ChevronRight, Minus, Plus } from "lucide-react";
import { useId, useState } from "react";
import { MAX_ROUNDS, MIN_RED_TEAM_ROUNDS, MIN_ROUNDS, minRoundsFor } from "@/lib/engine-rules";
import { MAX_COST_CAP_USD } from "@/lib/limits";
import { engineDescription, engineLabel } from "@/lib/score-label";
import { useArenaStore } from "@/lib/store";
import type { EngineType, ModelInfo, Participant } from "@/lib/types";
import { Button, Card, Field, Input, Toggle, cn } from "@/components/ui";
import ModelPicker from "./ModelPicker";

export interface ProtocolPickerProps {
  className?: string;
}

const ENGINES: { id: EngineType; facts: string }[] = [
  { id: "cvp", facts: `${MIN_ROUNDS}–${MAX_ROUNDS} rounds` },
  { id: "blind-jury", facts: "1 round" },
  { id: "adversarial", facts: `${MIN_RED_TEAM_ROUNDS}–${MAX_ROUNDS} rounds` },
];

/**
 * Default judge: a recommended (preferred) model that is not already on
 * the panel, else any recommended model, else the first model.
 */
export function suggestJudgeModel(
  availableModels: readonly ModelInfo[],
  participants: readonly Pick<Participant, "modelInfo">[],
): ModelInfo | undefined {
  const seated = new Set(participants.map((p) => p.modelInfo.id));
  const preferred = availableModels.filter((m) => m.preferred);
  return (
    preferred.find((m) => !seated.has(m.id)) ??
    availableModels.find((m) => !seated.has(m.id)) ??
    preferred[0] ??
    availableModels[0]
  );
}

/** Parse the cost-cap input like the server: empty → no cap, else clamp to 0–50. */
export function parseCostCap(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = parseFloat(raw);
  return Math.min(MAX_COST_CAP_USD, Math.max(0, Number.isFinite(n) ? n : 0));
}

export default function ProtocolPicker({ className }: ProtocolPickerProps) {
  const options = useArenaStore((s) => s.options);
  const setOption = useArenaStore((s) => s.setOption);
  const setRoundCount = useArenaStore((s) => s.setRoundCount);
  const availableModels = useArenaStore((s) => s.availableModels);
  const modelsLoading = useArenaStore((s) => s.modelsLoading);
  const participants = useArenaStore((s) => s.participants);
  const isRunning = useArenaStore((s) => s.isRunning);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const uid = useId();
  const headingId = `protocol-${uid}`;
  const advancedId = `protocol-advanced-${uid}`;
  const roundsLabelId = `protocol-rounds-${uid}`;
  const roundsHelpId = `protocol-rounds-help-${uid}`;
  const judgeLabelId = `protocol-judge-${uid}`;
  const judgeErrorId = `protocol-judge-error-${uid}`;

  const { engine, rounds } = options;
  const isCvp = engine === "cvp";
  const usesRounds = engine !== "blind-jury";
  const minRounds = minRoundsFor(engine);

  const judgeModel = availableModels.find((m) => m.id === options.judgeModelId) ?? null;
  const judgeMissing = options.judgeEnabled && !options.judgeModelId;
  const judgeUnavailable =
    options.judgeEnabled &&
    !!options.judgeModelId &&
    !modelsLoading &&
    availableModels.length > 0 &&
    !judgeModel;

  const selectEngine = (next: EngineType) => {
    setOption("engine", next);
    if (rounds < minRoundsFor(next)) setRoundCount(minRoundsFor(next));
  };

  const setJudge = (on: boolean) => {
    setOption("judgeEnabled", on);
    if (on && !options.judgeModelId) {
      const suggestion = suggestJudgeModel(availableModels, participants);
      if (suggestion) setOption("judgeModelId", suggestion.id);
    }
  };

  const cap = options.costCapUSD;
  const summary = [
    usesRounds ? `${rounds} ${rounds === 1 ? "round" : "rounds"}` : "1 round",
    options.judgeEnabled ? "judge on" : "judge off",
    options.extractClaimsEnabled ? "claims on" : "claims off",
    cap && cap > 0 ? `$${cap.toFixed(2)} cap` : "no cost cap",
  ].join(" · ");

  return (
    <Card as="section" aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className="text-base font-semibold text-fg">
        Protocol
      </h2>
      <p className="mb-3 mt-0.5 text-[13px] text-fg-muted">
        How the panel discusses. Not sure? Debate is the most thorough, Blind jury the cheapest.
      </p>

      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Engine">
        {ENGINES.map(({ id, facts }) => {
          const checked = engine === id;
          return (
            <label
              key={id}
              className={cn(
                "relative flex cursor-pointer flex-col gap-1 rounded-card border p-3 transition-colors",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
                checked ? "border-accent bg-accent/5" : "border-border hover:bg-surface-2",
              )}
            >
              <input
                type="radio"
                name={`engine-${uid}`}
                value={id}
                checked={checked}
                disabled={isRunning}
                onChange={() => selectEngine(id)}
                aria-labelledby={`${uid}-${id}-name`}
                aria-describedby={`${uid}-${id}-desc ${uid}-${id}-facts`}
                className="sr-only"
              />
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    checked ? "border-accent" : "border-border-strong",
                  )}
                >
                  {checked && <span className="h-2 w-2 rounded-full bg-accent" />}
                </span>
                <span id={`${uid}-${id}-name`} className="text-[15px] font-semibold text-fg">
                  {engineLabel(id)}
                </span>
              </span>
              <span id={`${uid}-${id}-desc`} className="text-[13px] leading-snug text-fg-muted">
                {engineDescription(id)}
              </span>
              <span id={`${uid}-${id}-facts`} className="mt-auto pt-1 text-[13px] text-fg-muted">
                {facts}
              </span>
            </label>
          );
        })}
      </div>

      {engine === "blind-jury" && !options.judgeEnabled && (
        <div className="mt-3 flex flex-col gap-2 rounded-control border border-info/30 bg-info/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-fg">
            Blind jury is built around the judge&apos;s summary, which is off.
          </p>
          <Button
            size="sm"
            onClick={() => setJudge(true)}
            disabled={isRunning}
            className="shrink-0"
          >
            Turn on judge
          </Button>
        </div>
      )}

      <div className="mt-4 border-t border-border pt-3">
        <button
          type="button"
          aria-expanded={advancedOpen}
          aria-controls={advancedId}
          onClick={() => setAdvancedOpen((v) => !v)}
          className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-control px-2 py-1.5 text-left hover:bg-surface-2"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "h-4 w-4 shrink-0 text-fg-muted transition-transform",
              advancedOpen && "rotate-90",
            )}
          />
          <span className="text-sm font-medium text-fg">Advanced</span>
          <span className="min-w-0 truncate text-[13px] text-fg-muted">{summary}</span>
        </button>

        <div id={advancedId} hidden={!advancedOpen} className="mt-3">
          <div className="flex flex-col gap-4">
            {usesRounds ? (
              <div className="flex flex-col gap-1.5">
                <div
                  role="group"
                  aria-labelledby={roundsLabelId}
                  aria-describedby={roundsHelpId}
                  className="flex items-center justify-between gap-4"
                >
                  <span id={roundsLabelId} className="text-sm font-medium text-fg">
                    Rounds
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      aria-label="Fewer rounds"
                      className="w-8 px-0"
                      disabled={isRunning || rounds <= minRounds}
                      onClick={() => setRoundCount(Math.max(minRounds, rounds - 1))}
                      icon={<Minus className="h-4 w-4" />}
                    />
                    <output
                      aria-live="polite"
                      className="w-8 text-center text-base font-semibold tabular-nums text-fg"
                    >
                      {rounds}
                    </output>
                    <Button
                      size="sm"
                      aria-label="More rounds"
                      className="w-8 px-0"
                      disabled={isRunning || rounds >= MAX_ROUNDS}
                      onClick={() => setRoundCount(rounds + 1)}
                      icon={<Plus className="h-4 w-4" />}
                    />
                  </div>
                </div>
                <p
                  id={roundsHelpId}
                  className={cn(
                    "text-[13px] leading-snug",
                    rounds < minRounds ? "text-warning" : "text-fg-muted",
                  )}
                >
                  {engine === "adversarial"
                    ? `Red team needs at least ${MIN_RED_TEAM_ROUNDS}: opening positions, one or more attack rounds, then a final synthesis.`
                    : options.earlyStop
                      ? "The most rounds the debate can run. Early stop may end it sooner."
                      : "Each round lets everyone answer the others again. More rounds cost more."}
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-fg-muted">Blind jury always runs a single round.</p>
            )}

            {isCvp && (
              <>
                <Toggle
                  label="Randomize order"
                  description="Shuffle who speaks first from round 2, so no one always anchors the debate."
                  checked={options.randomizeOrder}
                  onChange={(v) => setOption("randomizeOrder", v)}
                  disabled={isRunning}
                />
                <Toggle
                  label="Blind round 1"
                  description="Everyone writes their opening answer without seeing the others."
                  checked={options.blindFirstRound}
                  onChange={(v) => setOption("blindFirstRound", v)}
                  disabled={isRunning}
                />
                <Toggle
                  label="Early stop"
                  description="End the debate once the score stops moving between rounds, to save cost."
                  checked={options.earlyStop}
                  onChange={(v) => setOption("earlyStop", v)}
                  disabled={isRunning}
                />
              </>
            )}

            <div className="flex flex-col gap-2">
              <Toggle
                label="Judge synthesis"
                description="A separate, non-voting model writes the verdict: majority, minority and open disputes."
                checked={options.judgeEnabled}
                onChange={setJudge}
                disabled={isRunning}
              />
              {options.judgeEnabled && (
                <div className="flex flex-col gap-1.5 pl-0 sm:pl-4">
                  <span id={judgeLabelId} className="text-[13px] text-fg-muted">
                    Judge model
                  </span>
                  <ModelPicker
                    label="Judge model"
                    labelledBy={judgeLabelId}
                    describedBy={judgeMissing || judgeUnavailable ? judgeErrorId : undefined}
                    models={availableModels}
                    value={judgeModel}
                    onChange={(m) => setOption("judgeModelId", m.id)}
                    placeholder="Choose a judge model"
                    disabled={isRunning}
                    className="w-full sm:w-auto sm:max-w-sm"
                  />
                  {(judgeMissing || judgeUnavailable) && (
                    <p id={judgeErrorId} className="text-[13px] text-danger">
                      {judgeMissing
                        ? "Pick a judge model, or turn the judge off."
                        : "This server doesn't offer that judge model. Pick another."}
                    </p>
                  )}
                </div>
              )}
            </div>

            <Toggle
              label="Claim extraction"
              description="One extra call lists the specific claims participants contradict each other on."
              checked={!!options.extractClaimsEnabled}
              onChange={(v) => setOption("extractClaimsEnabled", v)}
              disabled={isRunning}
            />

            <Field
              label="Cost cap (USD)"
              help={`Stop the run if its cost passes this amount. Leave empty for no cap; at most $${MAX_COST_CAP_USD}.`}
            >
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={MAX_COST_CAP_USD}
                step={0.05}
                placeholder="No cap"
                value={cap ?? ""}
                onChange={(e) => setOption("costCapUSD", parseCostCap(e.target.value))}
                disabled={isRunning}
                className="w-full tabular-nums sm:w-40"
              />
            </Field>
          </div>
        </div>
      </div>
    </Card>
  );
}
