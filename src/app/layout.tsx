import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";
import "./trade.css";
import "./discover.css";
import "./consumer.css";
import "./growth.css";
import "./polish.css";
import "./discovery-hub.css";
import { NavigationProgress } from "@/components/navigation-progress";
import { PwaRegister } from "@/components/pwa-register";

const sans = Manrope({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "HYPR — live creators, lasting communities",
    template: "%s · HYPR",
  },
  description: "Watch creators, join lasting communities and return for the next show. Trading is optional. Robinhood Chain testnet preview.",
  applicationName: "HYPR",
  appleWebApp: { capable: true, title: "HYPR", statusBarStyle: "black-translucent" },
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
        <PwaRegister />
        <div id="content">{children}</div>
      </body>
    </html>
  );
}
