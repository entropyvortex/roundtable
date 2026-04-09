import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        arena: {
          bg: "#0f172a",
          surface: "#1e2937",
          border: "#334155",
          accent: "#60a5fa",
          glow: "#93c5fd",
          success: "#34d399",
          warning: "#fbbf24",
          danger: "#f87171",
          muted: "#94a3b8",
          text: "#f1f5f9",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow": "spin 20s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
