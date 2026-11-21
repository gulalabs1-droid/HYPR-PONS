"use client";

import React, { useEffect, useRef, useState } from "react";
import { NBC_NEWS_CHANNEL_URL } from "@/lib/nbc-news";
import { ABC_NEWS_CHANNEL_URL } from "@/lib/abc-news";

/** Keep the broadcaster's own player and controls intact, and never count this as a HYPR broadcast. */
export function DemoNewsFeed({ source = "nbc", standalone = false, hostName, onHide }: { source?: "nbc" | "abc"; standalone?: boolean; hostName?: string; onHide?: () => void }) {
  return <NewsFeed key={source} source={source} standalone={standalone} hostName={hostName} onHide={onHide} />;
}

const PLAY_RATIO = 0.3;

function NewsFeed({ source, standalone, hostName, onHide }: { source: "nbc" | "abc"; standalone: boolean; hostName?: string; onHide?: () => void }) {
  const broadcaster = source === "abc" ? "ABC News" : "NBC News";
  const sourceUrl = source === "abc" ? ABC_NEWS_CHANNEL_URL : NBC_NEWS_CHANNEL_URL;
  const frameArea = useRef<HTMLDivElement>(null);
  const hasBeenShown = useRef(false);
  const shownNow = useRef(false);
  const [visible, setVisible] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [newsChecked, setNewsChecked] = useState(false);
  const [retry, setRetry] = useState(0);
  const currentVideo = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const response = await fetch(source === "abc" ? "/api/news?source=abc" : "/api/news", { cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error("News lookup unavailable");
        const data: unknown = await response.json();
        const id = data && typeof data === "object" && "videoId" in data ? data.videoId : null;
        const next = typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
        if (!active) return;
        if (currentVideo.current && next !== currentVideo.current) setAutoplay(false);
        currentVideo.current = next; setVideoId(next); setNewsChecked(true);
      } catch { if (active) setNewsChecked(true); /* Keep the current player during a temporary lookup failure. */ }
    }
    void check();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void check(); }, 300000);
    return () => { active = false; window.clearInterval(timer); };
  }, [retry, source]);

  useEffect(() => {
    const element = frameArea.current;
    if (!element) return;
    let inView = false;
    const update = () => {
      const next = inView && document.visibilityState === "visible";
      if (next === shownNow.current) return;
      shownNow.current = next;
      if (next && !hasBeenShown.current) {
        hasBeenShown.current = true;
        setAutoplay(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      } else if (next) {
        // A viewer who paused the player should not have it restart on scrolling back.
        setAutoplay(false);
      }
      setVisible(next);
    };
    if (!("IntersectionObserver" in window)) {
      inView = true; hasBeenShown.current = true; setAutoplay(false); update();
      document.addEventListener("visibilitychange", update);
      return () => document.removeEventListener("visibilitychange", update);
    }
    // A 16:9 player on a short laptop or phone is often only partly above the fold;
    // requiring most of it to be visible left first-time visitors with an empty box.
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting && entry.intersectionRatio >= PLAY_RATIO; update(); }, { threshold: [0, PLAY_RATIO] });
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);

  // Explicit play is a user gesture, so it may autoplay even before scrolling.
  function playNow() { hasBeenShown.current = true; shownNow.current = true; setAutoplay(true); setVisible(true); }
  const embed = `https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&autoplay=${autoplay ? "1" : "0"}&mute=1`;
  const watchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : sourceUrl;
  // In a room, say plainly whose room this is and that the news is a stand-in while they're away.
  const heading = standalone
    ? <div className="demo-news-heading"><span className="eyebrow">External news · YouTube</span><strong>{broadcaster}</strong><p>Independent news, streamed by the broadcaster on YouTube.</p></div>
    : <div className="demo-news-hosting"><p><strong>{`${hostName || "The creator"} is offline.`}</strong> <span>While you wait, here’s {broadcaster} live from YouTube.</span></p>{onHide && <button type="button" className="demo-news-hide" onClick={onHide}>Hide news</button>}</div>;
  return <div className={`demo-news${standalone ? "" : " is-hosting"}`}>
    {heading}
    <div className="demo-news-player" ref={frameArea}>
      {!newsChecked ? <p>Finding {broadcaster}…</p> : !videoId ? <p>{broadcaster} is temporarily unavailable here. <button className="claim-link" onClick={() => { setNewsChecked(false); setRetry(value => value + 1); }}>Try again</button></p> : visible ? <iframe src={embed} title={`${broadcaster} — independent YouTube player`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <p className="demo-news-paused"><button type="button" className="demo-news-play" onClick={playNow}><span aria-hidden="true">▶</span> {hasBeenShown.current ? `Resume ${broadcaster}` : `Play ${broadcaster}`}</button><small>{hasBeenShown.current ? "Paused while the player was out of view." : "Plays muted. Unmute in the player."}</small></p>}
    </div>
    <div className="demo-news-note"><p>Provided by {broadcaster} on YouTube, which may show ads or ask you to sign in. HYPR isn’t affiliated.</p><a href={watchUrl} target="_blank" rel="noopener noreferrer">{videoId ? "Open on YouTube ↗" : `Open ${broadcaster} ↗`}</a></div>
  </div>;
}
