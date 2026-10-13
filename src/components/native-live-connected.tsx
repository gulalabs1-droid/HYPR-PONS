"use client";

import React, { useState } from "react";
import { ControlBar, LiveKitRoom, ParticipantTile, RoomAudioRenderer, StartAudio, useConnectionState, useParticipants, useRoomContext, useTracks } from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";
import { streamingErrorMessage } from "@/lib/creator-access";

export type Session = { token: string; serverUrl: string; role: "host" | "viewer"; video?: boolean; audio?: boolean };

function isHost(metadata?: string) {
  try { return JSON.parse(metadata || "{}").role === "host"; } catch { return false; }
}

function BroadcastStage({ role, onLeave }: { role: Session["role"]; onLeave: () => void }) {
  const room = useRoomContext();
  const connection = useConnectionState();
  const participants = useParticipants();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare, Track.Source.Microphone], { onlySubscribed: true });
  const hostTracks = tracks.filter((track) => isHost(track.participant.metadata) && !track.publication.isMuted);
  const videos = hostTracks.filter((track) => track.source !== Track.Source.Microphone);
  const live = hostTracks.length > 0;
  const viewers = participants.filter((participant) => !isHost(participant.metadata)).length;
  const connected = connection === ConnectionState.Connected;
  return <>
    <div className="native-live-toolbar" aria-live="polite">
      <span><span className={connected && live ? "pulse" : "status-dot inactive"} /> {connected ? live ? `LIVE · ${viewers} viewer${viewers === 1 ? "" : "s"}` : role === "host" ? "STUDIO READY · TURN ON CAMERA OR MIC" : "BROADCAST PAUSED · WAITING FOR CREATOR" : connection === ConnectionState.Reconnecting ? "RECONNECTING…" : "CONNECTING…"}</span>
      <button className="live-control-button" onClick={async () => { await room.disconnect(); onLeave(); }}>{role === "host" ? "End broadcast" : "Leave live"}</button>
    </div>
    <div className="hypr-broadcast-stage">
      {videos.length ? videos.map((track) => <ParticipantTile key={track.publication.trackSid} trackRef={track} />) : <div className="native-live-placeholder"><div className="native-live-mark"><span>H</span><strong>{live ? "Audio broadcast" : connected ? "Waiting for the creator" : "Connecting to HYPR"}</strong><small>{live ? "The creator is sharing audio. Video is off." : "No video or audio is being published yet."}</small></div></div>}
    </div>
    {role === "host" ? <ControlBar controls={{ microphone: true, camera: true, screenShare: true, chat: false, leave: false }} saveUserChoices={false} /> : <p className="accounting-copy">You’re watching only. Your camera and microphone are never requested.</p>}
    <StartAudio label="Tap to hear the broadcast" />
    <RoomAudioRenderer />
  </>;
}

export function ConnectedRoom({ session, onLeave, onError, connect = true }: { session: Session; onLeave: () => void; onError: (message: string) => void; connect?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <div className="native-live-connected" data-lk-theme="default">
    <LiveKitRoom token={session.token} serverUrl={session.serverUrl} connect={connect} video={session.role === "host" && session.video !== false} audio={session.role === "host" && session.audio !== false}
      onConnected={() => { setFailed(false); onError(""); }}
      onError={(error) => { setFailed(true); onError(streamingErrorMessage(error)); }}
      onMediaDeviceFailure={() => onError("Camera or microphone unavailable. Allow access in your browser, then use the studio controls to retry. You are not live until a track is publishing.")}
      onDisconnected={onLeave}>
      <BroadcastStage role={session.role} onLeave={onLeave} />
      {failed && <button className="secondary-button" onClick={onLeave}>Return to room and retry</button>}
    </LiveKitRoom>
  </div>;
}
