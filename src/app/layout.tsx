import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";
import "./trade.css";
import "./discover.css";
import "./consumer.css";
import "./growth.css";
import "./polish.css";
import "./discovery-hub.css";
import { NavigationProgress } from "@/components/navigation-progress";
import { PwaRegister } from "@/components/pwa-register";
import { MediaUploadProvider } from "@/components/media-upload-provider";
import "./media.css";
import "./market.css";
import "./live-stage.css";
import "./watch.css";
// Brand layer: loaded last so the HYPR design system wins over older page layers.
import "./brand.css";
// Platform layer: rail, channel layout, chat and cards. Loaded after the brand tokens.
import "./platform.css";
// Go live setup and the creator's on-air deck.
import "./go-live.css";

const sans = Manrope({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap", weight: ["600", "700", "800"] });
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
    title: "HYPR — watch live, stay for the community",
    description: "Watch live creators free, chat with just a nickname and follow for the next show. Trading is optional. Robinhood Chain testnet preview.",
    type: "website",
    siteName: "HYPR",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "HYPR — watch live, stay for the community",
    description: "Watch live creators free, chat with just a nickname and follow for the next show. Trading is optional. Robinhood Chain testnet preview.",
  },
};

export const viewport: Viewport = {
  themeColor: "#08080c",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>
        <a className="skip-link" href="#content">Skip to content</a>
        <NavigationProgress />
        <PwaRegister />
        <MediaUploadProvider><div id="content">{children}</div></MediaUploadProvider>
      </body>
    </html>
  );
}
