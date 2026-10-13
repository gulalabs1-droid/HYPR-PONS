"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Launch } from "@/lib/types";
import { getEthereum, personalSignHex, ROBINHOOD_TESTNET_CHAIN_ID, switchToRobinhoodTestnet } from "@/lib/wallet";
import { creatorAccessProblem, streamingErrorMessage } from "@/lib/creator-access";
import type { Session } from "./native-live-connected";

// LiveKit is large; load it only once a viewer joins or a creator starts broadcasting.
const ConnectedRoom = dynamic(() => import("./native-live-connected-styled"), {
  ssr: false,
  loading: () => <div className="native-live-connected"><div className="native-live-toolbar"><span><span className="status-dot inactive" /> CONNECTING TO YOUR ROOM…</span></div></div>,
});

type Status = { configured: boolean; live: boolean; viewerCount?: number; hostConnected?: boolean; checkedAt?: string };

function signedHostMessage(roomId: string, address: string, timestamp: number) {
  const roomName = `hypr-${roomId.toLowerCase()}`;
  return ["HYPR native live host authorization", `Room: ${roomName}`, `Wallet: ${address.toLowerCase()}`, `Timestamp: ${timestamp}`].join("\n");
}

export function NativeLiveRoom({ token }: { token: Launch }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [shareVideo, setShareVideo] = useState(true);
  const [shareAudio, setShareAudio] = useState(true);
  const mounted = useRef(true);
  const statusPending = useRef(false);

  const refreshStatus = useCallback(async () => {
    if (statusPending.current) return;
    statusPending.current = true;
    try {
      const response = await fetch(`/api/live/status?roomId=${encodeURIComponent(token.address)}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      const next = await response.json() as Status;
      if (!response.ok) throw new Error("Live status unavailable");
      if (mounted.current) { setStatus(next); setStatusError(false); }
    } catch { if (mounted.current) { setStatus(null); setStatusError(true); } }
    finally { statusPending.current = false; }
  }, [token.address]);

  useEffect(() => {
    mounted.current = true;
    void refreshStatus();
    const timer = window.setInterval(() => { if (document.visibilityState !== "hidden") void refreshStatus(); }, 5000);
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
      if (!shareVideo && !shareAudio) throw new Error("Choose a camera or microphone to broadcast. Audio-only is supported.");
      if (!ethereum) throw new Error("Connect an EVM wallet before starting a HYPR live room.");
      const accounts = await ethereum.request({ method: "eth_requestAccounts" }) as string[];
      const address = accounts[0];
      let chainId = Number(await ethereum.request({ method: "eth_chainId" }));
      if (chainId !== ROBINHOOD_TESTNET_CHAIN_ID && await switchToRobinhoodTestnet(ethereum)) chainId = Number(await ethereum.request({ method: "eth_chainId" }));
      const accessProblem = creatorAccessProblem(address, chainId, token.deployer);
      if (accessProblem) throw new Error(accessProblem);
      const timestamp = Date.now();
      const message = signedHostMessage(token.address, address, timestamp);
      const signature = await ethereum.request({ method: "personal_sign", params: [personalSignHex(message), address] }) as `0x${string}`;
      const response = await fetch("/api/live/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId: token.address, role: "host", address, timestamp, signature }) });
      const data = await response.json() as Session & { error?: string };
      if (!response.ok) throw new Error(data.error || "The creator wallet could not be authorized.");
      setSession({ ...data, video: shareVideo, audio: shareAudio }); setStudioOpen(false); await refreshStatus();
    } catch (error) { setNotice(streamingErrorMessage(error)); }
    finally { setBusy(false); }
  }

  function leaveRoom() { setSession(null); setStudioOpen(false); void refreshStatus(); }

  if (session) return <section><ConnectedRoom session={session} onLeave={leaveRoom} onError={setNotice} />{notice && <div className="live-notice" role="alert">{notice}</div>}</section>;

  return <section className="native-live-surface">
    <div className="native-live-copy">
      <span className="eyebrow"><span className={status?.live ? "pulse" : "status-dot inactive"} /> NATIVE HYPR LIVE</span>
      <h2>{status?.live ? "This room is live." : "Go live from HYPR."}</h2>
      <p>{status?.live ? "Watch the creator, hear the room, and follow the curve without opening Twitch or YouTube." : "Creators broadcast directly here. Viewers watch without connecting a wallet or enabling a camera."}</p>
      <span className="live-state" role="status">{statusError ? "LIVE STATUS UNAVAILABLE · RETRYING" : !status ? "CHECKING BROADCAST…" : status.live ? `LIVE · ${status.viewerCount} viewer${status.viewerCount === 1 ? "" : "s"} inside HYPR` : status.configured ? status.hostConnected ? "STUDIO CONNECTED · NOT BROADCASTING" : "CREATOR OFFLINE" : "STREAMING ACCOUNT NOT CONNECTED"}</span>
      {status?.live && <button className="primary-button live-action" onClick={joinViewer} disabled={busy}>{busy ? "Joining…" : "Watch live inside HYPR ↗"}</button>}
      {!studioOpen && <button className="secondary-button live-action" onClick={() => setStudioOpen(true)} disabled={!status?.configured}>{status?.live ? "Creator controls" : "Open creator studio"}</button>}
      {studioOpen && <div className="live-studio-card"><strong>Creator studio</strong><span>Use the wallet that created this coin. Approve one free authorization, then allow your selected devices. Starting shares them live with viewers through LiveKit—no transaction and no automatic recording.</span><label><input type="checkbox" checked={shareVideo} onChange={(event) => setShareVideo(event.target.checked)} disabled={busy} /> Share camera</label><label><input type="checkbox" checked={shareAudio} onChange={(event) => setShareAudio(event.target.checked)} disabled={busy} /> Share microphone</label><small>Turn off camera for an audio-only broadcast.</small><button className="primary-button live-action" onClick={startHost} disabled={busy || (!shareVideo && !shareAudio)}>{busy ? "Waiting for wallet authorization…" : "Authorize & start broadcast ↗"}</button><button className="claim-link" onClick={() => { setStudioOpen(false); setNotice(""); }}>Cancel</button></div>}
      {notice && <div className="live-notice" role="status">{notice}</div>}
    </div>
    <div className="live-viewport native-live-placeholder"><div className="native-live-mark"><span>H</span><strong>{status?.live ? "Live room ready" : "Stream directly from HYPR"}</strong><small>{status?.live ? "Join the broadcast without leaving HYPR." : status?.configured ? "Your camera stays off until you start a broadcast." : "Checking streaming availability."}</small></div></div>
  </section>;
}
