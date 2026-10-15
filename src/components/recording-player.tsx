"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { canonicalRoomUrl } from "@/lib/growth";
import { mediaDuration } from "@/lib/media";
import { authorizeMedia, subscribeMediaWalletChange } from "@/lib/media-client";
import { resetCommunitySession } from "@/lib/community-client";

type Playback = { id: string; title: string; kind: string; published: boolean; mime: string; durationSeconds: number; url: string };
export function RecordingPlayer({ roomId, id }: { roomId: string; id: string }) {
  const [asset, setAsset] = useState<Playback | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [copied, setCopied] = useState(false);
  const video = useRef<HTMLVideoElement>(null), position = useRef(0), generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current; setLoading(true); setError("");
    try {
      const response = await fetch(`/api/media/playback?roomId=${encodeURIComponent(roomId)}&id=${encodeURIComponent(id)}`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
      const data = await response.json();
      if (!response.ok || typeof data.url !== "string") throw new Error(data.error || "This recording is unavailable.");
      if (current === generation.current) setAsset(data);
    } catch (failure) { if (current === generation.current) { setAsset(null); setError(failure instanceof Error ? failure.message : "Playback unavailable."); } }
    finally { if (current === generation.current) setLoading(false); }
  }, [roomId, id]);
  useEffect(() => { const counter = generation; void load(); return () => { counter.current++; }; }, [load]);
  useEffect(() => subscribeMediaWalletChange(() => { generation.current++; setAsset(null); position.current = 0; setLoading(false); setError("Wallet changed. Sign in again to access a private draft, or reload to watch a public recording."); void resetCommunitySession().catch(() => undefined); }), []);
  async function signIn() { try { await authorizeMedia(); await load(); } catch (failure) { setError(failure instanceof Error ? failure.message : "Sign-in failed."); } }
  const url = `${canonicalRoomUrl(roomId)}/recording/${id}`;
  return <section className="recording-player" aria-label="Saved recording player">
    {loading && <p role="status">Loading recording…</p>}
    {asset && <><span className="eyebrow">{asset.published ? "PUBLISHED RECORDING" : "PRIVATE DRAFT · NOT PUBLIC"} · {mediaDuration(Number(asset.durationSeconds))}</span><h1>{asset.title}</h1>
      <p className="accounting-copy">{asset.kind === "clip" ? "A saved clip" : "A saved replay"} · not a live broadcast. Your camera and microphone are never requested.</p>
      <video key={asset.url} ref={video} src={asset.url} controls playsInline preload="metadata" aria-label={asset.title} onLoadedMetadata={() => { if (video.current && position.current > 0) video.current.currentTime = position.current; }} onError={() => setError("The playback link may have expired, or this browser cannot decode the video. Reload the video link or try a current Chrome, Edge or Safari browser.")} />
      {asset.published ? <div className="media-actions"><button type="button" className="secondary-button" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setError(`Copy this public recording link: ${url}`); } }}>{copied ? "Link copied" : "Copy recording link"}</button></div> : <p className="live-notice">Only you and the room creator can preview this draft. The creator can publish it from Replays & clips in the room.</p>}
    </>}
    {error && <p role="alert" className="live-notice">{error}</p>}
    <div className="media-actions"><button className="claim-link" type="button" disabled={loading} onClick={() => { position.current = video.current?.currentTime || 0; void load(); }}>Reload video link</button>{!asset && !loading && <button className="secondary-button" type="button" onClick={() => void signIn()}>Sign in to preview your draft</button>}</div>
  </section>;
}
