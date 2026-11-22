import type { Metadata } from "next";
import { getPageLaunchData } from "@/lib/page-data";
import { WatchHub } from "@/components/watch-hub";

export const dynamic = "force-dynamic";
// A page with its own share text must name the default share card, or it would have none.
const SHARE_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "HYPR — watch live creators free, stay for the community." };
export const metadata: Metadata = {
  title: "Watch news and live creators",
  description: "Watch independent news streams and discover live creator rooms on HYPR. No wallet is needed to watch.",
  alternates: { canonical: "/watch" },
  openGraph: { title: "Watch on HYPR — live creators and live news", description: "Live creator rooms, plus independent news streams while you wait. Free to watch, no wallet needed.", type: "website", url: "/watch", images: [SHARE_IMAGE] },
  twitter: { card: "summary_large_image", title: "Watch on HYPR — live creators and live news", description: "Live creator rooms, plus independent news streams while you wait. Free to watch, no wallet needed.", images: [SHARE_IMAGE.url] },
};

export default async function WatchPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const [query, result] = await Promise.all([searchParams, getPageLaunchData()]);
  const source = query.source === "abc" ? "abc" : "nbc";
  return <WatchHub source={source} initialLaunches={result.launches} initialSource={result.source} />;
}
