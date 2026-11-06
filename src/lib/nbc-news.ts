export const NBC_NEWS_CHANNEL = "UCeY0bbntWzzVIaj2z3QigXg";
export const NBC_NEWS_CHANNEL_URL = "https://www.youtube.com/@NBCNews/live";

// Manually verified on November 5, 2026. This is deliberately short-lived:
// without a live lookup, an old broadcast must not be presented indefinitely.
export const NBC_NEWS_VERIFIED_VIDEO = "0uwAtfBIVx0";
export const NBC_NEWS_VERIFIED_UNTIL = Date.parse("2026-11-06T05:00:00Z");

export function fallbackNewsVideo(now = Date.now()): string | null {
  return now < NBC_NEWS_VERIFIED_UNTIL ? NBC_NEWS_VERIFIED_VIDEO : null;
}

export function findNBCNewsBroadcast(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("items" in data) || !Array.isArray(data.items)) return null;
  for (const item of data.items) {
    if (!item || typeof item !== "object") continue;
    const { id, snippet } = item as { id?: { videoId?: unknown }; snippet?: { channelId?: unknown; title?: unknown; liveBroadcastContent?: unknown } };
    if (typeof id?.videoId !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(id.videoId)) continue;
    if (snippet?.channelId !== NBC_NEWS_CHANNEL || snippet.liveBroadcastContent !== "live") continue;
    if (typeof snippet.title !== "string" || !/\bnbc\s+news\s+now\b/i.test(snippet.title)) continue;
    return id.videoId;
  }
  return null;
}
