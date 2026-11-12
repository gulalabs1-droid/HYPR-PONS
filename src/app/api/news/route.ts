import { unstable_cache } from "next/cache";
import { fallbackNewsVideo, findNBCNewsBroadcast, NBC_NEWS_CHANNEL } from "@/lib/nbc-news";
import { ABC_NEWS_CHANNEL, findABCNewsBroadcast } from "@/lib/abc-news";

// One shared, time-limited lookup; the browser never receives the API key.
const lookupNBCNews = unstable_cache(async () => {
  const key = process.env.YOUTUBE_DATA_API_KEY;
  if (!key) return null;
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams({ part: "snippet", channelId: NBC_NEWS_CHANNEL, eventType: "live", type: "video", videoEmbeddable: "true", q: "NBC News NOW", order: "viewCount", maxResults: "10" }).toString();
  const response = await fetch(url, { headers: { "X-Goog-Api-Key": key }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("The news lookup is unavailable");
  return findNBCNewsBroadcast(await response.json());
}, ["hypr-nbc-news-v1"], { revalidate: 1800 });

// A second allowlisted source uses a longer cache to conserve the project's free quota.
const lookupABCNews = unstable_cache(async () => {
  const key = process.env.YOUTUBE_DATA_API_KEY;
  if (!key) return null;
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams({ part: "snippet", channelId: ABC_NEWS_CHANNEL, eventType: "live", type: "video", videoEmbeddable: "true", q: "ABC News Live", order: "viewCount", maxResults: "10" }).toString();
  const response = await fetch(url, { headers: { "X-Goog-Api-Key": key }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("The news lookup is unavailable");
  return findABCNewsBroadcast(await response.json());
}, ["hypr-abc-news-v1"], { revalidate: 3600 });

export async function GET(request: Request) {
  const source = new URL(request.url).searchParams.get("source") || "nbc";
  if (source !== "nbc" && source !== "abc") return Response.json({ error: "Unknown news source" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  let videoId: string | null = null;
  if (process.env.YOUTUBE_DATA_API_KEY) {
    try { videoId = await (source === "abc" ? lookupABCNews() : lookupNBCNews()); } catch {
      // Let an already-playing client keep its player on a temporary provider failure.
      // A successful empty result remains distinct: that means no matching live stream.
      videoId = source === "nbc" ? fallbackNewsVideo() : null;
      if (!videoId) return Response.json({ videoId: null }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  }
  if (source === "nbc") videoId ||= fallbackNewsVideo();
  return Response.json({ videoId }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } });
}
