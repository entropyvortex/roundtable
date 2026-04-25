"use client";

// ─────────────────────────────────────────────────────────────
// AI Selector — Cascaded Provider/Model picker + Personas
// ─────────────────────────────────────────────────────────────

import { useArenaStore } from "@/lib/store";
import { PERSONAS } from "@/lib/personas";
import type { ModelInfo, Persona } from "@/lib/types";
import { Plus, X, ChevronRight, Bot, Loader2, Cpu, Server, Sparkles, Star } from "lucide-react";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";

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
    addParticipant(selectedModel, selectedPersona);
  };

  if (modelsLoading) {
    return (
      <div className="flex items-center gap-2 text-arena-muted text-[12px] py-6">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-arena-accent" />
        <span>Fetching providers…</span>
      </div>
    );
  }

  if (availableModels.length === 0) {
    return (
      <div className="text-arena-muted text-[12px] py-4 space-y-2">
        <p className="font-medium text-arena-danger">No AI models available</p>
        <p className="text-[11px] text-arena-muted">
          Set{" "}
          <code className="bg-black/40 px-1.5 py-0.5 rounded text-[10px] border border-white/10 text-arena-glow">
            AI_PROVIDERS
          </code>{" "}
          in{" "}
          <code className="bg-black/40 px-1.5 py-0.5 rounded text-[10px] border border-white/10 text-arena-glow">
            .env.local
          </code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Model selector */}
      <div className="space-y-2">
        <label className="section-label">
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
            className="glass-input w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12.5px] text-arena-text disabled:opacity-40 group"
          >
            {selectedModel ? (
              <>
                <div className="w-5 h-5 rounded-md bg-arena-accent/15 border border-arena-accent/30 flex items-center justify-center">
                  <Server className="w-2.5 h-2.5 text-arena-accent" />
                </div>
                <span className="flex-1 text-left truncate">
                  <span className="text-arena-muted">{selectedModel.providerName}</span>
                  <ChevronRight className="w-2.5 h-2.5 inline-block mx-1 text-arena-border-strong" />
                  <span className="font-medium">{selectedModel.modelId}</span>
                </span>
              </>
            ) : (
              <>
                <Bot className="w-3.5 h-3.5 text-arena-muted shrink-0 group-hover:text-arena-accent transition-colors" />
                <span className="flex-1 text-left text-arena-muted">Select a model…</span>
              </>
            )}
            <ChevronRight
              className={`w-3.5 h-3.5 text-arena-muted transition-transform duration-200 ${menuOpen ? "rotate-90 text-arena-accent" : ""}`}
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
                <div className="glass-strong rounded-2xl overflow-hidden min-w-[190px]">
                  <div className="px-3.5 py-2.5 border-b border-white/[0.06]">
                    <p className="text-[9px] font-semibold text-arena-muted uppercase tracking-[0.22em]">
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
                        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] transition-all ${
                          isActive
                            ? "bg-arena-accent/12 text-arena-glow"
                            : "text-arena-text hover:bg-white/[0.03]"
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold transition-colors ${
                            isActive
                              ? "bg-gradient-to-br from-[#ff8a3a] to-[#e25400] text-white shadow-glow-orange-sm"
                              : "bg-black/35 text-arena-muted border border-white/[0.06]"
                          }`}
                        >
                          {group.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-medium text-[11.5px]">{group.name}</p>
                          <p className="text-[9.5px] text-arena-muted">
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
      <div className="space-y-2">
        <label className="section-label">
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
            className="glass-input w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12.5px] text-arena-text disabled:opacity-40"
          >
            <span
              className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0"
              style={{
                backgroundColor: `${selectedPersona.color}25`,
                color: selectedPersona.color,
                boxShadow: `0 0 12px ${selectedPersona.color}30`,
              }}
            >
              {selectedPersona.emoji}
            </span>
            <span className="flex-1 text-left text-[12px] font-medium">{selectedPersona.name}</span>
            <ChevronRight
              className={`w-3.5 h-3.5 text-arena-muted transition-transform duration-200 ${personaMenuOpen ? "rotate-90 text-arena-accent" : ""}`}
            />
          </button>

          {personaMenuOpen &&
            personaMenuPos &&
            createPortal(
              <div
                ref={personaMenuRef}
                className="fixed z-[9999] glass-strong rounded-2xl max-h-[320px] overflow-auto"
                style={{
                  top: personaMenuPos.top,
                  left: personaMenuPos.left,
                  width: personaMenuPos.width,
                }}
              >
                <div className="px-3.5 py-2.5 border-b border-white/[0.06]">
                  <p className="text-[9px] font-semibold text-arena-muted uppercase tracking-[0.22em]">
                    Choose Persona
                  </p>
                </div>
                {PERSONAS.map((p) => {
                  const isSel = selectedPersona.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedPersona(p);
                        setPersonaMenuOpen(false);
                      }}
                      className={`w-full flex items-start gap-2.5 px-3.5 py-2.5 transition-all ${isSel ? "bg-white/[0.04]" : "hover:bg-white/[0.03]"}`}
                    >
                      <span
                        className="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5"
                        style={{
                          backgroundColor: `${p.color}25`,
                          color: p.color,
                          boxShadow: isSel ? `0 0 14px ${p.color}45` : undefined,
                        }}
                      >
                        {p.emoji}
                      </span>
                      <div className="flex-1 text-left min-w-0">
                        <p
                          className="text-[11.5px] font-medium text-arena-text"
                          style={{ color: isSel ? p.color : undefined }}
                        >
                          {p.name}
                        </p>
                        <p className="text-[9.5px] text-arena-muted mt-0.5 line-clamp-1">
                          {p.description}
                        </p>
                      </div>
                      {isSel && (
                        <div
                          className="w-1.5 h-1.5 rounded-full mt-2 shrink-0"
                          style={{
                            backgroundColor: p.color,
                            boxShadow: `0 0 8px ${p.color}`,
                          }}
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

      {/* Add button */}
      <button
        onClick={handleAdd}
        disabled={!selectedModel || isRunning}
        className="w-full flex items-center justify-center gap-2 bg-arena-accent/12 border border-arena-accent/40 text-arena-glow rounded-xl px-3 py-2.5 text-[12.5px] font-semibold hover:bg-arena-accent/20 hover:border-arena-accent/60 hover:shadow-glow-orange-sm active:scale-[0.98] transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
      >
        <Plus className="w-3.5 h-3.5" /> Seat at the Table
      </button>

      {/* Participants */}
      {participants.length > 0 && (
        <div className="space-y-2.5 pt-4">
          <div className="glass-divider" />
          <div className="flex items-center justify-between">
            <h4 className="section-label">Participants</h4>
            <span className="text-[10px] text-arena-glow font-mono tabular-nums px-2 py-0.5 rounded-md bg-arena-accent/12 border border-arena-accent/30">
              {participants.length}
            </span>
          </div>
          <div className="space-y-2">
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
    <div className="glass-strong rounded-2xl overflow-hidden min-w-[220px] max-h-[320px] overflow-y-auto ml-2">
      <div className="px-3.5 py-2.5 border-b border-white/[0.06]">
        <p className="text-[9px] font-semibold text-arena-muted uppercase tracking-[0.22em]">
          {providerName}
        </p>
      </div>
      {preferred.map((m) => {
        const isSel = selectedModelId === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m)}
            className={`w-full flex items-center gap-2 px-3.5 py-2 text-[12px] transition-all ${
              isSel
                ? "bg-arena-accent/12 text-arena-glow"
                : "text-arena-text hover:bg-white/[0.03]"
            }`}
          >
            <Star className="w-3 h-3 shrink-0 text-arena-accent fill-arena-accent drop-shadow-[0_0_4px_rgba(255,98,0,0.6)]" />
            <span className="flex-1 text-left font-medium text-[11.5px] truncate">{m.modelId}</span>
            {isSel && <div className="w-1.5 h-1.5 rounded-full bg-arena-accent shadow-glow-orange-sm" />}
          </button>
        );
      })}
      {preferred.length > 0 && others.length > 0 && (
        <div className="border-t border-white/[0.05] mx-2 my-1" />
      )}
      {others.map((m) => {
        const isSel = selectedModelId === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m)}
            className={`w-full flex items-center gap-2 px-3.5 py-2 text-[12px] transition-all ${
              isSel
                ? "bg-arena-accent/12 text-arena-glow"
                : "text-arena-text/75 hover:bg-white/[0.03]"
            }`}
          >
            <Sparkles
              className={`w-3 h-3 shrink-0 ${isSel ? "text-arena-accent" : "text-arena-muted/45"}`}
            />
            <span className="flex-1 text-left text-[11.5px] truncate">{m.modelId}</span>
            {isSel && <div className="w-1.5 h-1.5 rounded-full bg-arena-accent shadow-glow-orange-sm" />}
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
  const siblingModels = useMemo(() => {
    const siblings = availableModels.filter(
      (m) => m.providerId === participant.modelInfo.providerId,
    );
    return [...siblings.filter((m) => m.preferred), ...siblings.filter((m) => !m.preferred)];
  }, [availableModels, participant.modelInfo.providerId]);

  return (
    <div
      className="relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 group transition-all overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(8, 22, 52, 0.55), rgba(4, 12, 30, 0.55))",
        border: `1px solid rgba(77, 122, 199, 0.18)`,
        boxShadow: `inset 3px 0 0 0 ${participant.persona.color}`,
        backdropFilter: "blur(12px)",
      }}
    >
      {/* faint persona-color glow on the left */}
      <div
        className="absolute inset-y-0 left-0 w-12 pointer-events-none opacity-40"
        style={{
          background: `linear-gradient(90deg, ${participant.persona.color}28, transparent)`,
        }}
      />
      <span
        className="relative w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold shrink-0"
        style={{
          backgroundColor: `${participant.persona.color}28`,
          color: participant.persona.color,
          boxShadow: `0 0 14px ${participant.persona.color}30`,
        }}
      >
        {participant.persona.emoji}
      </span>
      <div className="flex-1 min-w-0 relative">
        <div className="flex items-center gap-1 text-[11.5px]">
          <span className="text-arena-muted shrink-0">{participant.modelInfo.providerName}</span>
          <span className="text-arena-border-strong">/</span>
          {siblingModels.length > 1 ? (
            <select
              value={participant.modelInfo.id}
              onChange={(e) => {
                const m = availableModels.find((x) => x.id === e.target.value);
                if (m) onModelChange(m);
              }}
              disabled={disabled}
              className="bg-transparent text-arena-text font-medium border-none p-0 focus:outline-none disabled:opacity-40 cursor-pointer truncate text-[11.5px]"
            >
              {siblingModels.map((m) => (
                <option key={m.id} value={m.id} className="bg-[#06112A]">
                  {m.preferred ? "★ " : ""}
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
        <select
          value={participant.persona.id}
          onChange={(e) => {
            const p = PERSONAS.find((x) => x.id === e.target.value);
            if (p) onPersonaChange(p);
          }}
          disabled={disabled}
          className="text-[9.5px] bg-transparent text-arena-muted border-none p-0 focus:outline-none disabled:opacity-40 cursor-pointer mt-0.5"
        >
          {PERSONAS.map((p) => (
            <option key={p.id} value={p.id} className="bg-[#06112A]">
              {p.emoji} {p.name}
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={onRemove}
        disabled={disabled}
        className="relative p-1 rounded-md text-arena-muted/40 hover:text-arena-danger hover:bg-arena-danger/10 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
