"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Launch } from "@/lib/types";
import { Header } from "./header";

const tabs = ["Trending", "Rising", "New", "Most HYPR"] as const;
type Tab = (typeof tabs)[number];

function formatUsd(value: number) {
  return value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(1)}m` : `$${(value / 1_000).toFixed(0)}k`;
}

function TokenCard({ token, index }: { token: Launch; index: number }) {
  return (
    <Link href={`/room/${token.address}`} className="token-card">
      <div className="token-card-top"><span className={`rank rank-${index + 1}`}>{String(index + 1).padStart(2, "0")}</span><span className="token-time">{index === 0 ? "active now" : `${token.activeNow} in room`}</span></div>
      <div className="token-identity"><span className="token-logo">{token.logo}</span><div><h3>{token.name}</h3><span className="token-symbol">${token.symbol} <span className="verified">✓</span></span></div></div>
      <div className="token-card-metrics"><div><span>HYPE</span><strong>{token.hype}</strong></div><div><span>MARKET CAP</span><strong>{formatUsd(token.marketCapUsd)}</strong></div><div><span>24H</span><strong className={token.change24h >= 0 ? "positive" : "negative"}>{token.change24h >= 0 ? "+" : ""}{token.change24h}%</strong></div></div>
      <div className="card-footer"><span>{token.holders.toLocaleString()} holders</span><span className="enter-room">Enter room <span>↗</span></span></div>
    </Link>
  );
}

export function DiscoverClient({ initialLaunches }: { initialLaunches: Launch[] }) {
  const [tab, setTab] = useState<Tab>("Trending");
  const [query, setQuery] = useState("");
  const sorted = useMemo(() => {
    const filtered = initialLaunches.filter((item) => `${item.name} ${item.symbol}`.toLowerCase().includes(query.toLowerCase()));
    if (tab === "New") return [...filtered].sort((a, b) => b.launchedAt.localeCompare(a.launchedAt));
    if (tab === "Most HYPR") return [...filtered].sort((a, b) => b.hype - a.hype);
    if (tab === "Rising") return [...filtered].sort((a, b) => b.change24h - a.change24h);
    return filtered;
  }, [initialLaunches, query, tab]);

  return <main><Header /><div className="page-shell">
    <section className="hero"><div className="eyebrow"><span className="pulse" /> LIVE ON ROBINHOOD CHAIN</div><h1>Find the rooms<br /><em>where it’s moving.</em></h1><p>HYPR is the social layer for the next wave of onchain communities. Discover what’s alive, then pull up a seat.</p><div className="hero-actions"><a href="#discover" className="primary-button">Explore rooms <span>↓</span></a><span className="hero-note">Indexing pons launches automatically</span></div></section>
    <section className="signal-strip" aria-label="Network status"><div><span className="signal-label">NETWORK</span><strong>Robinhood Chain</strong></div><div><span className="signal-label">CHAIN ID</span><strong>4663</strong></div><div><span className="signal-label">ROOMS INDEXED</span><strong>1,284</strong></div><div><span className="signal-label">PEOPLE EXPLORING</span><strong><span className="live-number" /> 392</strong></div></section>
    <section id="discover" className="discover-section"><div className="section-heading"><div><span className="eyebrow">THE SIGNAL BOARD</span><h2>What’s alive right now</h2></div><div className="search-wrap"><span>⌕</span><input aria-label="Search tokens" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search rooms" /></div></div><div className="tabs" role="tablist">{tabs.map((item) => <button key={item} className={tab === item ? "selected" : ""} onClick={() => setTab(item)} role="tab" aria-selected={tab === item}>{item}</button>)}</div><div className="token-grid">{sorted.map((token, index) => <TokenCard token={token} index={index} key={token.address} />)}</div>{sorted.length === 0 && <div className="empty-state">No rooms match that search yet.</div>}</section>
    <section id="rooms" className="rooms-callout"><div><span className="eyebrow">NO EMPTY PLATFORM PROBLEM</span><h2>Every launch gets a room.</h2><p>When a token launches through pons, HYPR indexes it and gives the community a place to gather — before anyone goes live.</p></div><div className="callout-orbit"><span>chat</span><span>follow</span><span>share</span><strong>HYPE</strong></div></section>
    <footer className="site-footer"><span className="brand small"><span className="brand-mark">H</span><span>HYPR</span></span><span>Social activity, not investment advice.</span><a href="https://docs.ponsfamily.com" target="_blank" rel="noreferrer">pons docs ↗</a></footer>
  </div></main>;
}
