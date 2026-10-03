"use client";

import { useId, type ReactNode } from "react";
import { cn } from "./cn";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible label; also the switch's accessible name. */
  label: ReactNode;
  /** One-line explanation under the label (announced as the description). */
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/** A labelled on/off switch: `<button role="switch" aria-checked>`. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
  className,
}: ToggleProps) {
  const autoId = useId();
  const switchId = id ?? `toggle-${autoId}`;
  const descId = description ? `${switchId}-desc` : undefined;
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <label
          htmlFor={switchId}
          className={cn("text-sm font-medium text-fg", disabled ? "opacity-50" : "cursor-pointer")}
        >
          {label}
        </label>
        {description && (
          <p id={descId} className="mt-0.5 text-[13px] leading-snug text-fg-muted">
            {description}
          </p>
        )}
      </div>
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors duration-150",
          "disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "border-accent bg-accent" : "border-border-strong bg-surface-2",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block h-4 w-4 rounded-full transition-transform duration-150",
            checked ? "translate-x-[18px] bg-accent-fg" : "translate-x-[3px] bg-fg-muted",
          )}
        />
      </button>
    </div>
  );
}
