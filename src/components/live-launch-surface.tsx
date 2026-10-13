"use client";

import { useEffect, useMemo, useState } from "react";
import type { Launch } from "@/lib/types";
import { getStreamEmbedUrl } from "@/lib/stream";
import { NativeLiveRoom } from "./native-live-room";

export function LiveLaunchSurface({ token }: { token: Launch }) {
  const [parentHost, setParentHost] = useState("hypr.app");
  useEffect(() => {
    if (window.location.hostname) setParentHost(window.location.hostname);
  }, []);
  const embedUrl = useMemo(() => getStreamEmbedUrl(token.streamUrl, parentHost), [token.streamUrl, parentHost]);
  const live = Boolean(token.streamLive && embedUrl);

  if (token.origin === "hypr") return <NativeLiveRoom token={token} />;
  if (!token.streamUrl) return <section className="live-surface"><div className="live-copy"><span className="eyebrow">INDEXED PONS ROOM</span><h2>Onchain launch activity</h2><p>Native broadcasts are available in HYPR-created rooms. No external broadcast is being claimed for this room.</p></div></section>;

  return <section className="live-surface">
    <div className="live-copy">
      <span className="eyebrow"><span className={live ? "pulse" : "status-dot inactive"} /> LIVE LAUNCH EXPERIENCE</span>
      <h2>{live ? "The launch is live." : "Launch, trade, gather."}</h2>
      <p>{live ? "Watch the creator and follow the curve without leaving HYPR." : "When a creator attaches an approved stream, it appears here beside the launch activity."}</p>
      <span className="live-state">{live ? "STREAM LIVE · ONCHAIN ACTIVITY BELOW" : token.streamUrl ? "STREAM ATTACHED · LIVE STATUS UNVERIFIED" : "CREATOR STREAM OFFLINE"}</span>
      {!live && embedUrl && <a className="stream-link" href={embedUrl} target="_blank" rel="noreferrer">Open attached stream ↗</a>}
    </div>
    <div className="live-viewport">
      {live && embedUrl ? <iframe src={embedUrl} title={`${token.name} live stream`} allow="autoplay; fullscreen" allowFullScreen /> : null}
      {!live && <div className="live-empty"><strong>{token.streamUrl ? "Ready when the creator goes live" : "No stream attached yet"}</strong><span>Trading, curve progress, chat, and verified activity remain available below.</span></div>}
    </div>
  </section>;
}
