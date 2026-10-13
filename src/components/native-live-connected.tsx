"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ControlBar, LiveKitRoom, ParticipantTile, RoomAudioRenderer, StartAudio, useConnectionState, useParticipants, useRoomContext, useTracks } from "@livekit/components-react";
import { ConnectionState, Track, type Room } from "livekit-client";
import { streamingErrorMessage } from "@/lib/creator-access";
import { broadcastCopy, connectedBroadcastPhase, CREATOR_RETURN_GRACE_MS, shouldReleaseViewer, type BroadcastExit } from "@/lib/broadcast-lifecycle";
import { Modal } from "./modal";

export type Session = { token: string; serverUrl: string; role: "host" | "viewer"; video?: boolean; audio?: boolean };

function isHost(metadata?: string) {
  try { return JSON.parse(metadata || "{}").role === "host"; } catch { return false; }
}

type ExitAction = (reason: BroadcastExit, room: Room) => Promise<void>;

function BroadcastStage({ role, onExit }: { role: Session["role"]; onExit: ExitAction }) {
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
  return <>
    <div className="native-live-toolbar" aria-live="polite">
      <span><span className={phase === "live" ? "pulse" : "status-dot inactive"} /> {phase === "live" ? `LIVE · ${viewers} viewer${viewers === 1 ? "" : "s"}` : copy.label}</span>
      <button type="button" className="live-control-button" onClick={() => {
        if (role === "host") setEndOpen(true);
        else void onExit("viewer-left", room).catch(() => undefined);
      }}>{role === "host" ? "End broadcast" : "Leave live"}</button>
    </div>
    <div className="hypr-broadcast-stage">
      {phase === "live" && videos.length ? videos.map((track) => <ParticipantTile key={track.publication.trackSid} trackRef={track} />) : <div className="native-live-placeholder"><div className="native-live-mark"><span aria-hidden="true">H</span><strong>{phase === "live" ? "Audio broadcast" : copy.title}</strong><small>{phase === "live" ? "The creator is sharing audio. Video is off." : copy.detail}</small></div></div>}
    </div>
    {role === "host" ? <ControlBar controls={{ microphone: true, camera: true, screenShare: true, chat: false, leave: false }} saveUserChoices={false} /> : <p className="accounting-copy">You’re watching only. Your camera and microphone are never requested.</p>}
    <StartAudio label="Tap to hear the broadcast" />
    <RoomAudioRenderer />
    {role === "host" && endOpen && <Modal title="End this broadcast?" onClose={() => { if (!ending) setEndOpen(false); }}>
      <p className="dialog-copy">This stops your camera, microphone and screen share for this session. It does not close your community room or change the token.</p>
      <p className="dialog-copy">The same link, saved chat and follows remain. You can start another broadcast here later. HYPR does not save a video replay.</p>
      <div className="dialog-actions"><button type="button" className="secondary-button" disabled={ending} onClick={() => setEndOpen(false)}>Keep broadcasting</button><button type="button" className="primary-button" disabled={ending} onClick={() => void endBroadcast()}>{ending ? "Stopping your devices…" : "End broadcast now"}</button></div>
    </Modal>}
  </>;
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
  }, [onLeave]);
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
      <BroadcastStage role={session.role} onExit={exit} />
      {failed && <button type="button" className="secondary-button" onClick={() => finish("connection-lost")}>Return to room and retry</button>}
    </LiveKitRoom>
  </div>;
}
