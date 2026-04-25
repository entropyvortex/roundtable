import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "RoundTable — Multi-AI Consensus Playground",
  description:
    "Put multiple AI models in a room. Give them personas. Watch them debate. Run the Consensus Validation Protocol with Grok, Claude, GPT, and more.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#02070F",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-arena-bg text-arena-text antialiased overflow-x-clip">
        {/* ── Fixed cosmic atmosphere — paint once, GPU-composited ───────── */}
        <div
          aria-hidden
          className="fixed inset-0 -z-30 pointer-events-none"
          style={{
            backgroundImage: "url(/background.jpg)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.4,
            filter: "saturate(1.05) brightness(0.55)",
          }}
        />
        <div
          aria-hidden
          className="fixed inset-0 -z-20 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 20% 0%, rgba(0, 48, 135, 0.55), transparent 60%)," +
              "radial-gradient(ellipse 60% 40% at 80% 8%, rgba(255, 98, 0, 0.14), transparent 65%)," +
              "radial-gradient(ellipse 100% 70% at 50% 110%, rgba(0, 48, 135, 0.42), transparent 70%)," +
              "linear-gradient(180deg, rgba(2, 7, 15, 0.85) 0%, rgba(3, 10, 28, 0.9) 50%, rgba(2, 7, 15, 0.95) 100%)",
          }}
        />
        {/* Faint starfield (opacity-only twinkle) */}
        <div aria-hidden className="cosmic-stars fixed inset-0 -z-10 pointer-events-none" />
        {/* Two slow drifting orbs (translate-only, smaller blur) */}
        <div aria-hidden className="cosmic-orbs fixed inset-0 -z-10 pointer-events-none" />

        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "rgba(8, 22, 52, 0.85)",
              border: "1px solid rgba(77, 122, 199, 0.35)",
              backdropFilter: "blur(16px)",
              color: "#F1F5FF",
              borderRadius: "14px",
              boxShadow: "0 12px 40px rgba(0, 0, 0, 0.6), 0 0 24px rgba(0, 48, 135, 0.25)",
            },
          }}
        />
      </body>
    </html>
  );
}
