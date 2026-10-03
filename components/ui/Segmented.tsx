"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "./cn";
import { rovingTarget, useItemRefs } from "./roving";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: ReactNode;
  /** Second line under the label, e.g. a round score. */
  description?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string = string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the radio group. */
  label: string;
  size?: "sm" | "md";
  /** Stretch options to fill the container. */
  fullWidth?: boolean;
  className?: string;
}

/**
 * Segmented control with radio-group semantics: `role="radiogroup"` of
 * `role="radio"` buttons, roving tabindex, arrows move and select.
 */
export function Segmented<T extends string = string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  fullWidth,
  className,
}: SegmentedProps<T>) {
  const { refs, register } = useItemRefs<HTMLButtonElement>();
  const enabled = options.filter((o) => !o.disabled);
  const focusable = options.some((o) => o.value === value && !o.disabled)
    ? value
    : enabled[0]?.value;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = enabled.findIndex((o) => o.value === value);
    const next = rovingTarget(e.key, current, enabled.length, true);
    if (next === null) return;
    e.preventDefault();
    const target = enabled[next];
    refs.current.get(target.value)?.focus();
    if (target.value !== value) onChange(target.value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        "max-w-full gap-0.5 overflow-x-auto rounded-control border border-border bg-surface-2 p-0.5",
        fullWidth ? "flex" : "inline-flex",
        className,
      )}
    >
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={register(o.value)}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={o.value === focusable ? 0 : -1}
            disabled={o.disabled}
            onClick={() => !checked && onChange(o.value)}
            className={cn(
              "flex shrink-0 flex-col items-center justify-center rounded-[6px] border font-medium transition-colors duration-150",
              "focus-visible:outline-offset-[-2px] disabled:cursor-not-allowed disabled:opacity-50",
              size === "sm" ? "min-h-8 px-2.5 text-[13px]" : "min-h-9 px-3 text-sm",
              fullWidth && "flex-1",
              checked
                ? "border-border bg-surface text-fg"
                : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            <span className="whitespace-nowrap">{o.label}</span>
            {o.description !== undefined && (
              <span className="whitespace-nowrap text-[13px] font-normal text-fg-muted tabular-nums">
                {o.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
