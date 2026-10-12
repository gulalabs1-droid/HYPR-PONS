const VIDEO_ID = /^[A-Za-z0-9_-]{6,64}$/;
const CHANNEL_ID = /^[A-Za-z0-9_]{1,64}$/;

export function getStreamEmbedUrl(rawUrl?: string, parentHost = "hypr.app") {
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const hostname = url.hostname.toLowerCase();
  if (hostname === "youtube.com" || hostname === "www.youtube.com" || hostname === "m.youtube.com" || hostname === "youtu.be") {
    const pathParts = url.pathname.split("/").filter(Boolean);
    const videoId = hostname === "youtu.be"
      ? pathParts[0]
      : url.searchParams.get("v") || (pathParts[0] === "embed" || pathParts[0] === "shorts" || pathParts[0] === "live" ? pathParts[1] : undefined);
    return videoId && VIDEO_ID.test(videoId)
      ? `https://www.youtube-nocookie.com/embed/${videoId}`
      : null;
  }

  if (hostname === "twitch.tv" || hostname === "www.twitch.tv") {
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts[0] === "videos" && pathParts[1] && /^\d{1,20}$/.test(pathParts[1])) {
      return `https://player.twitch.tv/?video=${pathParts[1]}&parent=${encodeURIComponent(parentHost)}`;
    }
    const channel = pathParts[0];
    return channel && CHANNEL_ID.test(channel)
      ? `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(parentHost)}`
      : null;
  }

  if (hostname === "player.twitch.tv") {
    const channel = url.searchParams.get("channel");
    const video = url.searchParams.get("video");
    if ((channel && CHANNEL_ID.test(channel)) || (video && /^\d{1,20}$/.test(video))) {
      const params = new URLSearchParams();
      if (channel) params.set("channel", channel);
      if (video) params.set("video", video);
      params.set("parent", url.searchParams.get("parent") || parentHost);
      return `https://player.twitch.tv/?${params.toString()}`;
    }
  }
  return null;
}
