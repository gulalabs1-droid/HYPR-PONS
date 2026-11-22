"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Launch } from "@/lib/types";
import { getEthereum, personalSignHex, ROBINHOOD_TESTNET_CHAIN_ID, switchToRobinhoodTestnet } from "@/lib/wallet";
import { creatorAccessProblem, streamingErrorMessage } from "@/lib/creator-access";
import type { BroadcastRecap, Session } from "./native-live-connected";
import { useWalletStatus } from "@/lib/use-wallet-status";
import { OPEN_WALLET_EVENT } from "@/lib/wallet-discovery";
import { broadcastCopy, broadcastExitNotice, publicBroadcastPhase, type BroadcastExit, type BroadcastStatus } from "@/lib/broadcast-lifecycle";
import { TokenArt, tokenGlyph } from "./token-art";
import { roomHue } from "@/lib/room-display";
import { CommunitySignInError, signInCommunity } from "@/lib/community-client";
import { showDemoNews } from "@/lib/demo-news";
import type { MediaAsset } from "@/lib/media";
import { InlineReplay } from "./inline-replay";
import { ShowCountdown } from "./show-countdown";
import { RemindMe } from "./remind-me";
import { DemoNewsFeed } from "./demo-news-feed";
import { GoLiveSetup, type GoLiveChoice } from "./go-live-setup";
import { LiveIcon, formatClock } from "./live-icons";
import { ShareRoom } from "./share-room";

/** Anything on the page can open the go-live setup: a #go-live link or this event. */
export const OPEN_GO_LIVE_EVENT = "hypr:open-go-live";
const COUNTDOWN_SECONDS = 3;

// LiveKit is large; load it only once a viewer joins or a creator starts broadcasting.
const ConnectedRoom = dynamic(() => import("./native-live-connected-styled"), {
  ssr: false,
  loading: () => <div className="native-live-connected"><div className="native-live-toolbar"><span><span className="status-dot inactive" /> CONNECTING TO YOUR ROOM…</span></div></div>,
});

function signedHostMessage(roomId: string, address: string, timestamp: number) {
  return ["HYPR native live host authorization", `Room: hypr-${roomId.toLowerCase()}`, `Wallet: ${address.toLowerCase()}`, `Timestamp: ${timestamp}`].join("\n");
}

