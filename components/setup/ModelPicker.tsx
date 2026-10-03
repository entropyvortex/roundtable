"use client";

// ─────────────────────────────────────────────────────────────
// ModelPicker — cascaded provider → model menu
// ─────────────────────────────────────────────────────────────
// A single-list drill-down so it fits a phone: the menu first lists
// providers; picking one shows that provider's models (preferred
// first) with an "All providers" item to go back. One provider → straight
// to its models. A provider with a single model is selected in one click.
//
// Keyboard: Enter/Space/↓ open (↑ opens on the last item); ↑/↓/Home/End
// move; → or Enter drills into a provider; ← goes back; Escape (via
// Popover) or Tab closes and returns focus to the trigger.

import { Check, ChevronDown, ChevronLeft, ChevronRight, Star } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { ModelInfo } from "@/lib/types";
import {
  MENU_ITEM_SELECTOR,
  Popover,
  buttonClass,
  cn,
  menuTarget,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui";

export interface ProviderGroup {
  id: string;
  name: string;
  /** Preferred models first, then the rest, each in input order. */
  models: ModelInfo[];
}

/** Group models by provider (first-appearance order), preferred models first. */
export function groupModelsByProvider(models: readonly ModelInfo[]): ProviderGroup[] {
  const groups = new Map<string, ProviderGroup>();
  for (const m of models) {
    const g = groups.get(m.providerId);
    if (g) g.models.push(m);
    else groups.set(m.providerId, { id: m.providerId, name: m.providerName, models: [m] });
  }
  return [...groups.values()].map((g) => ({
    ...g,
    models: [...g.models.filter((m) => m.preferred), ...g.models.filter((m) => !m.preferred)],
  }));
}

export interface ModelPickerProps {
  models: ModelInfo[];
  /** Currently selected model (null shows the placeholder). */
  value: ModelInfo | null;
  onChange: (model: ModelInfo) => void;
  /**
   * Accessible name of the menu, and of the trigger unless `labelledBy` is
   * set — e.g. "Model for seat 2 (Risk Analyst)".
   */
  label: string;
  /**
   * id of a visible label element. The trigger is then named by that label
   * followed by its own text ("Model OpenAI / gpt-4o") instead of `label`.
   */
  labelledBy?: string;
  /** id of an element describing the trigger, e.g. a validation message. */
  describedBy?: string;
  /** Fixed trigger text (e.g. "Model"); by default the trigger shows the value. */
  triggerLabel?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  align?: "start" | "end";
  className?: string;
}

export default function ModelPicker({
  models,
  value,
  onChange,
  label,
  labelledBy,
  describedBy,
  triggerLabel,
  placeholder = "Choose a model",
  disabled,
  variant = "secondary",
  size = "md",
  align = "start",
  className,
}: ModelPickerProps) {
  const groups = useMemo(() => groupModelsByProvider(models), [models]);
  const [open, setOpen] = useState(false);
  /** null = provider list; otherwise the provider whose models are shown. */
  const [level, setLevel] = useState<string | null>(null);
  /** Provider to focus when returning to the provider list. */
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [focusEdge, setFocusEdge] = useState<"first" | "last" | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const menuId = `model-menu-${uid}`;
  const triggerId = `model-trigger-${uid}`;

  const single = groups.length === 1;
  const activeGroup = level ? groups.find((g) => g.id === level) : undefined;
  const activeHasValue = activeGroup?.models.some((m) => m.id === value?.id) ?? false;

  const close = useCallback((restore = true) => {
    setOpen(false);
    if (restore) triggerRef.current?.focus();
  }, []);

  const openMenu = (edge: "first" | "last" | null = null) => {
    if (groups.length === 0) return;
    setLevel(single ? groups[0].id : null);
    setReturnTo(value?.providerId ?? null);
    setFocusEdge(edge);
    setOpen(true);
  };

  // Move focus into the list whenever it opens or changes level.
  useEffect(() => {
    if (!open) return;
    const root = listRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLButtonElement>(MENU_ITEM_SELECTOR));
    const marked = root.querySelector<HTMLButtonElement>('[data-focus-target="true"]');
    const target =
      focusEdge === "last"
        ? items[items.length - 1]
        : focusEdge === "first"
          ? items[0]
          : (marked ?? items[0]);
    target?.focus();
  }, [open, level, focusEdge]);

  const select = (model: ModelInfo) => {
    close();
    onChange(model);
  };

  const drillInto = (group: ProviderGroup) => {
    if (group.models.length === 1) {
      select(group.models[0]);
      return;
    }
    setFocusEdge(null);
    setReturnTo(group.id);
    setLevel(group.id);
  };

  const backToProviders = () => {
    setFocusEdge(null);
    setLevel(null);
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMenu();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openMenu("last");
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>(MENU_ITEM_SELECTOR),
    );
    if (list.length === 0) return;
    const active = document.activeElement as HTMLButtonElement | null;
    if (e.key === "ArrowRight") {
      const pid = active?.dataset.provider;
      const group = pid ? groups.find((g) => g.id === pid) : undefined;
      if (group && group.models.length > 1) {
        e.preventDefault();
        drillInto(group);
      }
      return;
    }
    if (e.key === "ArrowLeft") {
      if (level && !single) {
        e.preventDefault();
        backToProviders();
      }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      close();
      return;
    }
    const next = menuTarget(e.key, active ? list.indexOf(active) : -1, list.length);
    if (next === null) return;
    e.preventDefault();
    list[next].focus();
  };

  const itemClass =
    "flex w-full items-center gap-2 rounded-[6px] px-2.5 py-2 text-left text-sm text-fg " +
    "hover:bg-surface-2 focus:bg-surface-2 focus-visible:outline-offset-[-2px]";

  const empty = groups.length === 0;

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy ? `${labelledBy} ${triggerId}` : undefined}
        aria-describedby={describedBy}
        disabled={disabled || empty}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={buttonClass(variant, size, cn("min-w-0 justify-between", className))}
      >
        <span className="min-w-0 truncate text-left">
          {triggerLabel ? (
            triggerLabel
          ) : value ? (
            <span className="text-fg-muted">
              {value.providerName} / <span className="text-fg">{value.modelId}</span>
            </span>
          ) : (
            <span className="text-fg-muted">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        align={align}
        matchAnchorWidth
        role="menu"
        id={menuId}
        aria-label={label}
        onKeyDown={onMenuKeyDown}
        className="w-[min(22rem,calc(100vw-16px))] p-1"
      >
        <div ref={listRef}>
          {activeGroup ? (
            <>
              {/* Focus the selected model, or the first one when none is in this group. */}
              {!single && (
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={backToProviders}
                  className={cn(itemClass, "text-fg-muted")}
                >
                  <ChevronLeft aria-hidden className="h-4 w-4 shrink-0" />
                  All providers
                </button>
              )}
              <p aria-hidden className="px-2.5 pb-1 pt-2 text-[13px] font-medium text-fg-muted">
                {activeGroup.name}
              </p>
              {activeGroup.models.map((m, i) => {
                const checked = value?.id === m.id;
                const prev = activeGroup.models[i - 1];
                const divider = prev?.preferred && !m.preferred;
                return (
                  <div key={m.id}>
                    {divider && (
                      <div role="separator" className="mx-2 my-1 border-t border-border" />
                    )}
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={checked}
                      tabIndex={-1}
                      data-focus-target={(activeHasValue ? checked : i === 0) || undefined}
                      onClick={() => select(m)}
                      className={itemClass}
                    >
                      <Check
                        aria-hidden
                        className={cn("h-4 w-4 shrink-0", !checked && "invisible")}
                      />
                      <span className="min-w-0 flex-1 truncate">{m.modelId}</span>
                      {m.preferred && (
                        <span className="inline-flex shrink-0 items-center gap-1 text-[13px] text-fg-muted">
                          <Star aria-hidden className="h-3.5 w-3.5 fill-accent text-accent" />
                          <span>Recommended</span>
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </>
          ) : (
            groups.map((g) => {
              const current = value?.providerId === g.id;
              const oneModel = g.models.length === 1;
              return (
                <button
                  key={g.id}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  data-provider={g.id}
                  data-focus-target={(returnTo ? returnTo === g.id : current) || undefined}
                  onClick={() => drillInto(g)}
                  className={itemClass}
                >
                  <Check aria-hidden className={cn("h-4 w-4 shrink-0", !current && "invisible")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{g.name}</span>
                    <span className="block truncate text-[13px] text-fg-muted">
                      {oneModel ? g.models[0].modelId : `${g.models.length} models`}
                    </span>
                  </span>
                  {!oneModel && (
                    <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </Popover>
    </>
  );
}
