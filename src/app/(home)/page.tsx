import type { Metadata } from "next";
import { DiscoverClient } from "@/components/discover-client";
import { CreateRoomPanel } from "@/components/create-room-panel";
import { getPageLaunchData } from "@/lib/page-data";

// Served from cache and refreshed every 10 seconds; live status updates in the browser.
export const revalidate = 10;

export const metadata: Metadata = { alternates: { canonical: "/" } };

// Tells search engines the site name and that header search lives at /discover?q=.
function siteJsonLd() {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "HYPR",
    url: `${base}/`,
    description: "Watch live creators free, join lasting communities and come back for the next show. Robinhood Chain testnet preview.",
    potentialAction: { "@type": "SearchAction", target: `${base}/discover?q={search_term_string}`, "query-input": "required name=search_term_string" },
  }).replace(/</g, "\\u003c");
}

export default async function HomePage() {
  const result = await getPageLaunchData();
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: siteJsonLd() }} />
    <DiscoverClient initialLaunches={result.launches} source={result.source}><CreateRoomPanel /></DiscoverClient>
  </>;
}
