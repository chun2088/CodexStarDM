import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "Codex Star DM",
    template: "%s | Codex Star DM",
  },
  description: "Progressive Next.js starter with PWA, TanStack Query, and auth context.",
  applicationName: "Codex Star DM",
  manifest: "/manifest.json",
  icons: [
    { rel: "icon", url: "/window.svg" },
    { rel: "apple-touch-icon", url: "/window.svg" },
  ],
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
