"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ControlBar, LiveKitRoom, ParticipantTile, StartAudio, useConnectionState, useParticipants, useRoomContext, useTracks } from "@livekit/components-react";
import { ConnectionState, DisconnectReason, RoomEvent, Track, type Room } from "livekit-client";
import { decodeLiveSignal, encodeLiveSignal, LIVE_CHAT_PING_EVENT, LIVE_SIGNAL_SEND_EVENT, LIVE_SIGNAL_TOPIC, REACTIONS, SenderThrottle, sendLiveSignal, type LiveSignal } from "@/lib/live-signals";
import { streamingErrorMessage } from "@/lib/creator-access";
import { broadcastCopy, connectedBroadcastPhase, CREATOR_RETURN_GRACE_MS, shouldReleaseViewer, type BroadcastExit } from "@/lib/broadcast-lifecycle";
import { Modal } from "./modal";
import { analyticsAllowed, pilotEvent, ANALYTICS_PREFERENCE_EVENT } from "@/lib/pilot-analytics";
import { BROADCAST_ENDED_EVENT } from "@/lib/growth";
import { MediaCaptureControls } from "./media-capture-controls";
import { LiveGuestControls } from "./live-guest-controls";
import { guestMetadata, isApprovedGuest } from "@/lib/live-guests";
import { signInCommunity } from "@/lib/community-client";
import { shortAddress } from "@/lib/wallet";
import { LivePlaybackAudio, LivePlaybackControls, useViewerPlayback } from "./live-playback-controls";
import { MobileMiniPlayer, useMobileMiniPlayer } from "./mobile-mini-player";

type Floating = { id: number; reaction: number; x: number; mine: boolean };

function LiveReactions({ roomId, live }: { roomId?: string; live: boolean }) {
  const room = useRoomContext();
  const [floating, setFloating] = useState<Floating[]>([]);
  const nextId = useRef(0);
  const remote = useRef(new SenderThrottle(5, 3000));
  const local = useRef(new SenderThrottle(8, 3000));
  const show = useCallback((reaction: number, mine: boolean) => {
    const id = nextId.current++;
    setFloating(current => [...current.slice(-39), { id, reaction, mine, x: 8 + Math.random() * 84 }]);
    window.setTimeout(() => setFloating(current => current.filter(item => item.id !== id)), 2600);
  }, []);
  useEffect(() => {
    function received(payload: Uint8Array, participant?: { identity: string }, _kind?: unknown, topic?: string) {
      if (topic !== LIVE_SIGNAL_TOPIC) return;
      const signal = decodeLiveSignal(payload);
      if (!signal || !remote.current.allow(participant?.identity || "unknown")) return;
      if (signal.type === "chat") { if (roomId) window.dispatchEvent(new CustomEvent(LIVE_CHAT_PING_EVENT, { detail: { roomId: roomId.toLowerCase() } })); return; }
      show(signal.reaction, false);
    }
    room.on(RoomEvent.DataReceived, received);
    return () => { room.off(RoomEvent.DataReceived, received); };
  }, [room, roomId, show]);
  useEffect(() => {
    if (!roomId) return;
    function send(event: Event) {
      const detail = (event as CustomEvent<{ roomId: string; signal: LiveSignal }>).detail;
      if (detail?.roomId !== roomId!.toLowerCase() || room.state !== ConnectionState.Connected) return;
      void room.localParticipant.publishData(encodeLiveSignal(detail.signal), { reliable: detail.signal.type === "chat", topic: LIVE_SIGNAL_TOPIC }).catch(() => undefined);
    }
    window.addEventListener(LIVE_SIGNAL_SEND_EVENT, send);
    return () => window.removeEventListener(LIVE_SIGNAL_SEND_EVENT, send);
  }, [room, roomId]);
  function react(reaction: number) {
    if (!roomId || !local.current.allow("me")) return;
    show(reaction, true);
    sendLiveSignal(roomId, { type: "react", reaction });
  }
  return <>
    <div className="live-reactions-layer" aria-hidden="true">{floating.map(item => <span key={item.id} className={item.mine ? "is-mine" : ""} style={{ left: `${item.x}%` }}>{REACTIONS[item.reaction]}</span>)}</div>
    {live && roomId && <div className="live-reaction-bar" role="group" aria-label="Send a reaction">{REACTIONS.map((emoji, index) => <button key={emoji} type="button" aria-label={`Send ${emoji} reaction`} onClick={() => react(index)}>{emoji}</button>)}</div>}
  </>;
}

