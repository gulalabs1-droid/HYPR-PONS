// The official ABC News YouTube channel, verified through its player share menu.
export const ABC_NEWS_CHANNEL = "UCBi2mrWuNuyYy4gbM6fU18Q";
export const ABC_NEWS_CHANNEL_URL = "https://www.youtube.com/@ABCNews/live";

export function findABCNewsBroadcast(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("items" in data) || !Array.isArray(data.items)) return null;
  for (const item of data.items) {
    if (!item || typeof item !== "object") continue;
    const { id, snippet } = item as { id?: { videoId?: unknown }; snippet?: { channelId?: unknown; title?: unknown; liveBroadcastContent?: unknown } };
    if (typeof id?.videoId !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(id.videoId)) continue;
    if (snippet?.channelId !== ABC_NEWS_CHANNEL || snippet.liveBroadcastContent !== "live") continue;
    if (typeof snippet.title !== "string" || !/\babc\s+news\s+live\b/i.test(snippet.title)) continue;
    return id.videoId;
  }
  return null;
}
