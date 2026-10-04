// ─────────────────────────────────────────────────────────────
// Theme bootstrap — server-safe (no React, no "use client").
// ─────────────────────────────────────────────────────────────
// Imported by the root layout, which is a server component.

export const THEME_STORAGE_KEY = "rt.theme";

/**
 * Inline, render-blocking script for <head>: applies a saved light/dark
 * choice before first paint. With nothing saved it leaves `data-theme`
 * unset so `prefers-color-scheme` decides.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;
