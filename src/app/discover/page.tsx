import { Suspense } from "react";
import type { Metadata } from "next";
import { DiscoveryDirectory } from "@/components/discovery-directory";
import { getPageLaunchData } from "@/lib/page-data";

// Served from cache and refreshed every 10 seconds; live status updates in the browser.
export const revalidate = 10;
export const metadata: Metadata = {
  title: "Discover creators & live rooms",
  description: "Find live creators, upcoming shows, and a community to return to. Watching is free. No wallet or coin purchase needed.",
  alternates: { canonical: "/discover" },
};
export default async function DiscoverPage() {
  const result = await getPageLaunchData();
  return <Suspense fallback={<main className="page-shell"><h1>Discover rooms</h1><p role="status">Loading discovery…</p></main>}><DiscoveryDirectory initialLaunches={result.launches} source={result.source} /></Suspense>;
}
