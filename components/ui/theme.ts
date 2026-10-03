"use client";

// ─────────────────────────────────────────────────────────────
// Theme preference — DOM attribute + localStorage, never the store.
// ─────────────────────────────────────────────────────────────
// The pre-paint bootstrap script lives in ./theme-script.ts (server-safe).

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "./theme-script";

export { THEME_STORAGE_KEY };
export type ThemePreference = "system" | "light" | "dark";
const THEME_ORDER: readonly ThemePreference[] = ["system", "light", "dark"];
const CHANGE_EVENT = "rt-theme-change";

function isPreference(v: unknown): v is ThemePreference {
  return v === "system" || v === "light" || v === "dark";
}

/** Saved preference, or "system" when nothing (valid) is saved or storage is unavailable. */
export function readThemePreference(): ThemePreference {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/**
 * Apply a preference: sets (light/dark) or removes (system) `data-theme`
 * on <html>, persists it (try/catch), and notifies `useThemePreference`.
 */
export function setThemePreference(pref: ThemePreference): void {
  const next: ThemePreference = isPreference(pref) ? pref : "system";
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
  }
  try {
    if (next === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage unavailable — the choice still applies for this page view.
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** The preference that follows `current` in the system → light → dark cycle. */
export function nextThemePreference(current: ThemePreference): ThemePreference {
  const i = THEME_ORDER.indexOf(current);
  return THEME_ORDER[(i + 1) % THEME_ORDER.length];
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === THEME_STORAGE_KEY) {
      // Another tab changed it — mirror the attribute here too.
      const pref = readThemePreference();
      const root = document.documentElement;
      if (pref === "system") root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", pref);
      onChange();
    }
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const getServerSnapshot = (): ThemePreference => "system";

/** Current theme preference; re-renders when it changes (this tab or another). */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, readThemePreference, getServerSnapshot);
}
