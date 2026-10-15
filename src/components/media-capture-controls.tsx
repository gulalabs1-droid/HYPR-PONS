"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { MEDIA_LIMITS, MEDIA_UPDATED_EVENT, mediaDuration, type MediaKind, type MediaReservation } from "@/lib/media";
import { recordPublishedStream, recordingMime } from "@/lib/browser-recording";
import { authorizeMedia, mediaAction } from "@/lib/media-client";
import { useMediaLibrary } from "@/lib/use-media-library";
import { useMediaUploads } from "./media-upload-provider";

async function combineTracks(tracks: MediaStreamTrack[]) {
  const video = tracks.find(track => track.kind === "video"), audio = tracks.filter(track => track.kind === "audio");
  const stream = new MediaStream(video ? [video] : []);
  let context: AudioContext | null = null, mixed: MediaStreamTrack | undefined;
  if (audio.length > 1) {
    context = new AudioContext(); await context.resume();
    const destination = context.createMediaStreamDestination();
    audio.forEach(track => context!.createMediaStreamSource(new MediaStream([track])).connect(destination));
    mixed = destination.stream.getAudioTracks()[0]; stream.addTrack(mixed);
  } else if (audio[0]) stream.addTrack(audio[0]);
  return { stream, cleanup: () => { mixed?.stop(); void context?.close(); } };
}

