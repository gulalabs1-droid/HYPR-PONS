import { unstable_cache } from "next/cache";
import { fallbackNewsVideo, findNBCNewsBroadcast, NBC_NEWS_CHANNEL } from "@/lib/nbc-news";

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

export async function GET() {
  let videoId: string | null = null;
  if (process.env.YOUTUBE_DATA_API_KEY) {
    try { videoId = await lookupNBCNews(); } catch {
      // Let an already-playing client keep its player on a temporary provider failure.
      // A successful empty result remains distinct: that means no matching live stream.
      videoId = fallbackNewsVideo();
      if (!videoId) return Response.json({ videoId: null }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  }
  videoId ||= fallbackNewsVideo();
  return Response.json({ videoId }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } });
}
