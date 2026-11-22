import { Suspense } from "react";
import type { Metadata } from "next";
import { DiscoveryDirectory } from "@/components/discovery-directory";
import { getPageLaunchData } from "@/lib/page-data";

// Served from cache and refreshed every 10 seconds; live status updates in the browser.
export const revalidate = 10;
// A page with its own share text must name the default share card, or it would have none.
const SHARE_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "HYPR — watch live creators free, stay for the community." };
export const metadata: Metadata = {
  title: "Discover creators & live rooms",
  description: "Find live creators, upcoming shows, and a community to return to. Watching is free. No wallet or coin purchase needed.",
  alternates: { canonical: "/discover" },
  openGraph: { title: "Discover live creators on HYPR", description: "Live rooms, upcoming shows and communities to come back to. Free to watch, no wallet needed. Testnet preview.", type: "website", url: "/discover", images: [SHARE_IMAGE] },
  twitter: { card: "summary_large_image", title: "Discover live creators on HYPR", description: "Live rooms, upcoming shows and communities to come back to. Free to watch, no wallet needed.", images: [SHARE_IMAGE.url] },
};
export default async function DiscoverPage() {
  const result = await getPageLaunchData();
  return <Suspense fallback={<main className="page-shell"><h1>Discover rooms</h1><p role="status">Loading discovery…</p></main>}><DiscoveryDirectory initialLaunches={result.launches} source={result.source} /></Suspense>;
}