export type Session = { token: string; serverUrl: string; role: "host" | "viewer"; video?: boolean; audio?: boolean; roomId?: string; showTitle?: string; recordReplay?: boolean; authenticated?: boolean; autoRequest?: boolean };

function isHost(metadata?: string) {
  try { return JSON.parse(metadata || "{}").role === "host"; } catch { return false; }
}

type ExitAction = (reason: BroadcastExit, room: Room) => Promise<void>;

function BroadcastStage({ session, onExit, onSignInAndRequest }: { session: Session; onExit: ExitAction; onSignInAndRequest: (room: Room) => Promise<void> }) {
  const { role, roomId, showTitle, recordReplay } = session;
  const room = useRoomContext();
  const connection = useConnectionState();
  const playback = useViewerPlayback(room, role === "viewer");
  const viewerPaused = role === "viewer" && playback.paused;
  const participants = useParticipants();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare, Track.Source.Microphone, Track.Source.ScreenShareAudio], { onlySubscribed: true });
  const hostTracks = tracks.filter((track) => isHost(track.participant.metadata) && !track.publication.isMuted);
  const videos = hostTracks.filter((track) => track.source === Track.Source.Camera || track.source === Track.Source.ScreenShare);
  const primaryVideo = videos.find(track => track.source === Track.Source.ScreenShare) || videos[0];
  const creatorCamera = primaryVideo?.source === Track.Source.ScreenShare ? videos.find(track => track.source === Track.Source.Camera) : undefined;
  const hasMedia = hostTracks.length > 0;
  const host = participants.find((participant) => isHost(participant.metadata));
  const hostPresent = Boolean(host), hostSid = host?.sid;
  const guestTracks = tracks.filter(track => isApprovedGuest(track.participant.metadata, hostSid) && !track.publication.isMuted);
  const guestVideos = guestTracks.filter(track => track.source === Track.Source.Camera);
  const approvedGuests = participants.filter(participant => isApprovedGuest(participant.metadata, hostSid));
  const localGuestOnStage = role === "viewer" && isApprovedGuest(room.localParticipant.metadata, hostSid);
  const audioTracks = [...hostTracks, ...guestTracks].filter(track => !track.participant.isLocal && (track.source === Track.Source.Microphone || track.source === Track.Source.ScreenShareAudio));
  const viewers = participants.filter((participant) => {
    try { return JSON.parse(participant.metadata || "{}").role === "viewer"; } catch { return false; }
  }).length;
  const [seenMedia, setSeenMedia] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [recording, setRecording] = useState(false);
  const stopCapture = useRef<(() => Promise<void>) | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const registerStop = useCallback((stop: (() => Promise<void>) | null) => { stopCapture.current = stop; }, []);
  const recordingVideo = primaryVideo;
  const recordingTracks = [recordingVideo, ...hostTracks.filter(track => track.source === Track.Source.Microphone || track.source === Track.Source.ScreenShareAudio)].flatMap(track => track?.publication.track?.mediaStreamTrack ? [track.publication.track.mediaStreamTrack] : []);
  const localConnection = connection === ConnectionState.Connected ? "connected" : connection === ConnectionState.Reconnecting || connection === ConnectionState.SignalReconnecting ? "reconnecting" : "connecting";
  const phase = connectedBroadcastPhase({ connection: localConnection, hostPresent, hasMedia, seenMedia });
  const copy = broadcastCopy(phase);
  const miniPlayer = useMobileMiniPlayer(stageRef, role === "viewer" && (phase === "live" || seenMedia));
  const viewerPlayback = { ...playback, togglePause: () => { if (!playback.paused && recording) void stopCapture.current?.(); playback.togglePause(); } };
  const [playing, setPlaying] = useState(false);
  const [measurement, setMeasurement] = useState(false);
  const measured = useRef(false), seconds = useRef(0), threshold = useRef(false);
  useEffect(() => {
    const choice = () => setMeasurement(analyticsAllowed());
    choice(); window.addEventListener(ANALYTICS_PREFERENCE_EVENT, choice);
    return () => window.removeEventListener(ANALYTICS_PREFERENCE_EVENT, choice);
  }, []);
  useEffect(() => {
    if (!measurement) { measured.current = false; seconds.current = 0; threshold.current = false; }
    if (role !== "viewer" || !roomId || !measurement || !playing || phase !== "live" || viewerPaused) return;
    if (!measured.current) { measured.current = true; void pilotEvent("stream_playback_started", roomId); }
    let previous = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now(), elapsed = Math.min(now - previous, 1200); previous = now;
      if (document.visibilityState !== "visible" || !analyticsAllowed()) return;
      seconds.current += elapsed;
      if (seconds.current >= 30000 && !threshold.current) { threshold.current = true; void pilotEvent("stream_watch_threshold_reached", roomId); }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [role, roomId, measurement, playing, phase, viewerPaused]);

  useEffect(() => { if (hasMedia) setSeenMedia(true); }, [hasMedia]);
  useEffect(() => {
    if (!shouldReleaseViewer(role, localConnection, hostPresent)) return;
    // Give an interrupted creator time to return; never drop the persistent chat.
    const timeout = window.setTimeout(() => { void onExit("creator-offline", room).catch(() => undefined); }, CREATOR_RETURN_GRACE_MS);
    return () => window.clearTimeout(timeout);
  }, [role, localConnection, hostPresent, room, onExit]);

  async function endBroadcast() {
    if (ending) return;
    setEnding(true);
    try { await stopCapture.current?.(); await onExit("host-ended", room); }
    catch { setEnding(false); }
  }
  return <><div onPlayingCapture={() => setPlaying(true)} onPauseCapture={() => setPlaying(false)} onWaitingCapture={() => setPlaying(false)}>
    <div className="native-live-toolbar" aria-live="polite">
      <span><span className={phase === "live" ? "pulse" : "status-dot inactive"} /> {phase === "live" ? `LIVE · ${viewers} viewer${viewers === 1 ? "" : "s"}` : copy.label}</span>
      {role === "host" && phase === "live" && <span className="studio-live-hud">You’re live · {recording ? "recording a private draft" : "live only"}{showTitle ? ` · ${showTitle}` : ""}</span>}
      <button type="button" className="live-control-button" onClick={() => {
        if (role === "host") setEndOpen(true);
        else void (async () => { await stopCapture.current?.(); await onExit("viewer-left", room); })().catch(() => undefined);
      }}>{role === "host" ? "End broadcast" : "Leave live"}</button>
    </div>
    <div ref={stageRef} tabIndex={-1} role="group" aria-label="Live broadcast" className={`hypr-broadcast-stage${phase === "live" && !viewerPaused && approvedGuests.length ? " has-guests" : ""}`}>
      {phase === "live" && !viewerPaused && primaryVideo ? <div className="live-stage-host"><ParticipantTile trackRef={primaryVideo} />{creatorCamera && <div className="live-stage-pip" aria-label="Creator camera"><ParticipantTile trackRef={creatorCamera} /></div>}</div> : <div className="native-live-placeholder live-stage-host"><div className="native-live-mark"><span aria-hidden="true">H</span><strong>{viewerPaused && phase === "live" ? "Playback paused" : phase === "live" ? "Audio broadcast" : copy.title}</strong><small>{viewerPaused && phase === "live" ? "The show continues. Resume jumps back to live; the missed part is not saved here." : phase === "live" ? "The creator is sharing audio. Video is off." : copy.detail}</small></div></div>}
      {phase === "live" && !viewerPaused && approvedGuests.length > 0 && <div className="live-stage-guests" data-many={approvedGuests.length > 1} aria-label="Guests on stage">{approvedGuests.map(participant => {
        const video = guestVideos.find(track => track.participant.identity === participant.identity), info = guestMetadata(participant.metadata);
        return <div className="live-stage-guest" key={participant.sid}>{video ? <ParticipantTile trackRef={video} /> : <div className="live-stage-audio"><span aria-hidden="true">✦</span><strong>{info ? shortAddress(info.wallet) : "Guest"}</strong><small>Guest on stage · camera off</small></div>}</div>;
      })}</div>}
      <LiveReactions roomId={roomId} live={phase === "live" && !viewerPaused} />
    </div>
    {role === "viewer" && <LivePlaybackControls playback={viewerPlayback} live={phase === "live"} miniPlayer={miniPlayer} />}
    {viewerPaused && localGuestOnStage && <p className="live-notice" role="status">Your playback is paused, but you are still on stage. Your camera and microphone stay as you set them.</p>}
    {role === "host" ? <ControlBar controls={{ microphone: true, camera: true, screenShare: true, chat: false, leave: false }} saveUserChoices={false} /> : <p className="live-viewing-note">Watching is free. Your camera and microphone stay off until you choose to share.</p>}
    {(role === "host" || (!playback.muted && !viewerPaused && playback.volume > 0)) && <StartAudio label="Tap to hear the broadcast" />}
    {phase === "live" && <div style={{ display: "none" }}>{audioTracks.map(track => <LivePlaybackAudio key={`${track.participant.identity}-${track.publication.trackSid}`} trackRef={track} volume={role === "viewer" ? playback.volume : undefined} muted={role === "viewer" && (playback.muted || viewerPaused || playback.volume === 0)} />)}</div>}
    {roomId && <LiveGuestControls roomId={roomId} role={role} live={phase === "live"} hostSid={hostSid} authenticated={session.authenticated} autoRequest={session.autoRequest} onSignInAndRequest={() => onSignInAndRequest(room)} onWalletChange={() => onExit("wallet-changed", room)} />}
    {roomId && <MediaCaptureControls roomId={roomId} host={role === "host"} tracks={recordingTracks} registerStop={registerStop} onRecordingChange={setRecording} autoRecord={recordReplay === true && role === "host"} />}
    {role === "host" && endOpen && <Modal title="End this broadcast?" onClose={() => { if (!ending) setEndOpen(false); }}>
      <p className="dialog-copy">This stops your camera, microphone and screen share for this session. It does not close your community room or change the token.</p>
      <p className="dialog-copy">The same link, saved chat and follows remain. If you started recording, it will finish as a private draft. Keep HYPR open until its upload completes; nothing is published without your review.</p>
      <div className="dialog-actions"><button type="button" className="secondary-button" disabled={ending} onClick={() => setEndOpen(false)}>Keep broadcasting</button><button type="button" className="primary-button" disabled={ending} onClick={() => void endBroadcast()}>{ending ? "Stopping your devices…" : "End broadcast now"}</button></div>
    </Modal>}
  </div>{miniPlayer.visible && typeof document !== "undefined" && createPortal(<MobileMiniPlayer playback={viewerPlayback} live={phase === "live"} status={copy.title} onStage={localGuestOnStage} primaryVideo={primaryVideo} creatorCamera={creatorCamera} guests={approvedGuests.map(participant => ({ id: participant.sid, video: guestVideos.find(track => track.participant.identity === participant.identity) }))} onReturn={() => { document.querySelector("#room-watch")?.scrollIntoView({ behavior: "instant", block: "start" }); stageRef.current?.focus({ preventScroll: true }); }} onClose={() => { miniPlayer.setEnabled(false); document.querySelector<HTMLButtonElement>('.room-section-nav button[aria-pressed="true"]')?.focus({ preventScroll: true }); }} />, document.body)}</>;
}

