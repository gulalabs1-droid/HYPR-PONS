import type { MetadataRoute } from "next";
import { getPageLaunchData } from "@/lib/page-data";
import { discoveryRooms, isThrowawayRoom } from "@/lib/discovery";
import { isTestnetDemoRoom } from "@/lib/demo-news";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const pages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "always", priority: 1 },
    { url: `${base}/discover`, changeFrequency: "always", priority: 0.9 },
    { url: `${base}/watch`, changeFrequency: "always", priority: 0.9 },
    { url: `${base}/creators`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/faq`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/protocol`, changeFrequency: "hourly", priority: 0.6 },
  ];
  // Rooms are the permanent, shareable pages creators promote. Scratch-named
  // rooms stay reachable by link but are not offered to search engines.
  try {
    const { launches } = await getPageLaunchData();
    const rooms = discoveryRooms(launches, []).filter(room => room.token.origin === "hypr" && (isTestnetDemoRoom(room.token) || !isThrowawayRoom(room)));
    return [...pages, ...rooms.slice(0, 500).map(room => ({ url: `${base}/room/${room.token.address}`, changeFrequency: "daily" as const, priority: 0.7 }))];
  } catch {
    return pages;
  }
}
