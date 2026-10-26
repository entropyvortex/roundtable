// ─────────────────────────────────────────────────────────────
// Theme bootstrap — server-safe (no React, no "use client").
// ─────────────────────────────────────────────────────────────
// Imported by the root layout, which is a server component.

export const THEME_STORAGE_KEY = "rt.theme";

const UNSAFE_SCRIPT_CHARS: Record<string, string> = {
  "<": "\\u003C",
  ">": "\\u003E",
  "/": "\\u002F",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

/**
 * Serialize a value as a JavaScript literal that is safe to embed inside an
 * inline `<script>` element: JSON-encodes it, then escapes characters that
 * could close the script tag (`<`, `>`, `/`) or break the JS string
 * (U+2028/U+2029 line separators).
 */
export function toInlineScriptLiteral(value: unknown): string {
  return JSON.stringify(value).replace(/[<>/\u2028\u2029]/g, (ch) => UNSAFE_SCRIPT_CHARS[ch] ?? ch);
}

/**
 * Inline, render-blocking script for <head>: applies a saved light/dark
 * choice before first paint. With nothing saved it leaves `data-theme`
 * unset so `prefers-color-scheme` decides.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${toInlineScriptLiteral(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;
