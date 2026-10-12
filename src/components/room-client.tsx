"use client";

import Link from "next/link";
import { useState } from "react";
import { formatEther } from "viem";
import type { Launch } from "@/lib/types";
import type { CombinedLaunchDataSource } from "@/lib/launch-data";
import { Header } from "./header";
import { LiveLaunchSurface } from "./live-launch-surface";
import { NativeTradePanel } from "./native-trade-panel";
import { getEthereum, isRobinhoodChainId, shortAddress } from "@/lib/wallet";

function formatUsd(value: number) { return value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(1)}m` : `$${(value / 1_000).toFixed(0)}k`; }
function formatNativeAmount(value?: string) {
  if (!value) return "—";
  try { return `${formatEther(BigInt(value))} ETH`; } catch { return "—"; }
}
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

export function RoomClient({ token, source }: { token: Launch; source: CombinedLaunchDataSource }) {
  const isDemo = token.dataStatus === "demo";
  const isUnverified = token.dataStatus !== "verified";
  const isNative = token.origin === "hypr";
  const hasVerifiedMarketMetrics = token.dataStatus === "verified";
  const [following, setFollowing] = useState(false);
  const [chat, setChat] = useState("");
  const [messages, setMessages] = useState(["gm everyone — this room is early", "the signal is getting louder", "who found this one first?"]);
  const [notice, setNotice] = useState("");

  async function claimRoom() {
    const ethereum = getEthereum();
    if (!ethereum) { setNotice("Connect an EVM wallet to start a verifiable claim."); return; }
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
      const signature = await ethereum.request({ method: "personal_sign", params: [challenge.message, address] });
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
    } catch (error) { setNotice(error instanceof Error ? error.message : "Claim cancelled. No transaction was sent."); }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!chat.trim()) return;
    const ethereum = getEthereum();
    const accounts = ethereum ? (await ethereum.request({ method: "eth_accounts" })) as string[] : [];
    const chainId = ethereum ? Number(await ethereum.request({ method: "eth_chainId" })) : 0;
    if (!accounts[0] || !isRobinhoodChainId(chainId)) {
      setNotice("Connect a wallet on Robinhood Chain or its testnet before chatting.");
      return;
    }
    setMessages((current) => [...current, chat.trim()]);
    setChat("");
  }
  async function share() { try { await navigator.clipboard.writeText(window.location.href); setNotice("Room link copied."); } catch { setNotice("Copy the room URL from your browser to share it."); } }

  return (
    <main>
      <Header />
      <div className="room-shell">
        <Link href="/" className="back-link">← Back to Discover</Link>
        <section className="room-header">
          <div className="room-token-identity">
            <span className="room-logo">{token.logo}</span>
            <div>
              <div className="eyebrow"><span className="pulse" /> COMMUNITY ROOM</div>
              <h1>{token.name} <span>${token.symbol}</span></h1>
              <p>{token.description}</p>
              <span className="address-line">{shortAddress(token.address)} · {roomNetworkLabel(token)}</span>
            </div>
          </div>
          <div className="room-actions">
            <button className={following ? "secondary-button following" : "secondary-button"} onClick={() => setFollowing(!following)}>{following ? "Following" : "Follow room"}</button>
            <button className="secondary-button" onClick={share}>Share ↗</button>
            <button className="primary-button" onClick={claimRoom}>Claim room</button>
          </div>
        </section>
        {isUnverified && <div className="data-notice" role="status">{isDemo ? "Demo" : "Partial"} data — wallet claims, chat, follows, and HYPE persistence are not production-connected yet.</div>}
        <LiveLaunchSurface token={token} />
        {isNative && <NativeTradePanel curveAddress={token.pool} tokenAddress={token.address} tokenSymbol={token.symbol} />}
        {isNative && (
          <section className="activity-panel accounting-panel">
            <div className="panel-heading"><div><span className="eyebrow">PROTOCOL ACCOUNTING</span><h2>Transparent testnet flow</h2></div><span className="live-chip">onchain</span></div>
            <p className="accounting-copy">These are raw curve ledger values, not USD earnings. Testnet ETH has no economic value.</p>
            <div className="accounting-grid">
              <div><span>CREATOR ACCRUAL</span><strong>{formatNativeAmount(token.nativeCreatorFees)}</strong></div>
              <div><span>HYPR ACCRUAL</span><strong>{formatNativeAmount(token.nativeProtocolFees)}</strong></div>
              <div><span>CURVE RESERVE</span><strong>{formatNativeAmount(token.nativeRealQuoteReserve)}</strong></div>
              <div><span>FEE SPLIT</span><strong>{formatFeeBps(token.nativeTotalFeeBps)} total</strong><small>{formatFeeBps(token.nativeCreatorFeeBps)} creator · {formatFeeBps(token.nativeProtocolFeeBps)} HYPR</small></div>
            </div>
          </section>
        )}
        {notice && <div className="notice" role="status">{notice}</div>}
        <section className="room-layout">
          <div className="room-main">
            <div className="hype-panel">
              <div><span className="eyebrow">SOCIAL ACTIVITY SCORE</span><h2>HYPE <strong>{isNative || !hasVerifiedMarketMetrics ? "—" : token.hype}</strong></h2><p>Social activity only — not market cap, token quality, or investment advice.</p></div>
              <div className="hype-ring" style={{ "--hype": `${isNative || !hasVerifiedMarketMetrics ? 0 : token.hype * 3.6}deg` } as React.CSSProperties}><span>{isNative || !hasVerifiedMarketMetrics ? "—" : token.hype}</span></div>
            </div>
            <div className="activity-panel">
              <div className="panel-heading"><div><span className="eyebrow">ROOM ACTIVITY</span><h2>Community pulse</h2></div><span className="live-chip"><span className="pulse" /> {isNative ? token.curvePhase || "onchain" : hasVerifiedMarketMetrics ? `${token.activeNow} here now` : "activity unverified"}</span></div>
              <div className="activity-chart"><div className="chart-line" /><div className="chart-labels"><span>12h ago</span><span>6h ago</span><span>now</span></div></div>
              <div className="stats-grid">
                <div><span>{isNative ? "CURVE PROGRESS" : token.origin === "pons" ? "POOL PRICE" : "PRICE"}</span><strong>{isNative ? (token.curveProgressBps === undefined ? "—" : `${(token.curveProgressBps / 100).toFixed(1)}%`) : token.origin === "pons" ? token.poolPriceQuote === undefined ? "—" : `${token.poolPriceQuote.toPrecision(4)} WETH` : hasVerifiedMarketMetrics ? `$${token.priceUsd.toFixed(4)}` : "—"}</strong></div>
                <div><span>{token.origin === "pons" ? "LIQUIDITY UNITS" : "MARKET CAP"}</span><strong>{token.origin === "pons" ? token.poolLiquidity || "—" : isNative || !hasVerifiedMarketMetrics ? "—" : formatUsd(token.marketCapUsd)}</strong></div>
                <div><span>24H CHANGE</span><strong>{isNative || !hasVerifiedMarketMetrics ? "—" : <span className={token.change24h >= 0 ? "positive" : "negative"}>{token.change24h >= 0 ? "+" : ""}{token.change24h}%</span>}</strong></div>
                <div><span>{isNative ? "TRADES / LOOKBACK" : "SWAPS / LOOKBACK"}</span><strong>{isNative ? (token.nativeTradeCount === undefined ? "—" : token.nativeTradeCount.toLocaleString()) : (token.ponsTradeCount === undefined ? "—" : token.ponsTradeCount.toLocaleString())}</strong></div>
              </div>
            </div>
            <div className="activity-panel onchain">
              <div className="panel-heading"><div><span className="eyebrow">ONCHAIN</span><h2>Recent signals</h2></div><a href={`${explorerBase(token)}/${token.launchTxHash ? `tx/${token.launchTxHash}` : `address/${token.address}`}`} target="_blank" rel="noreferrer">{token.launchTxHash ? "View launch tx ↗" : "View explorer ↗"} </a></div>
              <div className="event-row"><span className="event-icon buy">↗</span><div><strong>{isNative ? "HYPR LaunchCreated indexed" : isDemo ? "Demo launch signal" : "TokenLaunched source indexed"}</strong><span>{isNative ? "Native factory event found; token and curve state are the source of truth." : isDemo ? "Fixture data — verify the token address onchain." : "Launch event read from the pons factory."}</span></div><time>{isNative ? "native" : isDemo ? "demo" : "indexed"}</time></div>
              <div className="event-row"><span className="event-icon trade">◌</span><div><strong>{isNative ? (token.nativeTradeCount === undefined ? "Curve activity" : `${token.nativeTradeCount.toLocaleString()} curve trades indexed`) : isDemo ? "Illustrative trade activity" : token.ponsTradeCount === undefined ? "Pool activity" : `${token.ponsTradeCount} pool swaps indexed`}</strong><span>{isNative ? `Gross quote volume ${formatNativeAmount(token.nativeTradeVolume)} · Curve ${shortAddress(token.pool)}` : `Pool ${shortAddress(token.pool)}${token.poolLiquidity ? ` · liquidity units ${token.poolLiquidity}` : ""}`}</span><small>{isNative && token.curvePhase ? `Phase ${token.curvePhase}${token.graduationTxHash ? " · graduation confirmed" : ""}` : ""}</small></div><time>{isNative ? "native" : isDemo ? "demo" : "indexed"}</time></div>
            </div>
          </div>
          <aside className="room-sidebar">
            <div className="chat-panel">
              <div className="panel-heading"><div><span className="eyebrow">ROOM CHAT · {isDemo ? "DEMO SAMPLE" : "LOCAL PREVIEW"}</span><h2>Say what you see</h2></div><span className="chat-count">{messages.length} local</span></div>
              <div className="chat-messages">{messages.map((message, index) => <div className="message" key={`${message}-${index}`}><span className="avatar">{["✦", "◐", "⌁"][index % 3]}</span><div><strong>{["earlysignal", "mariah", "anon_4663"][index % 3]}</strong><p>{message}</p><time>just now</time></div></div>)}</div>
              <form className="chat-form" onSubmit={sendMessage}><input value={chat} onChange={(event) => setChat(event.target.value)} placeholder="Connect wallet to chat" /><button aria-label="Send message">↑</button></form>
              <span className="chat-footnote">Wallet identity + basic rate limits keep chat human.</span>
            </div>
            <div className="creator-panel"><span className="eyebrow">ROOM CREATOR</span><div className="creator-row"><span className="creator-avatar">{token.logo}</span><div><strong>Unclaimed room</strong><span>Is this your community?</span></div></div><button className="claim-link" onClick={claimRoom}>Prove ownership to claim →</button></div>
          </aside>
        </section>
      </div>
    </main>
  );
}
