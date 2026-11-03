"use client";

import React, { useEffect, useState, type RefObject } from "react";
import { VideoTrack, type VideoTrackProps } from "@livekit/components-react";
import type { useViewerPlayback } from "./live-playback-controls";

type VideoRef = NonNullable<VideoTrackProps["trackRef"]>;
export type MiniGuest = { id: string; video?: VideoRef };

/** Show only after the viewer scrolls past the stage, never before reaching it. */
export function useMobileMiniPlayer(stageRef: RefObject<HTMLElement>, active: boolean) {
  const [enabled, setEnabled] = useState(true);
  const [offscreen, setOffscreen] = useState(false);

  useEffect(() => {
    const currentStage = stageRef.current;
    if (!active || !enabled || !currentStage || typeof window === "undefined") {
      setOffscreen(false);
      return;
    }
    const stage: HTMLElement = currentStage;
    const mobile = window.matchMedia("(max-width: 760px)");
    let observer: IntersectionObserver | undefined;
    let removeFallback = () => {};

    function observe() {
      observer?.disconnect();
      removeFallback();
      if (!mobile.matches) { setOffscreen(false); return; }
      const header = document.querySelector(".site-header")?.getBoundingClientRect().bottom || 0;
      const top = Math.max(0, Math.min(180, Math.round(header)));
      const Observer = window.IntersectionObserver as typeof IntersectionObserver | undefined;
      if (Observer) {
        observer = new Observer(([entry]) => {
          if (entry) setOffscreen(!entry.isIntersecting && entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? top));
        }, { rootMargin: `-${top}px 0px 0px 0px`, threshold: 0 });
        observer.observe(stage);
      } else {
        const check = () => setOffscreen(stage.getBoundingClientRect().bottom <= top);
        window.addEventListener("scroll", check, { passive: true });
        window.addEventListener("resize", check);
        removeFallback = () => { window.removeEventListener("scroll", check); window.removeEventListener("resize", check); };
        check();
      }
    }

    observe();
    if (mobile.addEventListener) mobile.addEventListener("change", observe);
    else mobile.addListener(observe);
    return () => {
      observer?.disconnect(); removeFallback();
      if (mobile.removeEventListener) mobile.removeEventListener("change", observe);
      else mobile.removeListener(observe);
    };
  }, [active, enabled, stageRef]);

  return { enabled, visible: active && enabled && offscreen, setEnabled };
}

export function MobileMiniPlayer({ playback, live, status, onStage, primaryVideo, creatorCamera, guests, onReturn, onClose }: {
  playback: ReturnType<typeof useViewerPlayback>; live: boolean; status: string; onStage: boolean;
  primaryVideo?: VideoRef; creatorCamera?: VideoRef; guests: MiniGuest[];
  onReturn: () => void; onClose: () => void;
}) {
  const [left, setLeft] = useState(false);
  const paused = playback.paused;
  const muted = playback.muted || playback.volume === 0;
  return <section className={`mobile-mini-player${left ? " is-left" : ""}`} aria-label="Mini live player">
    <div className="mini-player-header"><span>{onStage ? "ON STAGE" : live ? "LIVE" : "WAITING"}</span><div>
      <button type="button" onClick={() => setLeft(!left)} aria-label={`Move mini player to the ${left ? "right" : "left"}`} title="Move mini player">↔</button>
      <button type="button" onClick={onClose} aria-label="Close mini player and keep watching" title="Close mini player and keep watching">×</button>
    </div></div>
    <button type="button" className="mini-player-picture" onClick={onReturn} aria-label="Return to the full broadcast">
      {!live || paused ? <span className="mini-player-placeholder">{paused && live ? "Playback paused" : status}</span> : <div className={`mini-player-stage${guests.length ? " has-guests" : ""}`} aria-hidden="true">
        <div className="mini-player-host">{primaryVideo ? <VideoTrack trackRef={primaryVideo} manageSubscription={false} autoPlay playsInline muted /> : <span className="mini-player-placeholder">Audio live</span>}
          {creatorCamera && <div className="mini-player-camera"><VideoTrack trackRef={creatorCamera} manageSubscription={false} autoPlay playsInline muted /></div>}
        </div>
        {guests.length > 0 && <div className="mini-player-guests">{guests.map(guest => <div key={guest.id}>{guest.video ? <VideoTrack trackRef={guest.video} manageSubscription={false} autoPlay playsInline muted /> : <span>Guest</span>}</div>)}</div>}
      </div>}
    </button>
    <div className="mini-player-actions">
      <button type="button" disabled={!live && !paused} onClick={playback.togglePause} aria-label={paused ? "Resume watching live" : "Pause watching"}>{paused ? "▶ Resume" : "Ⅱ Pause"}</button>
      <button type="button" onClick={playback.toggleMute} aria-label={muted ? "Unmute for me" : "Mute for me"}>{muted ? "🔇 Unmute" : "🔊 Mute"}</button>
    </div>
    {onStage && <p>You’re still on stage.</p>}
  </section>;
}
