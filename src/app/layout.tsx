import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "HYPR — discover what is moving",
    template: "%s · HYPR",
  },
  description: "The social discovery layer for Robinhood Chain communities.",
  openGraph: {
    title: "HYPR — discover what is moving",
    description: "Find the rooms where Robinhood Chain communities are gathering.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
