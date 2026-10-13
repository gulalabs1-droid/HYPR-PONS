import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";
import "./trade.css";
import { NavigationProgress } from "@/components/navigation-progress";

const sans = Manrope({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "HYPR — discover what is moving",
    template: "%s · HYPR",
  },
  description: "The live launchpad for Robinhood Chain communities. Create a coin, go live, trade, and gather in its room.",
  applicationName: "HYPR",
  openGraph: {
    title: "HYPR — discover what is moving",
    description: "Find the rooms where Robinhood Chain communities are gathering.",
    type: "website",
    siteName: "HYPR",
  },
  twitter: {
    card: "summary_large_image",
    title: "HYPR — discover what is moving",
    description: "Find the rooms where Robinhood Chain communities are gathering.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0c0e",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <a className="skip-link" href="#content">Skip to content</a>
        <NavigationProgress />
        <div id="content">{children}</div>
      </body>
    </html>
  );
}
