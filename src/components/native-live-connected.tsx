"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ControlBar, LiveKitRoom, ParticipantTile, RoomAudioRenderer, StartAudio, useConnectionState, useParticipants, useRoomContext, useTracks } from "@livekit/components-react";
import { ConnectionState, RoomEvent, Track, type Room } from "livekit-client";
import { decodeLiveSignal, encodeLiveSignal, LIVE_CHAT_PING_EVENT, LIVE_SIGNAL_SEND_EVENT, LIVE_SIGNAL_TOPIC, REACTIONS, SenderThrottle, sendLiveSignal, type LiveSignal } from "@/lib/live-signals";
import { streamingErrorMessage } from "@/lib/creator-access";
import { broadcastCopy, connectedBroadcastPhase, CREATOR_RETURN_GRACE_MS, shouldReleaseViewer, type BroadcastExit } from "@/lib/broadcast-lifecycle";
import { Modal } from "./modal";
import { analyticsAllowed, pilotEvent, ANALYTICS_PREFERENCE_EVENT } from "@/lib/pilot-analytics";
import { BROADCAST_ENDED_EVENT } from "@/lib/growth";

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

export type Session = { token: string; serverUrl: string; role: "host" | "viewer"; video?: boolean; audio?: boolean; roomId?: string; showTitle?: string };

function isHost(metadata?: string) {
  try { return JSON.parse(metadata || "{}").role === "host"; } catch { return false; }
}

type ExitAction = (reason: BroadcastExit, room: Room) => Promise<void>;

function BroadcastStage({ role, onExit, roomId, showTitle }: { role: Session["role"]; onExit: ExitAction; roomId?: string; showTitle?: string }) {
  const room = useRoomContext();
  const connection = useConnectionState();
  const participants = useParticipants();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare, Track.Source.Microphone, Track.Source.ScreenShareAudio], { onlySubscribed: true });
  const hostTracks = tracks.filter((track) => isHost(track.participant.metadata) && !track.publication.isMuted);
  const videos = hostTracks.filter((track) => track.source === Track.Source.Camera || track.source === Track.Source.ScreenShare);
  const hasMedia = hostTracks.length > 0;
  const hostPresent = participants.some((participant) => isHost(participant.metadata));
  const viewers = participants.filter((participant) => {
    try { return JSON.parse(participant.metadata || "{}").role === "viewer"; } catch { return false; }
  }).length;
  const [seenMedia, setSeenMedia] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const localConnection = connection === ConnectionState.Connected ? "connected" : connection === ConnectionState.Reconnecting || connection === ConnectionState.SignalReconnecting ? "reconnecting" : "connecting";
  const phase = connectedBroadcastPhase({ connection: localConnection, hostPresent, hasMedia, seenMedia });
  const copy = broadcastCopy(phase);
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
    if (role !== "viewer" || !roomId || !measurement || !playing || phase !== "live") return;
    if (!measured.current) { measured.current = true; void pilotEvent("stream_playback_started", roomId); }
    let previous = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now(), elapsed = Math.min(now - previous, 1200); previous = now;
      if (document.visibilityState !== "visible" || !analyticsAllowed()) return;
      seconds.current += elapsed;
      if (seconds.current >= 30000 && !threshold.current) { threshold.current = true; void pilotEvent("stream_watch_threshold_reached", roomId); }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [role, roomId, measurement, playing, phase]);

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
    try { await onExit("host-ended", room); }
    catch { setEnding(false); }
  }
  return <div onPlayingCapture={() => setPlaying(true)} onPauseCapture={() => setPlaying(false)} onWaitingCapture={() => setPlaying(false)}>
    <div className="native-live-toolbar" aria-live="polite">
      <span><span className={phase === "live" ? "pulse" : "status-dot inactive"} /> {phase === "live" ? `LIVE · ${viewers} viewer${viewers === 1 ? "" : "s"}` : copy.label}</span>
      {role === "host" && phase === "live" && <span className="studio-live-hud">You’re live · not recording{showTitle ? ` · ${showTitle}` : ""}</span>}
      <button type="button" className="live-control-button" onClick={() => {
        if (role === "host") setEndOpen(true);
        else void onExit("viewer-left", room).catch(() => undefined);
      }}>{role === "host" ? "End broadcast" : "Leave live"}</button>
    </div>
    <div className="hypr-broadcast-stage">
      {phase === "live" && videos.length ? videos.map((track) => <ParticipantTile key={track.publication.trackSid} trackRef={track} />) : <div className="native-live-placeholder"><div className="native-live-mark"><span aria-hidden="true">H</span><strong>{phase === "live" ? "Audio broadcast" : copy.title}</strong><small>{phase === "live" ? "The creator is sharing audio. Video is off." : copy.detail}</small></div></div>}
      <LiveReactions roomId={roomId} live={phase === "live"} />
    </div>
    {role === "host" ? <ControlBar controls={{ microphone: true, camera: true, screenShare: true, chat: false, leave: false }} saveUserChoices={false} /> : <p className="accounting-copy">You’re watching only. Your camera and microphone are never requested.</p>}
    <StartAudio label="Tap to hear the broadcast" />
    <RoomAudioRenderer />
    {role === "host" && endOpen && <Modal title="End this broadcast?" onClose={() => { if (!ending) setEndOpen(false); }}>
      <p className="dialog-copy">This stops your camera, microphone and screen share for this session. It does not close your community room or change the token.</p>
      <p className="dialog-copy">The same link, saved chat and follows remain. You can start another broadcast here later. HYPR does not save a video replay.</p>
      <div className="dialog-actions"><button type="button" className="secondary-button" disabled={ending} onClick={() => setEndOpen(false)}>Keep broadcasting</button><button type="button" className="primary-button" disabled={ending} onClick={() => void endBroadcast()}>{ending ? "Stopping your devices…" : "End broadcast now"}</button></div>
    </Modal>}
  </div>;
}