export function NativeLiveRoom({ token, onOpenChat, showTitle, nextShow, latestReplay, otherLive = [], hostName }: { token: Launch; onOpenChat?: () => void; nextShow?: { id: string; title: string; startsAt: string }; latestReplay?: MediaAsset; otherLive?: { address: string; name: string }[]; showTitle?: string; hostName?: string }) {
  const [status, setStatus] = useState<BroadcastStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [seenLive, setSeenLive] = useState(false);
  const [lastExit, setLastExit] = useState<BroadcastExit | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [newsHidden, setNewsHidden] = useState(false);
  const [oneTimeAvailable, setOneTimeAvailable] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [recap, setRecap] = useState<BroadcastRecap | null>(null);
  const pendingSession = useRef<Session | null>(null);
  const wallet = useWalletStatus();
  const mounted = useRef(true);
  const statusPending = useRef(false);
  const statusGeneration = useRef(0);
  const sawCurrentMedia = useRef(false);
  const surface = useRef<HTMLElement>(null);

  const closeStudio = useCallback(() => { pendingSession.current = null; setCountdown(null); setStudioOpen(false); setNotice(""); setOneTimeAvailable(false); }, []);

  // A short countdown after the wallet approves, so the creator is ready when the first frame goes out.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      const next = pendingSession.current; pendingSession.current = null;
      setCountdown(null);
      if (next) { setLastExit(null); sawCurrentMedia.current = false; setSeenLive(false); setSession(next); setStudioOpen(false); void refreshStatusRef.current?.(); }
      return;
    }
    const timer = window.setTimeout(() => setCountdown(value => value === null ? null : value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const refreshStatus = useCallback(async () => {
    if (statusPending.current) return;
    statusPending.current = true;
    const generation = statusGeneration.current;
    try {
      const response = await fetch(`/api/live/status?roomId=${encodeURIComponent(token.address)}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      const next = await response.json() as BroadcastStatus;
      if (!response.ok || typeof next?.configured !== "boolean" || typeof next?.live !== "boolean") throw new Error("Live status unavailable");
      if (mounted.current && generation === statusGeneration.current) {
        setStatus(next); setStatusError(false);
        if (next.live) { sawCurrentMedia.current = true; setSeenLive(true); setLastExit(null); }
        else if (!next.hostConnected) {
          if (sawCurrentMedia.current) setLastExit((current) => current === "host-ended" ? current : "creator-offline");
          sawCurrentMedia.current = false; setSeenLive(false);
        }
      }
    } catch { if (mounted.current && generation === statusGeneration.current) { setStatus(null); setStatusError(true); } }
    finally { statusPending.current = false; }
  }, [token.address]);
  const refreshStatusRef = useRef(refreshStatus); refreshStatusRef.current = refreshStatus;

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
      if (!mounted.current) return;
      setLastExit(null); sawCurrentMedia.current = true; setSeenLive(true); setSession({ ...data, roomId: token.address, showTitle });
    } catch (error) { setNotice(error instanceof Error ? error.message : "Viewer access is unavailable."); }
    finally { setBusy(false); }
  }

  async function startHost(choice: GoLiveChoice, oneTime = false) {
    if (busy || countdown !== null) return;
    setBusy(true); setNotice("");
    try {
      const ethereum = getEthereum();
      if (!choice.video && !choice.audio) throw new Error("Turn on your camera or mic to go live. Audio-only is supported.");
      if (!ethereum) { window.dispatchEvent(new Event(OPEN_WALLET_EVENT)); throw new Error("Choose the wallet that created this room, then try starting again."); }
      let accounts = await ethereum.request({ method: "eth_accounts" }) as string[];
      if (!accounts[0]) accounts = await ethereum.request({ method: "eth_requestAccounts" }) as string[];
      const address = accounts[0];
      let chainId = Number(await ethereum.request({ method: "eth_chainId" }));
      if (chainId !== ROBINHOOD_TESTNET_CHAIN_ID && await switchToRobinhoodTestnet(ethereum)) chainId = Number(await ethereum.request({ method: "eth_chainId" }));
      const accessProblem = creatorAccessProblem(address, chainId, token.deployer);
      if (accessProblem) throw new Error(accessProblem);
      if (oneTime && choice.saveReplay) throw new Error("Turn off the private replay option to use one-time authorization. You can record later after HYPR sign-in is available.");
      let signedInWallet = address, signature: `0x${string}` | undefined, timestamp: number | undefined;
      if (oneTime) {
        timestamp = Date.now();
        signature = await ethereum.request({ method: "personal_sign", params: [personalSignHex(signedHostMessage(token.address, address, timestamp)), address] }) as `0x${string}`;
      } else signedInWallet = await signInCommunity({ requireLiveHost: true });
      const latest = await ethereum.request({ method: "eth_accounts" }) as string[];
      if (getEthereum() !== ethereum || signedInWallet.toLowerCase() !== address.toLowerCase() || latest[0]?.toLowerCase() !== address.toLowerCase() || Number(await ethereum.request({ method: "eth_chainId" })) !== ROBINHOOD_TESTNET_CHAIN_ID) throw new Error("Your wallet or network changed. Reconnect your creator wallet and try again.");
      const response = await fetch(oneTime ? "/api/live/token" : "/api/community/live-host", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(oneTime ? { roomId: token.address, role: "host", address, timestamp, signature } : { roomId: token.address }) });
      const data = await response.json() as Session & { error?: string };
      if (!response.ok) throw new Error(data.error || "The creator wallet could not be authorized.");
      if (!mounted.current) return;
      setOneTimeAvailable(false);
      pendingSession.current = { ...data, roomId: token.address, video: choice.video, audio: choice.audio, videoDeviceId: choice.videoDeviceId, audioDeviceId: choice.audioDeviceId, showTitle, recordReplay: choice.saveReplay };
      setCountdown(COUNTDOWN_SECONDS);
    } catch (error) { if (!oneTime && error instanceof CommunitySignInError && error.status >= 500) setOneTimeAvailable(true); setNotice(streamingErrorMessage(error)); }
    finally { setBusy(false); }
  }

  const leaveRoom = useCallback((reason: BroadcastExit, stats?: BroadcastRecap) => {
    statusGeneration.current++;
    setLastExit(reason); setSession(null); setStudioOpen(false);
    // A creator who ends their own show gets a wrap-up card instead of a status sentence.
    if (reason === "host-ended" && stats) { setRecap(stats); setNotice(""); } else setNotice(broadcastExitNotice(reason));
    if (reason === "host-ended" || reason === "creator-offline" || reason === "session-ended") {
      sawCurrentMedia.current = false; setSeenLive(false);
      setStatus((current) => current ? { ...current, live: false, hostConnected: false, viewerCount: undefined } : null);
    }
    void refreshStatus();
  }, [refreshStatus]);

  const creatorConnected = wallet.account?.toLowerCase() === token.deployer.toLowerCase();
  const openStudio = useCallback(() => {
    setRecap(null); setNotice(""); setStudioOpen(true);
    window.requestAnimationFrame(() => surface.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
  }, []);
  useEffect(() => {
    if (!creatorConnected || session) return;
    function fromHash() {
      if (window.location.hash !== "#go-live") return;
      window.history.replaceState?.(null, "", window.location.pathname + window.location.search);
      openStudio();
    }
    fromHash();
    window.addEventListener("hashchange", fromHash);
    window.addEventListener(OPEN_GO_LIVE_EVENT, openStudio);
    return () => { window.removeEventListener("hashchange", fromHash); window.removeEventListener(OPEN_GO_LIVE_EVENT, openStudio); };
  }, [creatorConnected, openStudio, session]);

  if (session) return <section aria-label="Broadcast player"><ConnectedRoom key={session.token} session={session} onLeave={leaveRoom} onError={setNotice} onSessionChange={setSession} />{notice && <div className="live-notice" role="alert">{notice}</div>}</section>;

  const phase = publicBroadcastPhase(status, statusError, seenLive, lastExit);
  const copy = broadcastCopy(phase);
  const phaseLabel = phase === "live" && status?.viewerCount !== undefined ? `Live · ${status.viewerCount} viewer${status.viewerCount === 1 ? "" : "s"}` : copy.label;
  // The creator's own offline room is their launch pad: show the poster with Go live, not the replay or outside news.
  const creatorStage = creatorConnected && !status?.live;
  const canGoLive = status?.configured === true;
  const goLiveButton = <button type="button" className="golive-cta" onClick={openStudio} disabled={!canGoLive}><span className="golive-start-dot" aria-hidden="true" />Go live</button>;
  return <section ref={surface} className="native-live-surface native-live-watch-first" aria-label="Broadcast player" id="go-live">
    {studioOpen ? <GoLiveSetup showTitle={showTitle} configured={canGoLive} busy={busy} countdown={countdown} notice={notice} oneTimeAvailable={oneTimeAvailable}
      onStart={choice => void startHost(choice)} onOneTime={choice => void startHost(choice, true)} onCancelCountdown={() => { pendingSession.current = null; setCountdown(null); }} onClose={closeStudio} />
    : recap && creatorConnected ? <BroadcastWrap recap={recap} roomId={token.address} name={hostName || token.name} onAgain={openStudio} onDone={() => setRecap(null)} canGoLive={canGoLive} />
    : latestReplay && !status?.live && phase !== "checking" && !creatorStage ? <InlineReplay roomId={token.address} asset={latestReplay} /> : showDemoNews(token, phase) && !newsHidden && !creatorStage ? <DemoNewsFeed hostName={hostName || token.name} onHide={() => setNewsHidden(true)} /> : <div className={`live-viewport native-live-placeholder stage-poster is-${phase}`} style={{ "--hue": roomHue(token.address) } as React.CSSProperties}>
      <div className="stage-backdrop" aria-hidden="true"><TokenArt seed={token.address} /></div>
      <div className="native-live-mark"><span className="stage-avatar" aria-hidden="true"><TokenArt seed={token.address} glyph={tokenGlyph(token.logo, token.symbol)} /></span>
      {creatorStage ? <>
        <span className="broadcast-phase-label">Your room · offline</span>
        {showTitle && <em className="stage-show">{showTitle}</em>}
        <strong>Ready when you are</strong>
        <small>{canGoLive ? "Check your camera and mic, then go live in one tap. Your followers get an alert." : status ? "Live video isn’t switched on for HYPR right now." : "Checking the live service…"}</small>
        {goLiveButton}
      </> : <>
      <span className="broadcast-phase-label">{phase === "live" && <span className="pulse" />}{phaseLabel}</span>
      {showTitle && phase !== "live" && <em className="stage-show">{showTitle}</em>}
      <strong>{copy.title}</strong>
      <small>{copy.detail}</small>
      {status?.live && <button className="primary-button live-action" onClick={joinViewer} disabled={busy}>{busy ? "Joining…" : "Watch live →"}</button>}
      {status?.live && <small className="live-ask-hint">Want to be on the show? Watch, then tap ✋ Ask to join. The creator approves each guest.</small>}
      {phase === "unavailable" && <button className="secondary-button" onClick={() => void refreshStatus()}>Retry broadcast status</button>}
      {!status?.live && nextShow && Date.parse(nextShow.startsAt) > Date.now() - 60 * 60_000 && <div className="stage-next-show"><span>Next show</span><strong>{nextShow.title}</strong><ShowCountdown startsAt={nextShow.startsAt} /><RemindMe roomId={token.address} calendarHref={`/api/community/calendar?roomId=${token.address}&showId=${nextShow.id}`} /></div>}
      {!status?.live && !nextShow && phase !== "unavailable" && onOpenChat && <button type="button" className="secondary-button" onClick={onOpenChat}>Say hi in chat</button>}
      {newsHidden && showDemoNews(token, phase) && <button type="button" className="claim-link" onClick={() => setNewsHidden(false)}>Watch NBC News while you wait</button>}
      </>}
    </div></div>}
    <div className="native-live-copy native-live-viewer-footer">
      <span className="live-state broadcast-status-announcement" role="status">{phaseLabel}</span>
      {notice && !studioOpen && <div className="live-notice" role="status">{notice}</div>}
      {lastExit && !status?.live && !recap && !creatorConnected && <UpNext roomId={token.address} nextShow={nextShow} latestReplay={latestReplay} otherLive={otherLive} onOpenChat={onOpenChat} />}
    </div>
  </section>;
}

/** The creator just ended their show: what happened, and the two things worth doing next. */
function BroadcastWrap({ recap, roomId, name, onAgain, onDone, canGoLive }: { recap: BroadcastRecap; roomId: string; name: string; onAgain: () => void; onDone: () => void; canGoLive: boolean }) {
  return <div className="golive-wrap" role="status">
    <span className="golive-wrap-badge">Show ended</span>
    <h2>That’s a wrap</h2>
    <dl className="golive-wrap-stats">
      <div><dt>Live for</dt><dd>{formatClock(recap.seconds)}</dd></div>
      <div><dt>Peak viewers</dt><dd>{recap.peakViewers.toLocaleString()}</dd></div>
      <div><dt>Replay</dt><dd>{recap.recorded ? "Uploading" : "Not saved"}</dd></div>
    </dl>
    <p>Your room, chat and followers stay right here.{recap.recorded ? " Keep this tab open until the replay finishes uploading, then publish it from Replays." : ""}</p>
    <div className="golive-wrap-actions">
      <button type="button" className="golive-cta" onClick={onAgain} disabled={!canGoLive}><span className="golive-start-dot" aria-hidden="true" />Go live again</button>
      <ShareRoom roomId={roomId} name={name} />
      <button type="button" className="claim-link" onClick={onDone}><LiveIcon name="close" size={14} /> Close</button>
    </div>
  </div>;
}

/** After a show ends: the next show, the replay, or another room that's live right now. */
function UpNext({ roomId, nextShow, latestReplay, otherLive, onOpenChat }: { roomId: string; nextShow?: { id: string; title: string; startsAt: string }; latestReplay?: MediaAsset; otherLive: { address: string; name: string }[]; onOpenChat?: () => void }) {
  const upcoming = nextShow && Date.parse(nextShow.startsAt) > Date.now() ? nextShow : undefined;
  return <section className="up-next" aria-label="Up next">
    <span className="eyebrow">Up next</span>
    <ul>
      {upcoming && <li><strong>Next show · {upcoming.title}</strong><ShowCountdown startsAt={upcoming.startsAt} /><RemindMe roomId={roomId} calendarHref={`/api/community/calendar?roomId=${roomId}&showId=${upcoming.id}`} /></li>}
      {latestReplay && <li><strong>Watch the replay · {latestReplay.title}</strong><a className="secondary-button" href={`/room/${roomId}/recording/${latestReplay.id}`}>Watch ↗</a></li>}
      {otherLive.slice(0, 3).map(room => <li key={room.address}><strong><span className="pulse" aria-hidden="true" /> {room.name} is live</strong><a className="secondary-button" href={`/room/${room.address}`}>Watch ↗</a></li>)}
      {!upcoming && !latestReplay && !otherLive.length && <li><strong>Keep the conversation going</strong>{onOpenChat ? <button type="button" className="secondary-button" onClick={onOpenChat}>Open chat</button> : null}<a className="claim-link" href="/discover">Find another room ↗</a></li>}
    </ul>
  </section>;
}
