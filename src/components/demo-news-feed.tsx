"use client";

import React, { useEffect, useRef, useState } from "react";

const NEWS_CHANNEL = "UCeY0bbntWzzVIaj2z3QigXg";
const NEWS_URL = "https://www.youtube.com/@NBCNews/live";

/** Keep the broadcaster's own player and controls intact, and never count this as a HYPR broadcast. */
export function DemoNewsFeed() {
  const frameArea = useRef<HTMLDivElement>(null);
  const hasBeenShown = useRef(false);
  const [visible, setVisible] = useState(false);
  const [autoplay, setAutoplay] = useState(false);

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

  const embed = `https://www.youtube-nocookie.com/embed/live_stream?channel=${NEWS_CHANNEL}&playsinline=1&autoplay=${autoplay ? "1" : "0"}&mute=1`;
  return <div className="demo-news">
    <div className="demo-news-heading"><span className="eyebrow">EXTERNAL NEWS · YOUTUBE</span><strong>NBC News</strong><p>The HYPR creator is offline. Watch an independent news stream while you’re here.</p></div>
    <div className="demo-news-player" ref={frameArea}>
      {visible ? <iframe src={embed} title="NBC News — independent YouTube player" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <p>News pauses when the player is out of view.</p>}
    </div>
    <div className="demo-news-note"><p>YouTube may show ads, collect playback data, or limit availability. This feed is provided by NBC News; HYPR is independent.</p><a href={NEWS_URL} target="_blank" rel="noopener noreferrer">Can’t play? Open NBC News on YouTube ↗</a></div>
  </div>;
}
