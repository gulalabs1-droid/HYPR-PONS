"use client";

import React, { useEffect, useRef, useState } from "react";
import { NBC_NEWS_CHANNEL_URL } from "@/lib/nbc-news";
import { ABC_NEWS_CHANNEL_URL } from "@/lib/abc-news";

/** Keep the broadcaster's own player and controls intact, and never count this as a HYPR broadcast. */
export function DemoNewsFeed({ source = "nbc", standalone = false }: { source?: "nbc" | "abc"; standalone?: boolean }) {
  return <NewsFeed key={source} source={source} standalone={standalone} />;
}

function NewsFeed({ source, standalone }: { source: "nbc" | "abc"; standalone: boolean }) {
  const broadcaster = source === "abc" ? "ABC News" : "NBC News";
  const sourceUrl = source === "abc" ? ABC_NEWS_CHANNEL_URL : NBC_NEWS_CHANNEL_URL;
  const frameArea = useRef<HTMLDivElement>(null);
  const hasBeenShown = useRef(false);
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
    let wasVisible = false;
    const update = () => {
      const next = inView && document.visibilityState === "visible";
      if (next === wasVisible) return;
      wasVisible = next;
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
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting && entry.intersectionRatio >= 0.55; update(); }, { threshold: [0, 0.55] });
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);

  const embed = `https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&autoplay=${autoplay ? "1" : "0"}&mute=1`;
  const watchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : sourceUrl;
  return <div className="demo-news">
    <div className="demo-news-heading"><span className="eyebrow">EXTERNAL NEWS · YOUTUBE</span><strong>{broadcaster}</strong><p>{standalone ? "Independent news, streamed by the broadcaster on YouTube." : "The HYPR creator is offline. Watch an independent news stream while you’re here."}</p></div>
    <div className="demo-news-player" ref={frameArea}>
      {!newsChecked ? <p>Finding {broadcaster}…</p> : !videoId ? <p>{broadcaster} is temporarily unavailable here. <button className="claim-link" onClick={() => { setNewsChecked(false); setRetry(value => value + 1); }}>Try again</button></p> : visible ? <iframe src={embed} title={`${broadcaster} — independent YouTube player`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <p>News pauses when the player is out of view.</p>}
    </div>
    <div className="demo-news-note"><p>YouTube may ask you to sign in, show ads, collect playback data, or limit availability. This feed is provided by {broadcaster}; HYPR is independent.</p><a href={watchUrl} target="_blank" rel="noopener noreferrer">{videoId ? "Can’t play? Open this broadcast on YouTube ↗" : `Open ${broadcaster} ↗`}</a></div>
  </div>;
}
