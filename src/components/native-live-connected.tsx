"use client";

import React, { useState } from "react";
import { LiveKitRoom, RoomAudioRenderer, VideoConference, useRoomContext } from "@livekit/components-react";
import { streamingErrorMessage } from "@/lib/creator-access";

export type Session = { token: string; serverUrl: string; role: "host" | "viewer" };

function LeaveControl({ role, onLeave }: { role: "host" | "viewer"; onLeave: () => void }) {
  const room = useRoomContext();
  return <button className="live-control-button" onClick={() => { room.disconnect(); onLeave(); }}>{role === "host" ? "End live" : "Leave live"}</button>;
}

export function ConnectedRoom({ session, onLeave, onError, connect = true }: { session: Session; onLeave: () => void; onError: (message: string) => void; connect?: boolean }) {
  const [connected, setConnected] = useState(false);
  return <div className="native-live-connected" data-lk-theme="default">
    <LiveKitRoom token={session.token} serverUrl={session.serverUrl} connect={connect} video={session.role === "host"} audio={session.role === "host"} onConnected={() => setConnected(true)} onError={(error) => onError(streamingErrorMessage(error))} onMediaDeviceFailure={() => onError("Camera or microphone unavailable. Check your browser permissions and connected devices.")} onDisconnected={onLeave}>
      <div className="native-live-toolbar"><span><span className={connected ? "pulse" : "status-dot inactive"} /> {connected ? session.role === "host" ? "CREATOR STUDIO CONNECTED" : "CONNECTED TO HYPR" : "CONNECTING TO YOUR ROOM…"}</span><LeaveControl role={session.role} onLeave={onLeave} /></div>
      <VideoConference />
      <RoomAudioRenderer />
    </LiveKitRoom>
  </div>;
}