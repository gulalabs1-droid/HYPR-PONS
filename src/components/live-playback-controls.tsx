"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { AudioTrackProps } from "@livekit/components-react";
import { RemoteAudioTrack, type Room } from "livekit-client";

const STORAGE_KEY = "hypr:live-playback";
type Preference = { volume: number; muted: boolean };

function savedPreference(): Preference {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null") as Partial<Preference> | null;
    if (value && typeof value.volume === "number" && Number.isFinite(value.volume) && value.volume >= 0 && value.volume <= 1 && typeof value.muted === "boolean") return { volume: value.volume, muted: value.muted };
  } catch { /* Private browsing or unavailable storage must not block playback. */ }
  return { volume: 1, muted: false };
}

export function useViewerPlayback(room: Room, enabled: boolean) {
  const [preference, setPreference] = useState<Preference>(() => typeof window === "undefined" ? { volume: 1, muted: false } : savedPreference());
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preference)); } catch { /* Playback works without saving preferences. */ }
  }, [enabled, preference]);
  const enableAudio = useCallback(() => { void room.startAudio().catch(() => undefined); }, [room]);
  const togglePause = useCallback(() => {
    if (paused && !preference.muted && preference.volume > 0) enableAudio();
    setPaused(!paused);
  }, [enableAudio, paused, preference.muted, preference.volume]);
  const toggleMute = useCallback(() => {
    if (preference.muted || preference.volume === 0) {
      setPreference({ volume: preference.volume || 0.75, muted: false });
      if (!paused) enableAudio();
    } else setPreference(current => ({ ...current, muted: true }));
  }, [enableAudio, paused, preference]);
  const setVolume = useCallback((value: number) => {
    const volume = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
    setPreference({ volume, muted: volume === 0 });
    if (volume > 0 && !paused && (preference.muted || preference.volume === 0)) enableAudio();
  }, [enableAudio, paused, preference.muted, preference.volume]);
  return { ...preference, paused, togglePause, toggleMute, setVolume };
}

export function LivePlaybackControls({ playback, live }: { playback: ReturnType<typeof useViewerPlayback>; live: boolean }) {
  return <div className="live-playback-controls" role="group" aria-label="Live playback controls">
    <button type="button" onClick={playback.togglePause} disabled={!live && !playback.paused} aria-pressed={playback.paused}>{playback.paused ? "▶ Resume live" : "Ⅱ Pause"}</button>
    <button type="button" onClick={playback.toggleMute} aria-pressed={playback.muted || playback.volume === 0}>{playback.muted || playback.volume === 0 ? "🔇 Unmute" : "🔊 Mute"}</button>
    <label className="live-volume">Volume <input type="range" min="0" max="100" step="5" value={Math.round(playback.volume * 100)} aria-label="Broadcast volume" aria-valuetext={`${Math.round(playback.volume * 100)} percent`} onChange={event => playback.setVolume(Number(event.target.value) / 100)} /><span>{Math.round(playback.volume * 100)}%</span></label>
    <span className="live-volume-phone">On some phones, use your device’s volume buttons.</span>
  </div>;
}

/** Mute the output element, not the received track used for a permitted clip. */
export function LivePlaybackAudio({ trackRef, volume, muted }: { trackRef: NonNullable<AudioTrackProps["trackRef"]>; volume?: number; muted: boolean }) {
  const element = useRef<HTMLAudioElement>(null);
  const track = trackRef.publication.track;
  const current = useRef({ muted, volume }); current.current = { muted, volume };
  useEffect(() => {
    const audio = element.current;
    if (!audio || !track) return;
    track.attach(audio);
    // LiveKit's attach resets element.muted, so apply the viewer's choice in
    // the same task before the browser plays the attached audio.
    audio.muted = current.current.muted;
    if (track instanceof RemoteAudioTrack) track.setVolume(current.current.muted ? 0 : current.current.volume ?? 1);
    return () => { track.detach(audio); };
  }, [track]);
  useEffect(() => {
    if (element.current) element.current.muted = muted;
    if (track instanceof RemoteAudioTrack) track.setVolume(muted ? 0 : volume ?? 1);
  }, [muted, track, volume]);
  return <audio ref={element} autoPlay playsInline />;
}
