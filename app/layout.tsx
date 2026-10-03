import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { THEME_INIT_SCRIPT } from "@/components/ui/theme-script";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "RoundTable — Multi-AI Consensus Playground",
  description:
    "Ask a panel of AI models one question and get an answer-first brief: where they agree, where they split, and how sure they are. Debate, blind jury or red team across Grok, Claude, GPT, and more.",
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
  // Matches --bg in each theme (app/globals.css). Follows the system
  // preference only; a forced data-theme does not change the browser chrome.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#111214" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The inline script may set data-theme before hydration.
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-bg text-fg antialiased">
        {children}
        <Toaster
          theme="system"
          position="bottom-right"
          toastOptions={{
            // Token-based so toasts follow the data-theme override too.
            style: {
              background: "rgb(var(--surface))",
              color: "rgb(var(--fg))",
              border: "1px solid rgb(var(--border))",
              borderRadius: "10px",
              fontSize: "14px",
            },
          }}
        />
      </body>
    </html>
  );
}
