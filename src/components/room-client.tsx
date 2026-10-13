"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { Launch } from "@/lib/types";
import type { CombinedLaunchDataSource } from "@/lib/launch-data";
import { Header } from "./header";
import { LiveLaunchSurface } from "./live-launch-surface";
import { NativeTradePanel } from "./native-trade-panel";
import { SiteFooter } from "./site-footer";
import { Toast } from "./toast";
import { getEthereum, isRobinhoodChainId, personalSignHex, shortAddress } from "@/lib/wallet";
import { formatCurveProgress } from "@/lib/curve-progress";
import { formatEthExact, formatUsd } from "@/lib/format";
import { roomHue } from "@/lib/room-display";
import { useLiveLaunches } from "@/lib/use-live-launches";
import { CommunityPanel } from "./community-panel";

function formatFeeBps(value?: string) {
  if (!value) return "—";
  const bps = Number(value);
  return Number.isFinite(bps) ? `${(bps / 100).toFixed(2)}%` : "—";
}
function roomNetworkLabel(token: Launch) {
  if (token.origin === "pons") return token.dataStatus === "demo" ? "Robinhood Chain · demo" : "Robinhood Chain";
  return process.env.NEXT_PUBLIC_HYPR_NETWORK === "mainnet" ? "Robinhood Chain" : "Robinhood Chain testnet";
}
function explorerBase(token: Launch) {
  if (token.origin === "hypr" && process.env.NEXT_PUBLIC_HYPR_NETWORK !== "mainnet") return "https://explorer.testnet.chain.robinhood.com";
  return "https://robinhoodchain.blockscout.com";
}

