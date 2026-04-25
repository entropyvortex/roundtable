"use client";

// ─────────────────────────────────────────────────────────────
// AI Selector — Cascaded Provider/Model picker + Personas
// ─────────────────────────────────────────────────────────────

import { useArenaStore } from "@/lib/store";
import { PERSONAS, composeCustomPersona, DEFAULT_CUSTOM_SPEC } from "@/lib/personas";
import type { CustomPersonaSpec, ModelInfo, Persona } from "@/lib/types";
import {
  Plus,
  X,
  ChevronRight,
  Bot,
  Loader2,
  Cpu,
  Server,
  Sparkles,
  Star,
  Sliders,
} from "lucide-react";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import PersonaBuilder from "./PersonaBuilder";

export default function AISelector() {
  const {
    availableModels,
    modelsLoading,
    participants,
    addParticipant,
    removeParticipant,
    updateParticipantPersona,
    updateParticipantModel,
    isRunning,
  } = useArenaStore();

  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<Persona>(
    PERSONAS.find((p) => p.id === "first-principles") ?? PERSONAS[0],
  );
  const [selectedCustomSpec, setSelectedCustomSpec] = useState<CustomPersonaSpec | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [personaMenuOpen, setPersonaMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const personaMenuRef = useRef<HTMLDivElement>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const personaTriggerRef = useRef<HTMLButtonElement>(null);
  const [modelMenuPos, setModelMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [personaMenuPos, setPersonaMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const providerGroups = useMemo(() => {
    const groups: Record<string, { name: string; models: ModelInfo[] }> = {};
    for (const m of availableModels) {
      if (!groups[m.providerId]) groups[m.providerId] = { name: m.providerName, models: [] };
      groups[m.providerId].models.push(m);
    }
    return groups;
  }, [availableModels]);

  const providerIds = Object.keys(providerGroups);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setActiveProvider(null);
      }
      if (personaMenuRef.current && !personaMenuRef.current.contains(e.target as Node))
        setPersonaMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setActiveProvider(null);
        setPersonaMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleSelectModel = useCallback((model: ModelInfo) => {
    setSelectedModel(model);
    setMenuOpen(false);
    setActiveProvider(null);
  }, []);

  const handleAdd = () => {
    if (!selectedModel || !selectedPersona) return;
    if (selectedPersona.id === "custom" && selectedCustomSpec) {
      addParticipant(selectedModel, selectedPersona, selectedCustomSpec);
    } else {
      addParticipant(selectedModel, selectedPersona);
    }
  };

  const handleSaveBuilder = useCallback((spec: CustomPersonaSpec) => {
    const composed = composeCustomPersona(spec);
    setSelectedPersona(composed);
    setSelectedCustomSpec(spec);
    setBuilderOpen(false);
  }, []);

  if (modelsLoading) {
    return (
      <div className="flex items-center gap-2 text-arena-muted text-[12px] py-6">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Fetching providers...</span>
      </div>
    );
  }

  if (availableModels.length === 0) {
    return (
      <div className="text-arena-muted text-[12px] py-4 space-y-2">
        <p className="font-medium text-arena-danger">No AI models available</p>
        <p className="text-[11px] text-arena-muted">
          Set{" "}
          <code className="bg-arena-bg px-1.5 py-0.5 rounded text-[10px] border border-arena-border">
            AI_PROVIDERS
          </code>{" "}
          in{" "}
          <code className="bg-arena-bg px-1.5 py-0.5 rounded text-[10px] border border-arena-border">
            .env.local
          </code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Model selector */}
      <div className="space-y-1.5">
        <label className="text-[9px] font-semibold text-arena-muted uppercase tracking-[0.15em] flex items-center gap-1.5">
          <Cpu className="w-2.5 h-2.5" /> Provider & Model
        </label>
        <div className="relative" ref={menuRef}>
          <button
            ref={modelTriggerRef}
            onClick={() => {
              const next = !menuOpen;
              setMenuOpen(next);
              if (next) {
                if (providerIds.length === 1) setActiveProvider(providerIds[0]);
                const rect = modelTriggerRef.current?.getBoundingClientRect();
                if (rect)
                  setModelMenuPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
              }
            }}
            disabled={isRunning}
            className="w-full flex items-center gap-2 bg-arena-bg border border-arena-border rounded-lg px-3 py-2.5 text-[12px] text-arena-text hover:border-arena-accent/50 transition-all disabled:opacity-40 group"
          >
            {selectedModel ? (
              <>
                <Server className="w-3 h-3 text-arena-accent shrink-0" />
                <span className="flex-1 text-left truncate">
                  <span className="text-arena-muted">{selectedModel.providerName}</span>
                  <ChevronRight className="w-2.5 h-2.5 inline-block mx-1 text-arena-border" />
                  <span className="font-medium">{selectedModel.modelId}</span>
                </span>
              </>
            ) : (
              <>
                <Bot className="w-3 h-3 text-arena-muted shrink-0 group-hover:text-arena-accent transition-colors" />
                <span className="flex-1 text-left text-arena-muted">Select model...</span>
              </>
            )}
            <ChevronRight
              className={`w-3.5 h-3.5 text-arena-muted transition-transform duration-200 ${menuOpen ? "rotate-90" : ""}`}
            />
          </button>

          {menuOpen &&
            modelMenuPos &&
            createPortal(
              <div
                ref={menuRef}
                className="fixed z-[9999] flex"
                style={{
                  top: modelMenuPos.top,
                  left: modelMenuPos.left,
                  minWidth: modelMenuPos.width,
                }}
              >
                <div className="bg-arena-surface border border-arena-border rounded-lg shadow-xl shadow-black/30 overflow-hidden min-w-[170px]">
                  <div className="px-3 py-2 border-b border-arena-border/60">
                    <p className="text-[8px] font-semibold text-arena-muted uppercase tracking-[0.2em]">
                      Providers
                    </p>
                  </div>
                  {providerIds.map((pid) => {
                    const group = providerGroups[pid];
                    const isActive = activeProvider === pid;
                    return (
                      <button
                        key={pid}
                        onMouseEnter={() => setActiveProvider(pid)}
                        onClick={() => {
                          if (group.models.length === 1) handleSelectModel(group.models[0]);
                          else setActiveProvider(pid);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 text-[12px] transition-all ${isActive ? "bg-arena-accent/10 text-arena-accent" : "text-arena-text hover:bg-arena-accent/5"}`}
                      >
                        <div
                          className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold transition-colors ${isActive ? "bg-arena-accent/20 text-arena-accent" : "bg-arena-bg text-arena-muted"}`}
                        >
                          {group.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-medium text-[11px]">{group.name}</p>
                          <p className="text-[9px] text-arena-muted">
                            {group.models.length} model{group.models.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                        {group.models.length > 1 && (
                          <ChevronRight className="w-2.5 h-2.5 text-arena-muted" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {activeProvider && providerGroups[activeProvider].models.length > 1 && (
                  <ModelList
                    models={providerGroups[activeProvider].models}
                    providerName={providerGroups[activeProvider].name}
                    selectedModelId={selectedModel?.id ?? null}
                    onSelect={handleSelectModel}
                  />
                )}
              </div>,
              document.body,
            )}
        </div>
      </div>

      {/* Persona selector */}
      <div className="space-y-1.5">
        <label className="text-[9px] font-semibold text-arena-muted uppercase tracking-[0.15em] flex items-center gap-1.5">
          <Sparkles className="w-2.5 h-2.5" /> Persona
        </label>
        <div className="relative" ref={personaMenuRef}>
          <button
            ref={personaTriggerRef}
            onClick={() => {
              const next = !personaMenuOpen;
              setPersonaMenuOpen(next);
              if (next) {
                const rect = personaTriggerRef.current?.getBoundingClientRect();
                if (rect)
                  setPersonaMenuPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
              }
            }}
            disabled={isRunning}
            className="w-full flex items-center gap-2 bg-arena-bg border border-arena-border rounded-lg px-3 py-2.5 text-[12px] text-arena-text hover:border-arena-accent/50 transition-all disabled:opacity-40"
          >
            <span
              className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
              style={{
                backgroundColor: `${selectedPersona.color}20`,
                color: selectedPersona.color,
              }}
            >
              {selectedPersona.emoji}
            </span>
            <span className="flex-1 text-left text-[11px] font-medium">{selectedPersona.name}</span>
            <ChevronRight
              className={`w-3.5 h-3.5 text-arena-muted transition-transform duration-200 ${personaMenuOpen ? "rotate-90" : ""}`}
            />
          </button>

          {personaMenuOpen &&
            personaMenuPos &&
            createPortal(
              <div
                ref={personaMenuRef}
                className="fixed z-[9999] bg-arena-surface border border-arena-border rounded-lg shadow-xl shadow-black/30 max-h-[300px] overflow-auto"
                style={{
                  top: personaMenuPos.top,
                  left: personaMenuPos.left,
                  width: personaMenuPos.width,
                }}
              >
                <div className="px-3 py-2 border-b border-arena-border/60">
                  <p className="text-[8px] font-semibold text-arena-muted uppercase tracking-[0.2em]">
                    Choose Persona
                  </p>
                </div>
                <button
                  onClick={() => {
                    setBuilderOpen(true);
                    setPersonaMenuOpen(false);
                  }}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 transition-all hover:bg-arena-accent/10 border-b border-arena-border/30"
                >
                  <span className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 bg-arena-accent/15 text-arena-accent">
                    <Sliders className="w-3 h-3" />
                  </span>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-[11px] font-medium text-arena-accent">
                      Build a custom persona…
                    </p>
                    <p className="text-[9px] text-arena-muted mt-0.5 line-clamp-1">
                      Tune 6 axes (risk, optimism, evidence bar, …) — server-composed, no free text.
                    </p>
                  </div>
                </button>
                {PERSONAS.map((p) => {
                  const isSel = selectedPersona.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedPersona(p);
                        setPersonaMenuOpen(false);
                      }}
                      className={`w-full flex items-start gap-2.5 px-3 py-2.5 transition-all ${isSel ? "bg-arena-accent/5" : "hover:bg-arena-accent/5"}`}
                    >
                      <span
                        className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                        style={{ backgroundColor: `${p.color}20`, color: p.color }}
                      >
                        {p.emoji}
                      </span>
                      <div className="flex-1 text-left min-w-0">
                        <p
                          className="text-[11px] font-medium text-arena-text"
                          style={{ color: isSel ? p.color : undefined }}
                        >
                          {p.name}
                        </p>
                        <p className="text-[9px] text-arena-muted mt-0.5 line-clamp-1">
                          {p.description}
                        </p>
                      </div>
                      {isSel && (
                        <div
                          className="w-1.5 h-1.5 rounded-full mt-2 shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>,
              document.body,
            )}
        </div>
      </div>

      {/* Builder (when open) */}
      {builderOpen && (
        <PersonaBuilder
          initial={selectedCustomSpec ?? DEFAULT_CUSTOM_SPEC}
          onSave={handleSaveBuilder}
          onCancel={() => setBuilderOpen(false)}
        />
      )}

      {/* Add button */}
      <button
        onClick={handleAdd}
        disabled={!selectedModel || isRunning}
        className="w-full flex items-center justify-center gap-2 bg-arena-accent/10 border border-arena-accent/25 text-arena-accent rounded-lg px-3 py-2.5 text-[12px] font-medium hover:bg-arena-accent/15 hover:border-arena-accent/40 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Plus className="w-3.5 h-3.5" /> Add to Arena
      </button>

      {/* Participants */}
      {participants.length > 0 && (
        <div className="space-y-2 pt-4 border-t border-arena-border/50">
          <h4 className="text-[9px] font-semibold text-arena-muted uppercase tracking-[0.15em]">
            Participants ({participants.length})
          </h4>
          <div className="space-y-1.5">
            {participants.map((p) => (
              <ParticipantCard
                key={p.id}
                participant={p}
                availableModels={availableModels}
                onRemove={() => removeParticipant(p.id)}
                onPersonaChange={(persona) => updateParticipantPersona(p.id, persona)}
                onModelChange={(model) => updateParticipantModel(p.id, model)}
                disabled={isRunning}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Cascaded model list with preferred models first + star indicator */
function ModelList({
  models,
  providerName,
  selectedModelId,
  onSelect,
}: {
  models: ModelInfo[];
  providerName: string;
  selectedModelId: string | null;
  onSelect: (m: ModelInfo) => void;
}) {
  const preferred = models.filter((m) => m.preferred);
  const others = models.filter((m) => !m.preferred);

  return (
    <div className="bg-arena-surface border border-arena-border rounded-lg shadow-xl shadow-black/30 overflow-hidden min-w-[210px] max-h-[320px] overflow-y-auto ml-1">
      <div className="px-3 py-2 border-b border-arena-border/60">
        <p className="text-[8px] font-semibold text-arena-muted uppercase tracking-[0.2em]">
          {providerName}
        </p>
      </div>
      {preferred.map((m) => {
        const isSel = selectedModelId === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] transition-all ${isSel ? "bg-arena-accent/10 text-arena-accent" : "text-arena-text hover:bg-arena-accent/5"}`}
          >
            <Star className="w-3 h-3 shrink-0 text-arena-warning fill-arena-warning" />
            <span className="flex-1 text-left font-medium text-[11px] truncate">{m.modelId}</span>
            {isSel && <div className="w-1.5 h-1.5 rounded-full bg-arena-accent" />}
          </button>
        );
      })}
      {preferred.length > 0 && others.length > 0 && (
        <div className="border-t border-arena-border/30 mx-2 my-0.5" />
      )}
      {others.map((m) => {
        const isSel = selectedModelId === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] transition-all ${isSel ? "bg-arena-accent/10 text-arena-accent" : "text-arena-text/70 hover:bg-arena-accent/5"}`}
          >
            <Sparkles
              className={`w-3 h-3 shrink-0 ${isSel ? "text-arena-accent" : "text-arena-muted/40"}`}
            />
            <span className="flex-1 text-left text-[11px] truncate">{m.modelId}</span>
            {isSel && <div className="w-1.5 h-1.5 rounded-full bg-arena-accent" />}
          </button>
        );
      })}
    </div>
  );
}

function ParticipantCard({
  participant,
  availableModels,
  onRemove,
  onPersonaChange,
  onModelChange,
  disabled,
}: {
  participant: { id: string; modelInfo: ModelInfo; persona: Persona };
  availableModels: ModelInfo[];
  onRemove: () => void;
  onPersonaChange: (p: Persona) => void;
  onModelChange: (m: ModelInfo) => void;
  disabled: boolean;
}) {
  // Sibling models from the same provider, preferred first
  const siblingModels = useMemo(() => {
    const siblings = availableModels.filter(
      (m) => m.providerId === participant.modelInfo.providerId,
    );
    return [...siblings.filter((m) => m.preferred), ...siblings.filter((m) => !m.preferred)];
  }, [availableModels, participant.modelInfo.providerId]);

  return (
    <div
      className="flex items-center gap-2 bg-arena-bg border border-arena-border/60 rounded-lg px-2.5 py-2 group hover:border-arena-border transition-colors"
      style={{ borderLeftColor: participant.persona.color, borderLeftWidth: 3 }}
    >
      <span
        className="w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold shrink-0"
        style={{
          backgroundColor: `${participant.persona.color}20`,
          color: participant.persona.color,
        }}
      >
        {participant.persona.emoji}
      </span>
      <div className="flex-1 min-w-0">
        {/* Model selector — shows provider prefix, swappable within provider */}
        <div className="flex items-center gap-0.5 text-[11px]">
          <span className="text-arena-muted shrink-0">{participant.modelInfo.providerName} /</span>
          {siblingModels.length > 1 ? (
            <select
              value={participant.modelInfo.id}
              onChange={(e) => {
                const m = availableModels.find((x) => x.id === e.target.value);
                if (m) onModelChange(m);
              }}
              disabled={disabled}
              className="bg-transparent text-arena-text font-medium border-none p-0 focus:outline-none disabled:opacity-40 cursor-pointer truncate text-[11px]"
            >
              {siblingModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.preferred ? "\u2605 " : ""}
                  {m.modelId}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-arena-text font-medium truncate">
              {participant.modelInfo.modelId}
            </span>
          )}
        </div>
        {/* Persona selector */}
        <select
          value={participant.persona.id}
          onChange={(e) => {
            const p = PERSONAS.find((x) => x.id === e.target.value);
            if (p) onPersonaChange(p);
          }}
          disabled={disabled}
          className="text-[9px] bg-transparent text-arena-muted border-none p-0 focus:outline-none disabled:opacity-40 cursor-pointer"
        >
          {PERSONAS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.emoji} {p.name}
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={onRemove}
        disabled={disabled}
        className="p-0.5 text-arena-muted/40 hover:text-arena-danger opacity-0 group-hover:opacity-100 transition-all disabled:opacity-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
