import type { Metadata } from "next";
import { getPageLaunchData } from "@/lib/page-data";
import { WatchHub } from "@/components/watch-hub";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Watch news and live creators",
  description: "Watch independent news streams and discover live creator rooms on HYPR. No wallet is needed to watch.",
  alternates: { canonical: "/watch" },
};

export default async function WatchPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const [query, result] = await Promise.all([searchParams, getPageLaunchData()]);
  const source = query.source === "abc" ? "abc" : "nbc";
  return <WatchHub source={source} initialLaunches={result.launches} initialSource={result.source} />;
}
