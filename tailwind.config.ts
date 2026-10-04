import type { Config } from "tailwindcss";

/** `rgb(var(--token) / <alpha-value>)` so `bg-accent/10` etc. work. */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  // Colours come from the CSS variables in app/globals.css, which switch
  // on `data-theme` and on `prefers-color-scheme`. `dark:` variants match
  // only the forced override, so style with tokens instead.
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        surface: {
          DEFAULT: token("surface"),
          2: token("surface-2"),
        },
        border: {
          DEFAULT: token("border"),
          strong: token("border-strong"),
        },
        fg: {
          DEFAULT: token("fg"),
          muted: token("fg-muted"),
        },
        accent: {
          DEFAULT: token("accent"),
          fg: token("accent-fg"),
        },
        success: token("success"),
        warning: token("warning"),
        danger: token("danger"),
        info: token("info"),
        ring: token("ring"),
      },
      // Plain `border` / `divide-*` use the border token by default.
      borderColor: {
        DEFAULT: token("border"),
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        control: "8px",
        card: "12px",
      },
      boxShadow: {
        // Real shadows only on popovers / modals.
        popover:
          "0 8px 24px -8px rgb(var(--shadow-color) / 0.18), 0 2px 6px rgb(var(--shadow-color) / 0.08)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        // ≤ 200ms, opacity/transform only; zeroed under prefers-reduced-motion.
        "fade-in": "fade-in 150ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
