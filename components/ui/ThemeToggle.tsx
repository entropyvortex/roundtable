"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "./cn";
import {
  nextThemePreference,
  setThemePreference,
  useThemePreference,
  type ThemePreference,
} from "./theme";

const META: Record<ThemePreference, { label: string; Icon: typeof Sun }> = {
  system: { label: "System", Icon: Monitor },
  light: { label: "Light", Icon: Sun },
  dark: { label: "Dark", Icon: Moon },
};

export interface ThemeToggleProps {
  /** Show the current theme name next to the icon. */
  showLabel?: boolean;
  className?: string;
}

/**
 * Cycles System → Light → Dark. Persists to localStorage["rt.theme"] and
 * sets `data-theme` on <html> ("System" removes it).
 */
export function ThemeToggle({ showLabel, className }: ThemeToggleProps) {
  const pref = useThemePreference();
  const next = nextThemePreference(pref);
  const { label, Icon } = META[pref];
  const title = `Theme: ${label}. Switch to ${META[next].label.toLowerCase()}.`;
  return (
    <button
      type="button"
      onClick={() => setThemePreference(next)}
      aria-label={title}
      title={title}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-control border border-transparent text-fg-muted",
        "transition-colors duration-150 hover:bg-surface-2 hover:text-fg",
        showLabel ? "px-2.5 text-[13px] font-medium" : "w-9",
        className,
      )}
    >
      <Icon aria-hidden className="h-4 w-4" />
      {showLabel && <span>{label}</span>}
    </button>
  );
}
