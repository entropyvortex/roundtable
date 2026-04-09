import type { Metadata } from "next";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-arena-bg text-arena-text antialiased overflow-x-hidden">
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#1e2937",
              border: "1px solid #334155",
              color: "#f1f5f9",
            },
          }}
        />
      </body>
    </html>
  );
}
