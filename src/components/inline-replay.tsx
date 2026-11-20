"use client";
import React, { useState } from "react";
import { mediaDuration, type MediaAsset } from "@/lib/media";

/**
 * Offline rooms lead with the creator's latest published recording. The
 * signed playback link is only requested when someone presses play.
 */
export function InlineReplay({ roomId, asset }: { roomId: string; asset: MediaAsset }) {
  const [url, setUrl] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function play() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/community/media/playback?roomId=${encodeURIComponent(roomId)}&id=${encodeURIComponent(asset.id)}`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || typeof data.url !== "string") throw new Error(data.error || "This recording is unavailable right now.");
      setUrl(data.url);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "This recording is unavailable right now."); }
    finally { setBusy(false); }
  }
  return <div className="inline-replay">
    {url ? <video src={url} controls autoPlay playsInline aria-label={asset.title} onError={() => { setUrl(""); setError("The video link expired. Press play again."); }} />
      : <button type="button" className="inline-replay-poster" disabled={busy} onClick={() => void play()}>
        <span className="inline-replay-play" aria-hidden="true">▶</span>
        <span className="inline-replay-label">{asset.kind === "clip" ? "LATEST CLIP" : "LATEST REPLAY"} · {mediaDuration(Number(asset.durationSeconds))}</span>
        <strong>{busy ? "Loading…" : asset.title}</strong>
        <small>The creator is offline—catch up while you wait.</small>
      </button>}
    {error && <p className="live-notice" role="status">{error}</p>}
  </div>;
}
