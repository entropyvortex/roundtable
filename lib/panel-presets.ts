// ─────────────────────────────────────────────────────────────
// RoundTable — Panel presets
// ─────────────────────────────────────────────────────────────
// A preset is a named set of personas. `applyPreset` seats those
// personas on whatever models the server exposes, spreading them
// across providers so the panel is not three copies of one model.

import { PERSONAS } from "./personas";
import type { ModelInfo, Persona } from "./types";

export interface PanelPreset {
  id: "balanced" | "red-team" | "investor";
  name: string;
  /** The persona names, joined — shown under the preset name. */
  description: string;
  /** Persona ids from `lib/personas.ts`, in seat order. */
  personaIds: string[];
}

function preset(id: PanelPreset["id"], name: string, personaIds: string[]): PanelPreset {
  const names = personaIds.map((pid) => PERSONAS.find((p) => p.id === pid)?.name ?? pid);
  return { id, name, description: names.join(" + "), personaIds };
}

export const PANEL_PRESETS: PanelPreset[] = [
  preset("balanced", "Balanced", ["pessimist", "optimistic-futurist", "first-principles"]),
  preset("red-team", "Red team", ["devils-advocate", "scientific-skeptic", "domain-expert"]),
  preset("investor", "Investor lens", ["vc-specialist", "pessimist", "optimistic-futurist"]),
];

export interface PresetSeat {
  persona: Persona;
  model: ModelInfo;
}

/** Look up a preset by id. */
export function getPreset(id: string): PanelPreset | undefined {
  return PANEL_PRESETS.find((p) => p.id === id);
}

/**
 * Map a preset's personas onto the available models.
 *
 * Deterministic rules:
 * 1. Models are grouped by `providerId`. Providers that have at least one
 *    `preferred` model come first; otherwise providers keep the order in
 *    which they first appear in `availableModels`.
 * 2. Within a provider, the candidate list is its `preferred` models if it
 *    has any (the operator listed them explicitly), else all its models,
 *    in input order.
 * 3. Seat *i* goes to provider `i mod providerCount` (round-robin, so every
 *    provider is used before any repeats), taking that provider's next
 *    candidate and cycling when its candidates run out.
 *
 * Unknown persona ids are skipped. No models → `[]`. One provider → every
 * seat uses that provider, rotating through its candidate models.
 */
export function applyPreset(preset: PanelPreset, availableModels: ModelInfo[]): PresetSeat[] {
  if (availableModels.length === 0) return [];

  const groups = new Map<string, ModelInfo[]>();
  for (const m of availableModels) {
    const list = groups.get(m.providerId);
    if (list) list.push(m);
    else groups.set(m.providerId, [m]);
  }

  const providers = [...groups.entries()].map(([providerId, models], order) => {
    const preferred = models.filter((m) => m.preferred);
    return {
      providerId,
      order,
      hasPreferred: preferred.length > 0,
      candidates: preferred.length > 0 ? preferred : models,
    };
  });
  providers.sort((a, b) => Number(b.hasPreferred) - Number(a.hasPreferred) || a.order - b.order);

  const used = new Map<string, number>();
  const seats: PresetSeat[] = [];
  let seatIndex = 0;
  for (const personaId of preset.personaIds) {
    const persona = PERSONAS.find((p) => p.id === personaId);
    if (!persona) continue;
    const provider = providers[seatIndex % providers.length];
    const n = used.get(provider.providerId) ?? 0;
    used.set(provider.providerId, n + 1);
    seats.push({ persona, model: provider.candidates[n % provider.candidates.length] });
    seatIndex++;
  }
  return seats;
}