export function ConnectedRoom({ session, onLeave, onError, connect = true, room }: {
  session: Session; onLeave: (reason: BroadcastExit) => void; onError: (message: string) => void; connect?: boolean; room?: Room;
}) {
  const [failed, setFailed] = useState(false);
  const left = useRef(false);
  const requestedExit = useRef<BroadcastExit | null>(null);
  const disconnecting = useRef(false);
  const finish = useCallback((reason: BroadcastExit) => {
    if (left.current) return;
    left.current = true; onLeave(reason);
    if (reason === "host-ended" && session.role === "host" && session.roomId) window.dispatchEvent(new CustomEvent(BROADCAST_ENDED_EVENT, { detail: { roomId:session.roomId } }));
  }, [onLeave, session.role, session.roomId]);
  const exit = useCallback(async (reason: BroadcastExit, activeRoom: Room) => {
    if (left.current || disconnecting.current) return;
    disconnecting.current = true; requestedExit.current = reason;
    try {
      // true explicitly stops local camera, microphone and screen-sharing tracks.
      await activeRoom.disconnect(true);
      finish(reason);
    } catch (error) {
      requestedExit.current = null; disconnecting.current = false;
      onError(`Could not close the live player. ${streamingErrorMessage(error)}`);
      throw error;
    }
  }, [finish, onError]);
  const connected = useCallback(() => { setFailed(false); onError(""); }, [onError]);
  const failedConnection = useCallback((error: Error) => { setFailed(true); onError(streamingErrorMessage(error)); }, [onError]);
  const deviceFailure = useCallback(() => onError("Camera or microphone unavailable. Allow access in your browser, then use the studio controls to retry. You are not live until a track is publishing."), [onError]);
  const disconnected = useCallback(() => finish(requestedExit.current || "connection-lost"), [finish]);
  return <div className="native-live-connected" data-lk-theme="default">
    <LiveKitRoom room={room} token={session.token} serverUrl={session.serverUrl} connect={connect} video={session.role === "host" && session.video === true} audio={session.role === "host" && session.audio === true}
      onConnected={connected} onError={failedConnection} onMediaDeviceFailure={deviceFailure} onDisconnected={disconnected}>
      <BroadcastStage role={session.role} roomId={session.roomId} showTitle={session.showTitle} onExit={exit} />
      {failed && <button type="button" className="secondary-button" onClick={() => finish("connection-lost")}>Return to room and retry</button>}
    </LiveKitRoom>
  </div>;
}
