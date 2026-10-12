"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { LiveKitRoom, RoomAudioRenderer, VideoConference, useRoomContext } from "@livekit/components-react";
import type { Launch } from "@/lib/types";
import { getEthereum } from "@/lib/wallet";
import { creatorAccessProblem, streamingErrorMessage } from "@/lib/creator-access";

type Session = { token: string; serverUrl: string; role: "host" | "viewer" };
type Status = { configured: boolean; live: boolean; viewerCount: number };

function signedHostMessage(roomId: string, address: string, timestamp: number) {
  const roomName = `hypr-${roomId.toLowerCase()}`;
  return ["HYPR native live host authorization", `Room: ${roomName}`, `Wallet: ${address.toLowerCase()}`, `Timestamp: ${timestamp}`].join("\n");
}

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

export function NativeLiveRoom({ token }: { token: Launch }) {
  const [status, setStatus] = useState<Status>({ configured: true, live: false, viewerCount: 0 });
  const [session, setSession] = useState<Session | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const mounted = useRef(true);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/live/status?roomId=${encodeURIComponent(token.address)}`, { cache: "no-store" });
      const next = await response.json() as Status;
      if (mounted.current && response.ok) setStatus(next);
    } catch { /* offline is safer than claiming a live room */ }
  }, [token.address]);

  useEffect(() => {
    mounted.current = true;
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 10000);
    return () => { mounted.current = false; window.clearInterval(timer); };
  }, [refreshStatus]);

  async function joinViewer() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/live/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId: token.address, role: "viewer" }) });
      const data = await response.json() as Session & { error?: string };
      if (!response.ok) throw new Error(data.error || "Viewer access is unavailable.");
      setSession(data);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Viewer access is unavailable."); }
    finally { setBusy(false); }
  }

  async function startHost() {
    setBusy(true); setNotice("");
    try {
      const ethereum = getEthereum();
      if (!ethereum) throw new Error("Connect an EVM wallet before starting a HYPR live room.");
      const accounts = await ethereum.request({ method: "eth_requestAccounts" }) as string[];
      const address = accounts[0];
      const chainId = Number(await ethereum.request({ method: "eth_chainId" }));
      const accessProblem = creatorAccessProblem(address, chainId, token.deployer);
      if (accessProblem) throw new Error(accessProblem);
      const timestamp = Date.now();
      const message = signedHostMessage(token.address, address, timestamp);
      const signature = await ethereum.request({ method: "personal_sign", params: [message, address] }) as `0x${string}`;
      const response = await fetch("/api/live/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId: token.address, role: "host", address, timestamp, signature }) });
      const data = await response.json() as Session & { error?: string };
      if (!response.ok) throw new Error(data.error || "The creator wallet could not be authorized.");
      setSession(data); setStudioOpen(false); await refreshStatus();
    } catch (error) { setNotice(streamingErrorMessage(error)); }
    finally { setBusy(false); }
  }

  function leaveRoom() { setSession(null); setStudioOpen(false); void refreshStatus(); }

  if (session) return <section><ConnectedRoom session={session} onLeave={leaveRoom} onError={setNotice} />{notice && <div className="live-notice" role="alert">{notice}</div>}</section>;

  return <section className="native-live-surface">
    <div className="native-live-copy">
      <span className="eyebrow"><span className={status.live ? "pulse" : "status-dot inactive"} /> NATIVE HYPR LIVE</span>
      <h2>{status.live ? "This room is live." : "Go live from HYPR."}</h2>
      <p>{status.live ? "Watch the creator, hear the room, and follow the curve without opening Twitch or YouTube." : "Creators use their camera and microphone here. Viewers stay in the HYPR room."}</p>
      <span className="live-state">{status.live ? `LIVE · ${status.viewerCount} viewer${status.viewerCount === 1 ? "" : "s"} inside HYPR` : status.configured ? "CREATOR ROOM OFFLINE" : "STREAMING ACCOUNT NOT CONNECTED"}</span>
      {status.live && <button className="primary-button live-action" onClick={joinViewer} disabled={busy}>{busy ? "Joining…" : "Watch live inside HYPR ↗"}</button>}
      {!studioOpen && <button className="secondary-button live-action" onClick={() => setStudioOpen(true)}>{status.live ? "Creator controls" : "Open creator studio"}</button>}
      {studioOpen && <div className="live-studio-card"><strong>Creator studio</strong><span>Use the wallet that created this coin. First approve a free wallet authorization; then allow camera and microphone access. Starting shares your video and audio with viewers through LiveKit. This does not send a coin transaction.</span><button className="primary-button live-action" onClick={startHost} disabled={busy}>{busy ? "Waiting for wallet authorization…" : "Authorize & start broadcast ↗"}</button><button className="claim-link" onClick={() => { setStudioOpen(false); setNotice(""); }}>Cancel</button></div>}
      {notice && <div className="live-notice" role="status">{notice}</div>}
    </div>
    <div className="live-viewport native-live-placeholder"><div className="native-live-mark"><span>H</span><strong>{status.live ? "Live room ready" : "Stream directly from HYPR"}</strong><small>{status.live ? "Join the broadcast without leaving HYPR." : status.configured ? "Your camera stays off until you start a broadcast." : "One streaming account setting is still needed."}</small></div></div>
  </section>;
}
