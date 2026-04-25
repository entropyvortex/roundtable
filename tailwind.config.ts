import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        arena: {
          bg: "#02070F",
          surface: "rgba(8, 20, 44, 0.55)",
          "surface-solid": "#06112A",
          border: "rgba(77, 122, 199, 0.22)",
          "border-strong": "rgba(77, 122, 199, 0.45)",
          accent: "#FF6200",
          glow: "#FF9A4D",
          blue: "#4D7AC7",
          "blue-deep": "#003087",
          success: "#34d399",
          warning: "#fbbf24",
          danger: "#f87171",
          muted: "#8B9CB8",
          text: "#F1F5FF",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        glass:
          "0 8px 32px 0 rgba(0, 0, 0, 0.45), 0 2px 8px 0 rgba(0, 48, 135, 0.18), inset 0 1px 0 0 rgba(255, 255, 255, 0.04)",
        "glass-lg":
          "0 24px 48px -12px rgba(0, 0, 0, 0.55), 0 12px 24px -8px rgba(0, 48, 135, 0.25), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)",
        "glass-xl":
          "0 40px 80px -20px rgba(0, 0, 0, 0.65), 0 20px 40px -10px rgba(0, 48, 135, 0.32), inset 0 1px 0 0 rgba(255, 255, 255, 0.06)",
        "glow-orange": "0 0 24px 0 rgba(255, 98, 0, 0.35), 0 0 48px 0 rgba(255, 98, 0, 0.18)",
        "glow-orange-sm": "0 0 12px 0 rgba(255, 98, 0, 0.4)",
        "glow-blue": "0 0 24px 0 rgba(77, 122, 199, 0.3), 0 0 48px 0 rgba(77, 122, 199, 0.15)",
        "inner-glow":
          "inset 0 1px 0 0 rgba(255, 255, 255, 0.06), inset 0 0 0 1px rgba(77, 122, 199, 0.18)",
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow": "spin 20s linear infinite",
        "spin-slower": "spin 40s linear infinite",
        "float-1": "float1 18s ease-in-out infinite",
        "float-2": "float2 22s ease-in-out infinite",
        "float-3": "float3 26s ease-in-out infinite",
        "ray-sweep": "raySweep 24s linear infinite",
        "ray-sweep-2": "raySweep 32s linear infinite reverse",
        "glow-pulse": "glowPulse 4s ease-in-out infinite",
        shimmer: "shimmer 3s linear infinite",
        "node-pulse": "nodePulse 3.5s ease-in-out infinite",
      },
      keyframes: {
        float1: {
          "0%,100%": { transform: "translate(0,0)" },
          "50%": { transform: "translate(30px, -22px)" },
        },
        float2: {
          "0%,100%": { transform: "translate(0,0)" },
          "50%": { transform: "translate(-26px, 30px)" },
        },
        float3: {
          "0%,100%": { transform: "translate(0,0)" },
          "50%": { transform: "translate(18px, 26px)" },
        },
        raySweep: {
          "0%": { transform: "translateX(-15%) rotate(-8deg)", opacity: "0.4" },
          "50%": { opacity: "0.85" },
          "100%": { transform: "translateX(15%) rotate(-8deg)", opacity: "0.4" },
        },
        glowPulse: {
          "0%,100%": { opacity: "0.55", filter: "blur(20px)" },
          "50%": { opacity: "0.95", filter: "blur(28px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        nodePulse: {
          "0%,100%": { opacity: "0.7", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.08)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
