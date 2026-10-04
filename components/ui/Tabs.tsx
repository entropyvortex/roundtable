"use client";

import type { HTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { cn } from "./cn";
import { rovingTarget, useItemRefs } from "./roving";

export interface TabItem<T extends string = string> {
  id: T;
  label: ReactNode;
  /** Extra content after the label, e.g. a count badge. */
  badge?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Accessible name of the tab list. */
  label: string;
  /** Shared with <TabPanel idBase> so tabs and panels reference each other. */
  idBase: string;
  variant?: "underline" | "pill";
  className?: string;
}

export const tabId = (idBase: string, id: string) => `${idBase}-tab-${id}`;
export const tabPanelId = (idBase: string, id: string) => `${idBase}-panel-${id}`;

/**
 * WAI-ARIA tabs with roving tabindex and automatic activation:
 * ←/→ move and select, Home/End jump. Disabled tabs are skipped.
 */
export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  label,
  idBase,
  variant = "underline",
  className,
}: TabsProps<T>) {
  const { refs, register } = useItemRefs<HTMLButtonElement>();
  const enabled = items.filter((t) => !t.disabled);
  const focusable = items.some((t) => t.id === value && !t.disabled) ? value : enabled[0]?.id;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = enabled.findIndex((t) => t.id === value);
    const next = rovingTarget(e.key, current, enabled.length);
    if (next === null) return;
    e.preventDefault();
    const target = enabled[next];
    refs.current.get(target.id)?.focus();
    if (target.id !== value) onChange(target.id);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        "flex min-w-0 items-center",
        variant === "pill"
          ? "gap-0.5 rounded-control border border-border bg-surface-2 p-0.5"
          : "gap-1 border-b border-border",
        className,
      )}
    >
      {items.map((t) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={register(t.id)}
            type="button"
            role="tab"
            id={tabId(idBase, t.id)}
            aria-selected={selected}
            aria-controls={selected ? tabPanelId(idBase, t.id) : undefined}
            tabIndex={t.id === focusable ? 0 : -1}
            disabled={t.disabled}
            onClick={() => !selected && onChange(t.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium transition-colors duration-150",
              "disabled:cursor-not-allowed disabled:opacity-50",
              variant === "pill"
                ? cn(
                    "h-8 rounded-[6px] border px-3 focus-visible:outline-offset-[-2px]",
                    selected
                      ? "border-border bg-surface text-fg"
                      : "border-transparent text-fg-muted hover:text-fg",
                  )
                : cn(
                    "-mb-px h-10 border-b-2 px-3",
                    selected
                      ? "border-accent text-fg"
                      : "border-transparent text-fg-muted hover:text-fg",
                  ),
            )}
          >
            {t.label}
            {/* The space keeps the accessible name readable ("History 3"). */}
            {t.badge ? <> {t.badge}</> : null}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  idBase: string;
  /** The tab id this panel belongs to. */
  id: string;
}

export function TabPanel({ idBase, id, className, ...rest }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={tabPanelId(idBase, id)}
      aria-labelledby={tabId(idBase, id)}
      className={className}
      {...rest}
    />
  );
}
