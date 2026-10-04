"use client";

// ─────────────────────────────────────────────────────────────
// PanelEditor — who sits at the table
// ─────────────────────────────────────────────────────────────
// Seat rows (persona dot · persona · provider / model · change
// persona · change model · remove), an "Add a seat" row with the
// cascaded model picker + persona picker (incl. the custom persona
// builder), and panel presets from lib/panel-presets.ts.

import { Loader2, Sliders, Users, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { applyPreset, PANEL_PRESETS, type PanelPreset } from "@/lib/panel-presets";
import { composeCustomPersona, PERSONAS } from "@/lib/personas";
import { useArenaStore } from "@/lib/store";
import type { CustomPersonaSpec, ModelInfo, Participant, Persona } from "@/lib/types";
import { Badge, Button, Card, Menu, PersonaDot, type MenuItem } from "@/components/ui";
import PersonaBuilder from "@/components/PersonaBuilder";
import { MAX_SEATS, MIN_SEATS } from "@/lib/limits";
import ModelPicker, { groupModelsByProvider } from "./ModelPicker";

export interface PanelEditorProps {
  className?: string;
}

/**
 * Default model for a new seat: the provider with the fewest seats so far
 * (cross-provider diversity), its first preferred model.
 */
export function suggestModel(
  availableModels: readonly ModelInfo[],
  participants: readonly Pick<Participant, "modelInfo">[],
): ModelInfo | null {
  const groups = groupModelsByProvider(availableModels);
  if (groups.length === 0) return null;
  const seats = (id: string) => participants.filter((p) => p.modelInfo.providerId === id).length;
  let best = groups[0];
  for (const g of groups) if (seats(g.id) < seats(best.id)) best = g;
  return best.models[0];
}

/** Default persona for a new seat: the first built-in persona not yet seated. */
function suggestPersona(participants: readonly Pick<Participant, "persona">[]): Persona {
  return PERSONAS.find((p) => !participants.some((x) => x.persona.id === p.id)) ?? PERSONAS[0];
}

export default function PanelEditor({ className }: PanelEditorProps) {
  const availableModels = useArenaStore((s) => s.availableModels);
  const modelsLoading = useArenaStore((s) => s.modelsLoading);
  const participants = useArenaStore((s) => s.participants);
  const isRunning = useArenaStore((s) => s.isRunning);
  const addParticipant = useArenaStore((s) => s.addParticipant);
  const removeParticipant = useArenaStore((s) => s.removeParticipant);
  const updateParticipantPersona = useArenaStore((s) => s.updateParticipantPersona);
  const updateParticipantModel = useArenaStore((s) => s.updateParticipantModel);

  const uid = useId();
  const headingId = `panel-${uid}`;
  const fullId = `panel-full-${uid}`;
  const newModelLabelId = `panel-new-model-${uid}`;
  const confirmId = `panel-confirm-${uid}`;

  const [pickedModel, setPickedModel] = useState<ModelInfo | null>(null);
  /** null = follow the suggestion; "custom" = the built custom persona. */
  const [pickedPersonaId, setPickedPersonaId] = useState<string | null>(null);
  const [custom, setCustom] = useState<{ persona: Persona; spec: CustomPersonaSpec } | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<PanelPreset | null>(null);
  const presetTriggerRef = useRef<HTMLButtonElement>(null);

  const known = useMemo(() => new Set(availableModels.map((m) => m.id)), [availableModels]);
  const hasModels = !modelsLoading && availableModels.length > 0;
  const full = participants.length >= MAX_SEATS;

  const newModel =
    pickedModel && known.has(pickedModel.id)
      ? pickedModel
      : suggestModel(availableModels, participants);
  const newPersona =
    pickedPersonaId === "custom" && custom
      ? custom.persona
      : (PERSONAS.find((p) => p.id === pickedPersonaId) ?? suggestPersona(participants));

  const applyPresetNow = (preset: PanelPreset) => {
    const seats = applyPreset(preset, availableModels);
    for (const p of useArenaStore.getState().participants) removeParticipant(p.id);
    for (const seat of seats) addParticipant(seat.model, seat.persona);
    setPendingPreset(null);
    focusPresetTrigger();
  };

  const focusPresetTrigger = () => presetTriggerRef.current?.focus();

  const cancelPreset = () => {
    setPendingPreset(null);
    focusPresetTrigger();
  };

  const presetItems: MenuItem[] = PANEL_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.name,
    description: preset.description,
    onSelect: () => {
      if (useArenaStore.getState().participants.length === 0) applyPresetNow(preset);
      else setPendingPreset(preset);
    },
  }));

  const handleAdd = () => {
    if (!newModel || full) return;
    if (newPersona.id === "custom" && custom) {
      addParticipant(newModel, custom.persona, custom.spec);
    } else {
      addParticipant(newModel, newPersona);
    }
    setPickedPersonaId(null);
  };

  const handleBuilderSave = (spec: CustomPersonaSpec) => {
    // `spec` is already sanitised by PersonaBuilder, so compose cannot throw.
    setCustom({ persona: composeCustomPersona(spec), spec });
    setPickedPersonaId("custom");
    setBuilderOpen(false);
  };

  const newPersonaItems: MenuItem[] = [
    ...(custom
      ? [
          {
            id: "custom",
            label: `${custom.persona.name} (custom)`,
            description: custom.persona.description,
            icon: <PersonaDot color={custom.persona.color} />,
            checked: newPersona.id === "custom",
            onSelect: () => setPickedPersonaId("custom"),
          },
        ]
      : []),
    ...PERSONAS.map((p) => ({
      id: p.id,
      label: p.name,
      description: p.description,
      icon: <PersonaDot color={p.color} />,
      checked: newPersona.id === p.id,
      onSelect: () => setPickedPersonaId(p.id),
    })),
    {
      id: "build-custom",
      label: custom ? "Edit custom persona…" : "Build a custom persona…",
      description: "Tune six traits such as risk tolerance and evidence bar.",
      icon: <Sliders className="h-4 w-4" />,
      onSelect: () => setBuilderOpen(true),
    },
  ];

  return (
    <Card as="section" aria-labelledby={headingId} className={className}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={headingId} className="text-base font-semibold text-fg">
            Panel
          </h2>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            Who sits at the table. Mixing providers gives more independent answers.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-[13px] text-fg-muted tabular-nums">
            {participants.length} of {MAX_SEATS} seats
          </span>
          <Menu
            label="Use a preset"
            items={presetItems}
            size="sm"
            align="end"
            disabled={isRunning || !hasModels}
            menuClassName="w-[min(20rem,calc(100vw-16px))]"
            triggerRef={(el) => {
              presetTriggerRef.current = el;
            }}
          />
        </div>
      </div>

      {pendingPreset && (
        <div
          role="group"
          aria-labelledby={confirmId}
          className="mb-4 flex flex-col gap-3 rounded-control border border-warning/40 bg-warning/10 p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p id={confirmId} className="text-sm text-fg">
            Replace the {participants.length} current {participants.length === 1 ? "seat" : "seats"}{" "}
            with the {pendingPreset.name} preset?
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="primary"
              // Menu returns focus to its trigger before onSelect runs; move it here.
              autoFocus
              onClick={() => applyPresetNow(pendingPreset)}
            >
              Replace seats
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelPreset}>
              Keep current
            </Button>
          </div>
        </div>
      )}

      {participants.length > 0 ? (
        <ul className="divide-y divide-border" aria-label="Seats">
          {participants.map((p, i) => (
            <SeatRow
              key={p.id}
              seat={i + 1}
              participant={p}
              availableModels={availableModels}
              unavailable={hasModels && !known.has(p.modelInfo.id)}
              disabled={isRunning}
              onRemove={() => removeParticipant(p.id)}
              onPersonaChange={(persona) => updateParticipantPersona(p.id, persona)}
              onModelChange={(model) => updateParticipantModel(p.id, model)}
            />
          ))}
        </ul>
      ) : (
        hasModels && (
          <p className="flex items-start gap-2 rounded-control border border-dashed border-border px-3 py-3 text-sm text-fg-muted">
            <Users aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              No seats yet. Start from a preset or add seats one at a time — a run needs at least{" "}
              {MIN_SEATS}.
            </span>
          </p>
        )
      )}

      {modelsLoading ? (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm text-fg-muted">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          Fetching providers…
        </p>
      ) : availableModels.length === 0 ? (
        <div className="mt-3 rounded-control border border-danger/40 bg-danger/5 p-3 text-sm">
          <p className="font-medium text-danger">No AI models available</p>
          <p className="mt-1 text-fg-muted">
            Set <code className="rounded bg-surface-2 px-1 py-0.5 text-[13px]">AI_PROVIDERS</code>{" "}
            in <code className="rounded bg-surface-2 px-1 py-0.5 text-[13px]">.env.local</code> and
            restart the server.
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-control border border-dashed border-border-strong p-3">
          <h3 className="mb-2 text-sm font-medium text-fg">Add a seat</h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span id={newModelLabelId} className="text-[13px] text-fg-muted">
                Model
              </span>
              <ModelPicker
                label="Model for the new seat"
                labelledBy={newModelLabelId}
                models={availableModels}
                value={newModel}
                onChange={setPickedModel}
                disabled={isRunning || full}
                className="w-full"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span aria-hidden className="text-[13px] text-fg-muted">
                Persona
              </span>
              <Menu
                label={
                  <span className="flex min-w-0 items-center gap-2">
                    <PersonaDot color={newPersona.color} />
                    <span className="truncate">{newPersona.name}</span>
                  </span>
                }
                aria-label={`Persona ${newPersona.name}`}
                items={newPersonaItems}
                disabled={isRunning || full}
                matchTriggerWidth
                className="w-full justify-between"
                menuClassName="w-[min(22rem,calc(100vw-16px))]"
              />
            </div>
            <Button
              variant="primary"
              onClick={handleAdd}
              disabled={isRunning || full || !newModel}
              aria-describedby={full ? fullId : undefined}
              className="shrink-0"
            >
              Add seat
            </Button>
          </div>
          {full && (
            <p id={fullId} className="mt-2 text-[13px] text-fg-muted">
              The table is full: a run can take at most {MAX_SEATS} seats.
            </p>
          )}
        </div>
      )}

      {builderOpen && (
        <PersonaBuilder
          className="mt-4"
          initial={custom?.spec}
          onSave={handleBuilderSave}
          onCancel={() => setBuilderOpen(false)}
        />
      )}
    </Card>
  );
}

