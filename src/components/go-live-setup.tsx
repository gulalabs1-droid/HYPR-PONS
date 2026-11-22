"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { streamingErrorMessage } from "@/lib/creator-access";
import { LiveIcon } from "./live-icons";

export type GoLiveChoice = { video: boolean; audio: boolean; videoDeviceId?: string; audioDeviceId?: string; saveReplay: boolean };

type Access = "asking" | "ready" | "blocked" | "missing" | "unsupported";

const tracksOf = (stream: MediaStream | null, kind: "audio" | "video") => stream?.getTracks().filter(track => track.kind === kind) || [];

/**
 * One screen between "I want to go live" and being live: the camera fills the player,
 * the mic shows it is hearing you, and one button starts the show. Nothing is published
 * until Go live; the preview stays on this device.
 */
export function GoLiveSetup({ showTitle, configured, busy, countdown, notice, oneTimeAvailable, onStart, onOneTime, onCancelCountdown, onClose }: {
  showTitle?: string; configured: boolean; busy: boolean; countdown: number | null; notice: string; oneTimeAvailable: boolean;
  onStart: (choice: GoLiveChoice) => void; onOneTime: (choice: GoLiveChoice) => void; onCancelCountdown: () => void; onClose: () => void;
}) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [access, setAccess] = useState<Access>("asking");
  const [problem, setProblem] = useState("");
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [saveReplay, setSaveReplay] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoId, setVideoId] = useState<string>();
  const [audioId, setAudioId] = useState<string>();
  const streamRef = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const meter = useRef<HTMLSpanElement>(null);
  const mounted = useRef(true);
  const request = useRef(0);

  const release = useCallback((target: MediaStream | null) => { target?.getTracks().forEach(track => track.stop()); }, []);

  const acquire = useCallback(async (nextVideo?: string, nextAudio?: string) => {
    const generation = ++request.current;
    const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    if (!media?.getUserMedia) { setAccess("unsupported"); setProblem("Going live from the browser needs a secure page in a recent Safari, Chrome, Edge or Firefox."); return; }
    if (!streamRef.current) setAccess("asking");
    const videoConstraints: MediaTrackConstraints = nextVideo ? { deviceId: { exact: nextVideo } } : { width: { ideal: 1280 }, height: { ideal: 720 } };
    const audioConstraints: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, ...(nextAudio ? { deviceId: { exact: nextAudio } } : {}) };
    // Try camera + mic, then fall back to whichever device exists. A denied prompt is never retried.
    const attempts: MediaStreamConstraints[] = [{ video: videoConstraints, audio: audioConstraints }, { video: false, audio: audioConstraints }, { video: videoConstraints, audio: false }];
    let next: MediaStream | null = null, failure: unknown;
    for (const constraints of attempts) {
      try { next = await media.getUserMedia(constraints); break; }
      catch (error) { failure = error; if ((error as { name?: string })?.name === "NotAllowedError" || (error as { name?: string })?.name === "SecurityError") break; }
    }
    if (!mounted.current || generation !== request.current) { release(next); return; }
    if (!next) {
      const name = (failure as { name?: string })?.name;
      setAccess(name === "NotAllowedError" || name === "SecurityError" ? "blocked" : "missing");
      setProblem(streamingErrorMessage(failure));
      return;
    }
    release(streamRef.current);
    streamRef.current = next; setStream(next); setAccess("ready"); setProblem("");
    const cam = tracksOf(next, "video")[0], mic = tracksOf(next, "audio")[0];
    setVideoId(cam?.getSettings?.().deviceId || nextVideo); setAudioId(mic?.getSettings?.().deviceId || nextAudio);
    try { if (media.enumerateDevices) setDevices(await media.enumerateDevices()); } catch { /* Device names are optional. */ }
  }, [release]);

  // Opening "Go live" is the request to check devices: ask once, right away.
  useEffect(() => {
    const counter = request, held = streamRef;
    mounted.current = true;
    void acquire();
    return () => { mounted.current = false; counter.current++; release(held.current); held.current = null; };
  }, [acquire, release]);

  useEffect(() => {
    const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    if (!media?.addEventListener || !media.enumerateDevices) return;
    const refresh = () => { void media.enumerateDevices().then(list => { if (mounted.current) setDevices(list); }).catch(() => undefined); };
    media.addEventListener("devicechange", refresh);
    return () => media.removeEventListener("devicechange", refresh);
  }, []);

  useEffect(() => { if (video.current) video.current.srcObject = stream; }, [stream]);
  useEffect(() => { tracksOf(stream, "video").forEach(track => { track.enabled = camOn; }); }, [stream, camOn]);
  useEffect(() => { tracksOf(stream, "audio").forEach(track => { track.enabled = micOn; }); }, [stream, micOn]);

  // A live input meter so "is my mic working?" is answered before going live.
  useEffect(() => {
    const mic = tracksOf(stream, "audio")[0];
    const Context = typeof window === "undefined" ? undefined : (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!mic || !Context || typeof requestAnimationFrame === "undefined") return;
    let context: AudioContext | undefined, frame = 0;
    try {
      context = new Context();
      const analyser = context.createAnalyser(); analyser.fftSize = 512;
      context.createMediaStreamSource(new MediaStream([mic])).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        let peak = 0; for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128));
        const level = mic.enabled ? Math.min(1, peak / 64) : 0;
        meter.current?.style.setProperty("--level", level.toFixed(3));
        frame = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* The meter is a nicety; going live does not depend on it. */ }
    return () => { cancelAnimationFrame(frame); void context?.close().catch(() => undefined); };
  }, [stream]);

  const hasCam = tracksOf(stream, "video").length > 0, hasMic = tracksOf(stream, "audio").length > 0;
  const sendVideo = hasCam && camOn, sendAudio = hasMic && micOn;
  const choice: GoLiveChoice = { video: sendVideo, audio: sendAudio, videoDeviceId: sendVideo ? videoId : undefined, audioDeviceId: sendAudio ? audioId : undefined, saveReplay };
  const canStart = configured && access === "ready" && (sendVideo || sendAudio) && !busy && countdown === null;
  const cameras = devices.filter(device => device.kind === "videoinput" && device.deviceId);
  const mics = devices.filter(device => device.kind === "audioinput" && device.deviceId);
  const hint = !configured ? "Live video isn’t switched on for HYPR right now."
    : access === "asking" ? "Allow camera and microphone in your browser to see your preview."
    : access !== "ready" ? problem
    : !sendVideo && !sendAudio ? "Turn on your camera or mic to go live."
    : !sendVideo ? "You’ll go live with audio only."
    : !sendAudio ? "Your mic is off. Viewers will see you but not hear you."
    : "Looking good. Nobody can see this until you go live.";

  return <section className="golive" aria-label="Go live">
    <div className={`golive-stage${sendVideo ? " has-video" : ""}`}>
      {hasCam && <video ref={video} className="golive-video" autoPlay playsInline muted aria-label="Your camera preview, only visible to you" />}
      {!sendVideo && <div className="golive-avatar">
        <span className="golive-avatar-ring" ref={hasCam ? undefined : meter} style={{ "--level": 0 } as React.CSSProperties}><LiveIcon name={access === "ready" ? (sendAudio ? "mic" : "camOff") : "broadcast"} size={34} /></span>
        {access === "asking" && <strong>Waiting for camera & mic…</strong>}
        {access === "ready" && <strong>{hasCam ? "Camera off" : "Audio only"}</strong>}
        {(access === "blocked" || access === "missing" || access === "unsupported") && <><strong>{access === "blocked" ? "Camera and mic are blocked" : access === "missing" ? "No camera or mic found" : "This browser can’t go live"}</strong>
          <small>{access === "blocked" ? "Click the camera icon in your address bar, choose Allow, then try again." : problem}</small>
          {access !== "unsupported" && <button type="button" className="secondary-button" onClick={() => void acquire(videoId, audioId)}>Try again</button>}</>}
      </div>}
      <div className="golive-top">
        <span className="golive-chip"><span className="golive-chip-dot" aria-hidden="true" />Preview · only you</span>
        {showTitle && <span className="golive-chip is-show" title={showTitle}>{showTitle}</span>}
        <button type="button" className="golive-close" aria-label="Close go live" onClick={onClose} disabled={busy}><LiveIcon name="close" size={18} /></button>
      </div>
      {countdown !== null && <div className="golive-countdown" role="status" aria-live="assertive">
        <span>Going live in</span><strong key={countdown}>{countdown}</strong>
        <button type="button" className="secondary-button" onClick={onCancelCountdown}>Cancel</button>
      </div>}
      <div className="golive-deck">
        <div className="golive-toggles" role="group" aria-label="Devices">
          <button type="button" className={`golive-toggle${sendAudio ? "" : " is-off"}`} aria-pressed={sendAudio} aria-label={sendAudio ? "Turn microphone off" : "Turn microphone on"} disabled={!hasMic || countdown !== null} onClick={() => setMicOn(value => !value)}>
            <LiveIcon name={sendAudio ? "mic" : "micOff"} />{hasCam && <span className="golive-meter" ref={meter} style={{ "--level": 0 } as React.CSSProperties} aria-hidden="true" />}
          </button>
          <button type="button" className={`golive-toggle${sendVideo ? "" : " is-off"}`} aria-pressed={sendVideo} aria-label={sendVideo ? "Turn camera off" : "Turn camera on"} disabled={!hasCam || countdown !== null} onClick={() => setCamOn(value => !value)}><LiveIcon name={sendVideo ? "cam" : "camOff"} /></button>
          <button type="button" className="golive-toggle" aria-expanded={devicesOpen} aria-label="Choose camera and microphone" disabled={access !== "ready" || countdown !== null} onClick={() => setDevicesOpen(value => !value)}><LiveIcon name="gear" /></button>
        </div>
        <button type="button" className="golive-start" disabled={!canStart} onClick={() => onStart(choice)}>
          <span className="golive-start-dot" aria-hidden="true" />{busy ? "Confirm in your wallet…" : "Go live"}
        </button>
      </div>
      {devicesOpen && access === "ready" && <div className="golive-devices">
        {cameras.length > 0 && <label>Camera<select value={videoId || ""} onChange={event => void acquire(event.target.value, audioId)}>{cameras.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select></label>}
        {mics.length > 0 && <label>Microphone<select value={audioId || ""} onChange={event => void acquire(videoId, event.target.value)}>{mics.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select></label>}
        {!cameras.length && !mics.length && <p>Your browser hasn’t shared device names yet.</p>}
      </div>}
    </div>
    <div className="golive-options">
      <p className="golive-hint" role="status">{hint}</p>
      <button type="button" role="switch" aria-checked={saveReplay} className="golive-switch" disabled={busy || countdown !== null} onClick={() => setSaveReplay(value => !value)}>
        <span className="golive-switch-track" aria-hidden="true"><span /></span>Save a replay
      </button>
      <a className="golive-obs" href="#stream-from-obs" onClick={onClose}>Use OBS instead</a>
    </div>
    {saveReplay && <p className="golive-fine">Records up to 10 minutes as a private draft you can review before publishing. Turning this on confirms you have the rights to record what you broadcast. Keep this tab open until it uploads.</p>}
    {!saveReplay && <p className="golive-fine">Going live asks your wallet for a free signature to prove it’s your room. It isn’t a transaction.</p>}
    {notice && <p className="live-notice golive-notice" role="alert">{notice}</p>}
    {oneTimeAvailable && <div className="live-notice golive-notice"><p>HYPR sign-in is unavailable right now. You can still go live with a separate free signature{saveReplay ? ", but replays need sign-in, so turn off Save a replay first" : ""}.</p><button type="button" className="secondary-button" disabled={!canStart || saveReplay} onClick={() => onOneTime(choice)}>Go live with a one-time signature</button></div>}
  </section>;
}
