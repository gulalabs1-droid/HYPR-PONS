import assert from "node:assert/strict";
import { test } from "node:test";
import { getStreamEmbedUrl } from "../src/lib/stream";

test("stream adapter allowlists safe YouTube and Twitch embeds", () => {
  assert.equal(getStreamEmbedUrl("https://youtu.be/abc123_XY"), "https://www.youtube-nocookie.com/embed/abc123_XY");
  assert.equal(getStreamEmbedUrl("https://www.youtube.com/watch?v=abc123_XY"), "https://www.youtube-nocookie.com/embed/abc123_XY");
  assert.equal(getStreamEmbedUrl("https://www.twitch.tv/channel_name", "localhost"), "https://player.twitch.tv/?channel=channel_name&parent=localhost");
  assert.equal(getStreamEmbedUrl("https://www.twitch.tv/videos/123456", "hypr.app"), "https://player.twitch.tv/?video=123456&parent=hypr.app");
});

test("stream adapter rejects untrusted or malformed embed sources", () => {
  assert.equal(getStreamEmbedUrl("javascript:alert(1)"), null);
  assert.equal(getStreamEmbedUrl("https://example.com/live"), null);
  assert.equal(getStreamEmbedUrl("https://www.youtube.com/watch?v=short"), null);
  assert.equal(getStreamEmbedUrl("https://player.twitch.tv/?channel=bad channel"), null);
});