// ── Seat row ──────────────────────────────────────────────

interface SeatRowProps {
  seat: number;
  participant: Participant;
  availableModels: ModelInfo[];
  unavailable: boolean;
  disabled: boolean;
  onRemove: () => void;
  onPersonaChange: (persona: Persona) => void;
  onModelChange: (model: ModelInfo) => void;
}

function SeatRow({
  seat,
  participant,
  availableModels,
  unavailable,
  disabled,
  onRemove,
  onPersonaChange,
  onModelChange,
}: SeatRowProps) {
  const { persona, modelInfo } = participant;
  const who = `seat ${seat} (${persona.name})`;
  const isCustom = persona.id === "custom";

  const personaItems: MenuItem[] = [
    // The store can't attach a custom spec to an existing seat, so custom
    // personas are only offered when adding a seat; show the current one.
    ...(isCustom
      ? [
          {
            id: "custom",
            label: `${persona.name} (custom)`,
            icon: <PersonaDot color={persona.color} />,
            checked: true,
            onSelect: () => {},
          },
        ]
      : []),
    ...PERSONAS.map((p) => ({
      id: p.id,
      label: p.name,
      description: p.description,
      icon: <PersonaDot color={p.color} />,
      checked: p.id === persona.id,
      onSelect: () => {
        if (p.id !== persona.id) onPersonaChange(p);
      },
    })),
  ];

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <PersonaDot color={persona.color} className="mt-1.5" />
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-fg">
            <span className="sr-only">Seat {seat}: </span>
            <span className="truncate">{persona.name}</span>
            {isCustom && <Badge>Custom</Badge>}
          </p>
          <p className="truncate text-[13px] text-fg-muted">
            {modelInfo.providerName} / {modelInfo.modelId}
          </p>
          {unavailable && (
            <p className="mt-0.5 text-[13px] text-warning">
              This server doesn&apos;t offer this model. Pick another.
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-5 sm:pl-0">
        <Menu
          label="Persona"
          aria-label={`Persona for ${who}`}
          items={personaItems}
          size="sm"
          align="end"
          disabled={disabled}
          menuClassName="w-[min(22rem,calc(100vw-16px))]"
        />
        <ModelPicker
          label={`Model for ${who}`}
          triggerLabel="Model"
          models={availableModels}
          value={modelInfo}
          onChange={(m) => {
            if (m.id !== modelInfo.id) onModelChange(m);
          }}
          size="sm"
          align="end"
          disabled={disabled}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${who}`}
          className="px-2 text-fg-muted hover:text-danger"
          icon={<X className="h-4 w-4" />}
        />
      </div>
    </li>
  );
}
