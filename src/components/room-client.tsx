"use client";

import Link from "next/link";
import { useState } from "react";
import type { Launch } from "@/lib/types";
import { Header } from "./header";
import { getEthereum, ROBINHOOD_CHAIN_ID, shortAddress } from "@/lib/wallet";

function formatUsd(value: number) { return value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(1)}m` : `$${(value / 1_000).toFixed(0)}k`; }

export function RoomClient({ token }: { token: Launch }) {
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
      if (chainId !== ROBINHOOD_CHAIN_ID) { setNotice("Switch to Robinhood Chain (4663) before claiming."); return; }
      const address = accounts[0];
      const signature = await ethereum.request({ method: "personal_sign", params: [`HYPR room claim\nToken: ${token.address}\nNonce: demo-${Date.now()}`, address] });
      setNotice(`Claim signature received (${String(signature).slice(0, 10)}…). Server verification is next.`);
    } catch { setNotice("Claim cancelled. No transaction was sent."); }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!chat.trim()) return;
    const ethereum = getEthereum();
    const accounts = ethereum ? (await ethereum.request({ method: "eth_accounts" })) as string[] : [];
    const chainId = ethereum ? Number(await ethereum.request({ method: "eth_chainId" })) : 0;
    if (!accounts[0] || chainId !== ROBINHOOD_CHAIN_ID) {
      setNotice("Connect a wallet on Robinhood Chain before chatting.");
      return;
    }
    setMessages((current) => [...current, chat.trim()]);
    setChat("");
  }
  async function share() { try { await navigator.clipboard.writeText(window.location.href); setNotice("Room link copied."); } catch { setNotice("Copy the room URL from your browser to share it."); } }

  return <main><Header /><div className="room-shell"><Link href="/" className="back-link">← Back to Discover</Link><section className="room-header"><div className="room-token-identity"><span className="room-logo">{token.logo}</span><div><div className="eyebrow"><span className="pulse" /> COMMUNITY ROOM</div><h1>{token.name} <span>${token.symbol}</span></h1><p>{token.description}</p><span className="address-line">{shortAddress(token.address)} · Robinhood Chain</span></div></div><div className="room-actions"><button className={following ? "secondary-button following" : "secondary-button"} onClick={() => setFollowing(!following)}>{following ? "Following" : "Follow room"}</button><button className="secondary-button" onClick={share}>Share ↗</button><button className="primary-button" onClick={claimRoom}>Claim room</button></div></section>
    {notice && <div className="notice" role="status">{notice}</div>}
    <section className="room-layout"><div className="room-main"><div className="hype-panel"><div><span className="eyebrow">SOCIAL ACTIVITY SCORE</span><h2>HYPE <strong>{token.hype}</strong></h2><p>Built from real community activity — not market cap.</p></div><div className="hype-ring" style={{"--hype": `${token.hype * 3.6}deg`} as React.CSSProperties}><span>{token.hype}</span></div></div><div className="activity-panel"><div className="panel-heading"><div><span className="eyebrow">ROOM ACTIVITY</span><h2>Community pulse</h2></div><span className="live-chip"><span className="pulse" /> {token.activeNow} here now</span></div><div className="activity-chart"><div className="chart-line" /><div className="chart-labels"><span>12h ago</span><span>6h ago</span><span>now</span></div></div><div className="stats-grid"><div><span>PRICE</span><strong>${token.priceUsd.toFixed(4)}</strong></div><div><span>MARKET CAP</span><strong>{formatUsd(token.marketCapUsd)}</strong></div><div><span>24H CHANGE</span><strong className={token.change24h >= 0 ? "positive" : "negative"}>{token.change24h >= 0 ? "+" : ""}{token.change24h}%</strong></div><div><span>TRADES / 24H</span><strong>{token.trades24h.toLocaleString()}</strong></div></div></div><div className="activity-panel onchain"><div className="panel-heading"><div><span className="eyebrow">ONCHAIN</span><h2>Recent signals</h2></div><a href={`https://robinhoodchain.blockscout.com/address/${token.address}`} target="_blank" rel="noreferrer">View explorer ↗</a></div><div className="event-row"><span className="event-icon buy">↗</span><div><strong>Community activity indexed</strong><span>TokenLaunched source verified by pons factory</span></div><time>now</time></div><div className="event-row"><span className="event-icon trade">◌</span><div><strong>{token.trades24h} trades in the last 24 hours</strong><span>Pool {shortAddress(token.pool)}</span></div><time>live</time></div></div></div><aside className="room-sidebar"><div className="chat-panel"><div className="panel-heading"><div><span className="eyebrow">ROOM CHAT</span><h2>Say what you see</h2></div><span className="chat-count">{messages.length + 18}</span></div><div className="chat-messages">{messages.map((message, index) => <div className="message" key={`${message}-${index}`}><span className="avatar">{["✦", "◐", "⌁"][index % 3]}</span><div><strong>{["earlysignal", "mariah", "anon_4663"][index % 3]}</strong><p>{message}</p><time>just now</time></div></div>)}</div><form className="chat-form" onSubmit={sendMessage}><input value={chat} onChange={(event) => setChat(event.target.value)} placeholder="Connect wallet to chat" /><button aria-label="Send message">↑</button></form><span className="chat-footnote">Wallet identity + basic rate limits keep chat human.</span></div><div className="creator-panel"><span className="eyebrow">ROOM CREATOR</span><div className="creator-row"><span className="creator-avatar">{token.logo}</span><div><strong>Unclaimed room</strong><span>Is this your community?</span></div></div><button className="claim-link" onClick={claimRoom}>Prove ownership to claim →</button></div></aside></section></div></main>;
}