export function MediaCaptureControls({ roomId, host, tracks, registerStop, onRecordingChange, autoRecord = false }: {
  roomId: string; host: boolean; tracks: MediaStreamTrack[];
  registerStop: (stop: (() => Promise<void>) | null) => void; onRecordingChange: (active: boolean) => void;
  autoRecord?: boolean;
}) {
  const library = useMediaLibrary(roomId), uploads = useMediaUploads();
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [recording, setRecording] = useState<MediaKind | null>(null);
  const [consent, setConsent] = useState(autoRecord), [title, setTitle] = useState(""), [seconds, setSeconds] = useState(0), [notice, setNotice] = useState("");
  const autoAttempted = useRef(false);
  const capture = useRef<ReturnType<typeof recordPublishedStream> | null>(null), mounted = useRef(true), currentTracks = useRef(tracks), sourceKey = useRef(""); currentTracks.current = tracks;
  const requestGeneration = useRef(0);
  const fingerprint = tracks.map(track => track.id).sort().join(":");
  useEffect(() => { setReady(typeof MediaRecorder !== "undefined" && typeof MediaStream !== "undefined"); }, []);
  const stop = useCallback(async () => { await capture.current?.stop().catch(() => undefined); }, []);
  useEffect(() => { registerStop(stop); return () => registerStop(null); }, [registerStop, stop]);
  useEffect(() => {
    const counter = requestGeneration;
    mounted.current = true;
    return () => { mounted.current = false; counter.current++; void capture.current?.stop().catch(() => undefined); };
  }, []);
  useEffect(() => {
    if (capture.current && fingerprint !== sourceKey.current) { setNotice("Published media changed. This recording is finishing; start another to capture the new scene."); void stop(); }
  }, [fingerprint, stop]);
  useEffect(() => { if (recording === "clip" && library.state && !library.state.clipsAllowed) { setNotice("The creator turned clipping off. Finishing this local capture; it cannot be published without creator permission."); void stop(); } }, [recording, library.state, stop]);

  const begin = useCallback(async (kind: MediaKind, alreadyAuthorized = false) => {
    if (busy || capture.current || !consent || !uploads.canAccept) return;
    setBusy(true); setNotice("");
    const generation = requestGeneration.current;
    const stillHere = () => { if (!mounted.current || requestGeneration.current !== generation) throw new Error("You left the player before recording started. No media was captured."); };
    let cleanup = () => {};
    try {
      if (!recordingMime(currentTracks.current.some(track => track.kind === "video"))) throw new Error("This browser cannot record this broadcast. Watching is still available.");
      if (!alreadyAuthorized) await authorizeMedia();
      stillHere();
      const selected = currentTracks.current.filter(track => track.readyState === "live");
      if (!selected.length) throw new Error("Wait for creator media before recording.");
      const mime = recordingMime(selected.some(track => track.kind === "video"))!;
      const reservation = await mediaAction(roomId, "reserve", { kind, title: title.trim() || `${kind === "replay" ? "Replay" : "Clip"} · ${new Date().toLocaleDateString()}`, mime, consent: true }) as MediaReservation;
      stillHere();
      const combined = await combineTracks(selected); cleanup = combined.cleanup;
      stillHere();
      const recorder = recordPublishedStream(combined.stream, kind, { onState: elapsed => { if (mounted.current) setSeconds(elapsed); } });
      sourceKey.current = selected.map(track => track.id).sort().join(":"); capture.current = recorder;
      setRecording(kind); setSeconds(0); onRecordingChange(true); uploads.capturing(true);
      void recorder.result.then(media => { uploads.enqueue(roomId, reservation, media); if (mounted.current) setNotice("Recording finished. Uploading a private draft—keep HYPR open. The creator reviews it before publishing."); })
        .catch((failure: unknown) => { if (mounted.current) setNotice(failure instanceof Error ? failure.message : "Recording failed. Nothing was published."); })
        .finally(() => { combined.cleanup(); capture.current = null; uploads.capturing(false); onRecordingChange(false); if (mounted.current) { setRecording(null); setBusy(false); setConsent(false); } });
    } catch (failure) { cleanup(); if (mounted.current) { setBusy(false); setNotice(failure instanceof Error ? failure.message : "Recording could not start."); } }
  }, [busy, consent, uploads, title, roomId, onRecordingChange]);
  useEffect(() => {
    if (!autoRecord || autoAttempted.current || !ready || !library.state?.enabled || !library.state.live || !tracks.length || !uploads.canAccept) return;
    autoAttempted.current = true; void begin("replay", true);
  }, [autoRecord, ready, library.state, tracks.length, uploads.canAccept, begin]);
  async function clipping(allowClips: boolean) {
    setBusy(true); setNotice("");
    try { await authorizeMedia(); await mediaAction(roomId, "policy", { allowClips }); window.dispatchEvent(new Event(MEDIA_UPDATED_EVENT)); await library.refresh(); }
    catch (failure) { setNotice(failure instanceof Error ? failure.message : "Clipping permission could not be saved."); }
    finally { setBusy(false); }
  }
  if (!uploads.available) return null;
  return <section className="media-capture" aria-label="Broadcast recording controls">
    <div><span className="eyebrow">{host ? "KEEP THE MOMENT" : "CLIP THIS BROADCAST"}</span><h3>{recording ? `Recording ${recording} · ${mediaDuration(seconds)}` : host ? "A replay your audience can return to." : "Capture the next 30 seconds."}</h3></div>
    {host && <label className="media-consent"><input type="checkbox" checked={library.state?.clipsAllowed || false} disabled={busy || !library.state?.live} onChange={event => void clipping(event.target.checked)} /> Allow viewers to record clips of this broadcast for your review.</label>}
    {host && <p className="accounting-copy">Off by default for each new broadcast. Turning it off also hides published viewer clips in this room. Previously downloaded copies cannot be recalled.</p>}
    {!host && !library.state?.clipsAllowed ? <p className="accounting-copy">The creator hasn’t enabled clipping for this broadcast. No recording is started.</p> : <>
      {!recording && <><label className="media-title">{host ? "Replay or clip title" : "Clip title"}<input value={title} maxLength={80} onChange={event => setTitle(event.target.value)} placeholder={host ? "Give this recording a name" : "What’s the moment?"} disabled={busy} /></label>
        <label className="media-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} />{host ? "I own or have permission to record this published media and upload it as a private draft." : "I have permission to capture this creator’s published media and submit a private draft for their review."}</label></>}
      <div className="media-actions">{recording ? <button className="secondary-button" type="button" onClick={() => void stop()}>Stop recording & save draft</button> : <>
        {host && <button className="secondary-button" type="button" disabled={!ready || busy || !consent || !tracks.length || !uploads.canAccept || !library.state?.enabled} onClick={() => void begin("replay")}>{busy ? "Preparing…" : "Record replay · up to 10 min"}</button>}
        {library.state?.clipsAllowed && <button className="secondary-button" type="button" disabled={!ready || busy || !consent || !tracks.length || !uploads.canAccept} onClick={() => void begin("clip")}>{busy ? "Preparing…" : "Record next 30 seconds"}</button>}
      </>}</div>
      <p className="accounting-copy">{recording ? `Stops automatically at ${MEDIA_LIMITS[recording].seconds / 60 >= 1 ? `${MEDIA_LIMITS[recording].seconds / 60} minutes` : "30 seconds"}, if media changes, or when you leave live.` : "Browser recording · not a cloud DVR. Replays: 10 min / 40 MB. Clips: 30 sec / 8 MB. Your broadcast can continue after recording ends."} Saving a draft requires free wallet sign-in, not a transaction. Keep this tab open until upload finishes. This does not record chat or any viewer’s devices.</p>
    </>}
    {!ready && <p className="accounting-copy">Recording is unavailable in this browser. You can still watch broadcasts and supported replays.</p>}
    {library.error && <p className="live-notice" role="status">{library.error}</p>}
    {notice && <p className="live-notice" role="status">{notice}</p>}
  </section>;
}