export function RoomClient({ token: initialToken, source }: { token: Launch; source?: CombinedLaunchDataSource }) {
  const liveData = useLiveLaunches([initialToken], source);
  const token = liveData.launches.find((launch) => launch.address.toLowerCase() === initialToken.address.toLowerCase()) || initialToken;
  const isDemo = token.dataStatus === "demo";
  const isUnverified = token.dataStatus !== "verified";
  const isNative = token.origin === "hypr";
  const hasVerifiedMarketMetrics = token.dataStatus === "verified";
  const [notice, setNotice] = useState("");
  const [claiming, setClaiming] = useState(false);
  const dismissNotice = useCallback(() => setNotice(""), []);

  async function claimRoom() {
    const ethereum = getEthereum();
    if (!ethereum) { setNotice("Connect an EVM wallet to start a verifiable claim."); return; }
    setClaiming(true);
    try {
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const chainId = Number(await ethereum.request({ method: "eth_chainId" }));
      if (!isRobinhoodChainId(chainId)) { setNotice("Switch to Robinhood Chain (4663) or testnet (46630) before claiming."); return; }
      const address = accounts[0];
      if (!address) { setNotice("No wallet account was returned."); return; }
      const challengeResponse = await fetch("/api/room-claims/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenAddress: token.address, claimantAddress: address, chainId }),
      });
      const challenge = await challengeResponse.json() as { challengeId?: string; message?: string; error?: string };
      if (!challengeResponse.ok || !challenge.challengeId || !challenge.message) throw new Error(challenge.error || "Unable to start the room claim");
      const signature = await ethereum.request({ method: "personal_sign", params: [personalSignHex(challenge.message), address] });
      const verifyResponse = await fetch("/api/room-claims/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: challenge.challengeId, signature }),
      });
      const verification = await verifyResponse.json() as { verified?: boolean; persistence?: "supabase" | "process-local"; error?: string };
      if (!verifyResponse.ok || !verification.verified) throw new Error(verification.error || "Claim verification failed");
      setNotice(verification.persistence === "supabase"
        ? "Creator wallet verified and the room claim was persisted."
        : "Creator wallet verified against the indexed launch. This acknowledgement is process-local until persistence is configured.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Claim cancelled. No transaction was sent.");
    } finally {
      setClaiming(false);
    }
  }

  async function share() {
    const url = window.location.href;
    if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ title: `${token.name} on HYPR`, url }); return; } catch (error) { if ((error as Error)?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); setNotice("Room link copied."); } catch { setNotice("Copy the room URL from your browser to share it."); }
  }

  async function copyAddress() {
    try { await navigator.clipboard.writeText(token.address); setNotice("Token address copied."); } catch { setNotice(token.address); }
  }

  const progressText = formatCurveProgress(token.nativeRealQuoteReserve, token.nativeGraduationThreshold, token.curveProgressBps, token.curvePhase);
  const ringDegrees = isNative
    ? Math.min(360, ((token.curveProgressBps ?? 0) / 10_000) * 360)
    : hasVerifiedMarketMetrics ? token.hype * 3.6 : 0;

  return (
    <main>
      <Header />
      <div className="room-shell room-aura" style={{ "--hue": roomHue(token.address) } as React.CSSProperties}>
        <Link href="/" className="back-link">← Back to Discover</Link>
        <section className="room-header">
          <div className="room-token-identity">
            <span className="room-logo" aria-hidden="true">{token.logo}</span>
            <div>
              <div className="eyebrow"><span className="pulse" /> COMMUNITY ROOM</div>
              <h1>{token.name} <span>${token.symbol}</span></h1>
              <p>{token.description}</p>
              <span className="address-line">
                <button type="button" className="address-copy" onClick={copyAddress} title="Copy token address">{shortAddress(token.address)} <span aria-hidden="true">⧉</span></button>
                <span>· {roomNetworkLabel(token)}</span>
                <a href={`${explorerBase(token)}/address/${token.address}`} target="_blank" rel="noreferrer">Explorer ↗</a>
              </span>
            </div>
          </div>
          <div className="room-actions">
            <button className="secondary-button" onClick={share}>Share ↗</button>
            <button className="secondary-button" onClick={claimRoom} disabled={claiming}>{claiming ? "Check your wallet…" : "Verify creator wallet"}</button>
          </div>
        </section>
        {isUnverified && <div className="data-notice" role="status">Onchain testnet data · broadcast status comes from published media · chat and follows are shared. Unavailable market metrics stay blank; no sample activity is shown.</div>}
        <p className="accounting-copy" role="status">{liveData.error || (liveData.updatedAt ? `Auto-refreshing chain snapshots · last check ${new Date(liveData.updatedAt).toLocaleTimeString()}` : "Refreshing current onchain state…")}</p>
        <LiveLaunchSurface token={token} />
        {isNative && <NativeTradePanel curveAddress={token.pool} tokenAddress={token.address} tokenSymbol={token.symbol} />}
        {isNative && (
          <section className="activity-panel accounting-panel">
            <div className="panel-heading"><div><span className="eyebrow">PROTOCOL ACCOUNTING</span><h2>Transparent testnet flow</h2></div><span className="live-chip">onchain</span></div>
            <p className="accounting-copy">These are unclaimed curve fee balances, not lifetime earnings. Claimed fees return to zero. Testnet ETH has no economic value.</p>
            <div className="accounting-grid">
              <div><span>CREATOR UNCLAIMED</span><strong>{formatEthExact(token.nativeCreatorFees)}</strong></div>
              <div><span>HYPR UNCLAIMED</span><strong>{formatEthExact(token.nativeProtocolFees)}</strong></div>
              <div><span>CURVE RESERVE</span><strong>{formatEthExact(token.nativeRealQuoteReserve)}</strong></div>
              <div><span>FEE SPLIT</span><strong>{formatFeeBps(token.nativeTotalFeeBps)} total</strong><small>{formatFeeBps(token.nativeCreatorFeeBps)} creator · {formatFeeBps(token.nativeProtocolFeeBps)} HYPR</small></div>
            </div>
          </section>
        )}
        <section className="room-layout">
          <div className="room-main">
            <div className="hype-panel">
              {isNative ? (
                <div><span className="eyebrow">GRADUATION PROGRESS</span><h2>Curve <strong>{progressText}</strong></h2><p>Share of the {formatEthExact(token.nativeGraduationThreshold)} reserve needed to graduate to Uniswap v4. Phase: {token.curvePhase === "Live" ? "Active trading curve" : token.curvePhase || "unavailable"}. This is not broadcast status.</p></div>
              ) : (
                <div><span className="eyebrow">SOCIAL ACTIVITY SCORE</span><h2>HYPE <strong>{hasVerifiedMarketMetrics ? token.hype : "—"}</strong></h2><p>Social activity only — not market cap, token quality, or investment advice.</p></div>
              )}
              <div className="hype-ring" style={{ "--hype": `${ringDegrees}deg` } as React.CSSProperties} aria-hidden="true"><span>{isNative ? (token.curvePhase === "Graduated" ? "✓" : "↗") : hasVerifiedMarketMetrics ? token.hype : "—"}</span></div>
            </div>
            <div className="activity-panel">
              <div className="panel-heading"><div><span className="eyebrow">{isNative ? "ONCHAIN CURVE STATE" : "ROOM ACTIVITY"}</span><h2>{isNative ? "Curve snapshot" : "Community pulse"}</h2></div><span className="live-chip">{isNative ? token.curvePhase === "Live" ? "Active curve" : token.curvePhase || "State unavailable" : "Onchain"}</span></div>
              <p className="accounting-copy">Live chain snapshot. Recent trade counts cover the confirmed 2,500-block scan, not lifetime trades or 24 hours. Historical charts and USD prices are unavailable.</p>
              <div className="stats-grid">
                <div><span>{isNative ? "CURVE PROGRESS" : token.origin === "pons" ? "POOL PRICE" : "PRICE"}</span><strong>{isNative ? progressText : token.origin === "pons" ? token.poolPriceQuote === undefined ? "—" : `${token.poolPriceQuote.toPrecision(4)} WETH` : hasVerifiedMarketMetrics ? `$${token.priceUsd.toFixed(4)}` : "—"}</strong></div>
                <div><span>{token.origin === "pons" ? "LIQUIDITY UNITS" : "MARKET CAP"}</span><strong>{token.origin === "pons" ? token.poolLiquidity || "—" : isNative || !hasVerifiedMarketMetrics ? "—" : formatUsd(token.marketCapUsd)}</strong></div>
                <div><span>24H CHANGE</span><strong>{isNative || !hasVerifiedMarketMetrics ? "—" : <span className={token.change24h >= 0 ? "positive" : "negative"}>{token.change24h >= 0 ? "+" : ""}{token.change24h}%</span>}</strong></div>
                <div><span>{isNative ? "TRADES / LOOKBACK" : "SWAPS / LOOKBACK"}</span><strong>{isNative ? (token.nativeTradeCount === undefined ? "—" : token.nativeTradeCount.toLocaleString()) : (token.ponsTradeCount === undefined ? "—" : token.ponsTradeCount.toLocaleString())}</strong></div>
              </div>
            </div>
            <div className="activity-panel onchain">
              <div className="panel-heading"><div><span className="eyebrow">ONCHAIN</span><h2>Recent signals</h2></div><a href={`${explorerBase(token)}/${token.launchTxHash ? `tx/${token.launchTxHash}` : `address/${token.address}`}`} target="_blank" rel="noreferrer">{token.launchTxHash ? "View launch tx ↗" : "View explorer ↗"} </a></div>
              <div className="event-row"><span className="event-icon buy">↗</span><div><strong>{isNative ? "HYPR LaunchCreated indexed" : isDemo ? "Demo launch signal" : "TokenLaunched source indexed"}</strong><span>{isNative ? "Native factory event found; token and curve state are the source of truth." : isDemo ? "Fixture data — verify the token address onchain." : "Launch event read from the pons factory."}</span></div><time>{isNative ? "native" : isDemo ? "demo" : "indexed"}</time></div>
              <div className="event-row"><span className="event-icon trade">◌</span><div><strong>{isNative ? (token.nativeTradeCount === undefined ? "Curve activity" : `${token.nativeTradeCount.toLocaleString()} curve trades indexed`) : isDemo ? "Illustrative trade activity" : token.ponsTradeCount === undefined ? "Pool activity" : `${token.ponsTradeCount} pool swaps indexed`}</strong><span>{isNative ? `Gross quote volume ${formatEthExact(token.nativeTradeVolume)} · Curve ${shortAddress(token.pool)}` : `Pool ${shortAddress(token.pool)}${token.poolLiquidity ? ` · liquidity units ${token.poolLiquidity}` : ""}`}</span>{isNative && token.curvePhase && <small>Phase {token.curvePhase}{token.graduationTxHash ? " · graduation confirmed" : ""}</small>}</div><time>{isNative ? "native" : isDemo ? "demo" : "indexed"}</time></div>
            </div>
          </div>
          <aside className="room-sidebar">
            <CommunityPanel roomId={token.address} creator={token.deployer} />
            <div className="creator-panel"><span className="eyebrow">ROOM CREATOR</span><div className="creator-row"><span className="creator-avatar" aria-hidden="true">{token.logo}</span><div><strong>{isDemo ? "Demo creator" : isNative ? "Onchain creator" : "Indexed creator"}</strong><a href={`${explorerBase(token)}/address/${token.deployer}`} target="_blank" rel="noreferrer">{shortAddress(token.deployer)} ↗</a></div></div><p className="accounting-copy">Only this creator wallet can authorize a native broadcast. Verification does not transfer tokens or withdraw fees.</p></div>
          </aside>
        </section>
        <SiteFooter />
      </div>
      <Toast message={notice} onDismiss={dismissNotice} />
    </main>
  );
}