export function ConnectedRoom({ session, onLeave, onError, onSessionChange, connect = true, room }: {
  session: Session; onLeave: (reason: BroadcastExit) => void; onError: (message: string) => void; onSessionChange?: (next: Session) => void; connect?: boolean; room?: Room;
}) {
  const [failed, setFailed] = useState(false);
  const left = useRef(false);
  const requestedExit = useRef<BroadcastExit | null>(null);
  const disconnecting = useRef(false);
  const upgrading = useRef(false);
  const finish = useCallback((reason: BroadcastExit) => {
    if (left.current) return;
    left.current = true; onLeave(reason);
    if (reason === "host-ended" && session.role === "host" && session.roomId) window.dispatchEvent(new CustomEvent(BROADCAST_ENDED_EVENT, { detail: { roomId:session.roomId } }));
  }, [onLeave, session.role, session.roomId]);
  const exit = useCallback(async (reason: BroadcastExit, activeRoom: Room) => {
    if (left.current || disconnecting.current) return;
    disconnecting.current = true; requestedExit.current = reason;
    try {
      let closeFailed = false;
      if (reason === "host-ended" && session.roomId && activeRoom.localParticipant.sid) {
        // Stop the creator's devices before waiting on the remote room service.
        await Promise.allSettled(activeRoom.localParticipant.getTrackPublications().flatMap(publication => publication.track ? [activeRoom.localParticipant.unpublishTrack(publication.track.mediaStreamTrack, true)] : []));
        try {
          const response = await fetch("/api/live/guests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "close", roomId: session.roomId, hostSid: activeRoom.localParticipant.sid }), signal: AbortSignal.timeout(8000) });
          const result = await response.json().catch(() => ({})) as { revocationIncomplete?: boolean };
          if (!response.ok || result.revocationIncomplete) closeFailed = true;
        } catch { closeFailed = true; }
      }
      // true explicitly stops local camera, microphone and screen-sharing tracks.
      await activeRoom.disconnect(true);
      finish(reason);
      if (closeFailed) onError("Your devices stopped, but HYPR could not immediately close every guest connection. Ask guests to leave the stage and check the room.");
    } catch (error) {
      requestedExit.current = null; disconnecting.current = false;
      onError(`Could not close the live player. ${streamingErrorMessage(error)}`);
      throw error;
    }
  }, [finish, onError, session.roomId]);
  const signInAndRequest = useCallback(async (activeRoom: Room) => {
    if (session.role !== "viewer" || !session.roomId || !onSessionChange) throw new Error("Reopen the live player to request a spot.");
    await signInCommunity();
    const response = await fetch("/api/community/live-guests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "viewer-token", roomId: session.roomId }), signal: AbortSignal.timeout(12000) });
    const data = await response.json() as Session & { error?: string };
    if (!response.ok) throw new Error(data.error || "Could not join with your wallet. Try again.");
    upgrading.current = true;
    try {
      await activeRoom.disconnect(true);
      onSessionChange({ ...data, roomId: session.roomId, showTitle: session.showTitle, autoRequest: true });
    } catch (error) { upgrading.current = false; throw error; }
  }, [session.role, session.roomId, session.showTitle, onSessionChange]);
  const connected = useCallback(() => { setFailed(false); onError(""); }, [onError]);
  const failedConnection = useCallback((error: Error) => { setFailed(true); onError(streamingErrorMessage(error)); }, [onError]);
  const deviceFailure = useCallback(() => onError("Camera or microphone unavailable. Allow access in your browser, then use the studio controls to retry. You are not live until a track is publishing."), [onError]);
  const disconnected = useCallback((reason?: DisconnectReason) => {
    if (!upgrading.current) finish(requestedExit.current || (reason === DisconnectReason.ROOM_DELETED ? "session-ended" : reason === DisconnectReason.PARTICIPANT_REMOVED && session.role === "viewer" ? "guest-removed" : "connection-lost"));
  }, [finish, session.role]);
  return <div className="native-live-connected" data-lk-theme="default">
    <LiveKitRoom room={room} token={session.token} serverUrl={session.serverUrl} connect={connect} video={session.role === "host" && session.video === true} audio={session.role === "host" && session.audio === true}
      onConnected={connected} onError={failedConnection} onMediaDeviceFailure={deviceFailure} onDisconnected={disconnected}>
      <BroadcastStage session={session} onExit={exit} onSignInAndRequest={signInAndRequest} />
      {failed && <button type="button" className="secondary-button" onClick={() => finish("connection-lost")}>Return to room and retry</button>}
    </LiveKitRoom>
  </div>;
}
