"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Launch } from "@/lib/types";
import { getEthereum, personalSignHex, ROBINHOOD_TESTNET_CHAIN_ID, switchToRobinhoodTestnet } from "@/lib/wallet";
import { creatorAccessProblem, streamingErrorMessage } from "@/lib/creator-access";
import type { Session } from "./native-live-connected";
import { useWalletStatus } from "@/lib/use-wallet-status";
import { OPEN_WALLET_EVENT } from "@/lib/wallet-discovery";

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
  const [shareVideo, setShareVideo] = useState(false);
  const [shareAudio, setShareAudio] = useState(false);
  const [preview, setPreview] = useState<MediaStream | null>(null);
  const previewStream = useRef<MediaStream | null>(null);
  const previewVideo = useRef<HTMLVideoElement>(null);
  const wallet = useWalletStatus();
  const mounted = useRef(true);
  const statusPending = useRef(false);

  const stopPreview = useCallback(() => {
    previewStream.current?.getTracks().forEach((track) => track.stop());
    previewStream.current = null; setPreview(null);
  }, []);

  useEffect(() => { stopPreview(); }, [shareVideo, shareAudio, stopPreview]);
  useEffect(() => {
    if (previewVideo.current) previewVideo.current.srcObject = preview;
  }, [preview]);

  async function preparePreview() {
    setBusy(true); setNotice("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Device preview needs a secure browser with camera/microphone support. Try the latest Safari or Chrome on HTTPS.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: shareVideo, audio: shareAudio });
      if (!mounted.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      previewStream.current?.getTracks().forEach((track) => track.stop());
      previewStream.current = stream; setPreview(stream);
    } catch (error) { setNotice(streamingErrorMessage(error)); }
    finally { if (mounted.current) setBusy(false); }
  }

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
    return () => { mounted.current = false; window.clearInterval(timer); previewStream.current?.getTracks().forEach((track) => track.stop()); previewStream.current = null; };
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
      if (!previewStream.current) throw new Error("Preview your selected devices first. You are not broadcasting yet.");
      if (!ethereum) { window.dispatchEvent(new Event(OPEN_WALLET_EVENT)); throw new Error("Choose the wallet that created this room, then try starting again."); }
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
      if (!mounted.current) return;
      stopPreview(); setSession({ ...data, video: shareVideo, audio: shareAudio }); setStudioOpen(false); await refreshStatus();
    } catch (error) { setNotice(streamingErrorMessage(error)); }
    finally { setBusy(false); }
  }

  function leaveRoom() { setSession(null); setStudioOpen(false); void refreshStatus(); }

  if (session) return <section><ConnectedRoom session={session} onLeave={leaveRoom} onError={setNotice} />{notice && <div className="live-notice" role="alert">{notice}</div>}</section>;

  const creatorConnected = wallet.account?.toLowerCase() === token.deployer.toLowerCase();
  return <section className="native-live-surface native-live-watch-first" aria-label="Broadcast player">
    <div className="live-viewport native-live-placeholder"><div className="native-live-mark"><span aria-hidden="true">H</span>
      <strong>{statusError ? "Broadcast status unavailable" : !status ? "Checking for a broadcast…" : status.live ? "The creator is live" : status.hostConnected ? "The creator is preparing a broadcast" : "Creator offline"}</strong>
      <small>{status?.live ? "Watch here, without a wallet or token purchase." : "You can still chat and explore the room. Your camera and microphone stay off."}</small>
      {status?.live && <button className="primary-button live-action" onClick={joinViewer} disabled={busy}>{busy ? "Joining…" : "Watch live →"}</button>}
      {statusError && <button className="secondary-button" onClick={() => void refreshStatus()}>Retry broadcast status</button>}
    </div></div>
    <div className="native-live-copy native-live-viewer-footer">
      <span className="live-state" role="status">{statusError ? "Rechecking connection…" : status?.live ? `LIVE · ${status.viewerCount ?? 0} viewer${status.viewerCount === 1 ? "" : "s"}` : status?.configured ? "Watching never requests your camera or microphone." : !status ? "Checking streaming availability…" : "Streaming is unavailable right now."}</span>
      {!studioOpen && (creatorConnected ? <button className="secondary-button" onClick={() => setStudioOpen(true)} disabled={!status?.configured}>Open creator studio</button> : <details className="creator-entry"><summary>Are you the creator?</summary><p>Broadcasting requires the wallet that created this room: {token.deployer.slice(0, 6)}…{token.deployer.slice(-4)}.</p><button className="secondary-button" onClick={() => setStudioOpen(true)} disabled={!status?.configured}>Open creator studio</button></details>)}
      {studioOpen && <div className="live-studio-card"><strong>Creator studio · not live yet</strong>
        <ol className="studio-steps"><li>Choose your devices.</li><li>Preview privately on this device.</li><li>Sign with your creator wallet, then broadcast.</li></ol>
        <span>Preview requests access but does not publish or record. “Start broadcast” shares your selected devices live through LiveKit. Authorization is a free signature, not a transaction.</span>
        <div className="studio-device-options"><label><input type="checkbox" checked={shareVideo} onChange={(event) => setShareVideo(event.target.checked)} disabled={busy} /> Camera</label><label><input type="checkbox" checked={shareAudio} onChange={(event) => setShareAudio(event.target.checked)} disabled={busy} /> Microphone</label></div>
        <small>{!shareVideo && !shareAudio ? "Both devices are off. Choose at least one to preview; microphone-only is supported." : "You are not live. Preview first, then choose whether to broadcast."}</small>
        {preview && <div className="studio-preview">{shareVideo ? <video ref={previewVideo} autoPlay playsInline muted aria-label="Private camera preview" /> : <strong>Microphone ready · private preview</strong>}<span>Only on this device · not broadcasting</span><button className="secondary-button" onClick={stopPreview} disabled={busy}>Stop preview</button></div>}
        <button className="secondary-button" onClick={() => void preparePreview()} disabled={busy || (!shareVideo && !shareAudio)}>{busy ? "Preparing…" : preview ? "Refresh private preview" : "Preview selected devices"}</button>
        <button className="primary-button" onClick={() => void startHost()} disabled={busy || !preview}>{busy ? "Check your wallet…" : "Authorize & start broadcast"}</button>
        <button className="claim-link" disabled={busy} onClick={() => { stopPreview(); setStudioOpen(false); setNotice(""); }}>Close studio</button>
      </div>}
      {notice && <div className="live-notice" role="status">{notice}</div>}
    </div>
  </section>;
}
