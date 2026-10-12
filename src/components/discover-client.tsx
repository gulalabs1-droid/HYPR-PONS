"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Launch } from "@/lib/types";
import type { CombinedLaunchDataSource } from "@/lib/launch-data";
import { getDisplayNetwork } from "@/lib/network-display";
import { Header } from "./header";

const tabs = ["Trending", "Rising", "New", "Most HYPR"] as const;
type Tab = (typeof tabs)[number];
function networkEyebrow(source: CombinedLaunchDataSource) {
  if (source === "fixture" || source === "fixture-fallback") return "DEMO MODE · ROBINHOOD CHAIN";
  if (source === "native-error") return "RPC UNAVAILABLE · ROBINHOOD CHAIN";
  if (source === "rpc-error") return "PONS CONFIGURATION ERROR · ROBINHOOD CHAIN";
  if (source === "native-empty") return "TESTNET READY · ROBINHOOD CHAIN";
  return "LIVE INDEXED · ROBINHOOD CHAIN";
}

function formatUsd(value: number) {
  return value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(1)}m` : `$${(value / 1_000).toFixed(0)}k`;
}

function TokenCard({ token, index }: { token: Launch; index: number }) {
  const partial = token.dataStatus === "partial";
  const demo = token.dataStatus === "demo";
  return (
    <Link href={`/room/${token.address}`} className="token-card">
      <div className="token-card-top"><span className={`rank rank-${index + 1}`}>{String(index + 1).padStart(2, "0")}</span><span className="token-time">{partial ? "indexed onchain" : demo ? "sample activity" : index === 0 ? "active now" : `${token.activeNow} in room`}</span></div>
      <div className="token-identity"><span className="token-logo">{token.logo}</span><div><h3>{token.name}</h3><span className="token-symbol">${token.symbol}{token.dataStatus === "verified" && <span className="verified"> ✓</span>}</span></div></div>
      <div className="token-card-metrics"><div><span>HYPE</span><strong>{partial ? "—" : token.hype}</strong></div><div><span>MARKET CAP</span><strong>{partial ? "—" : formatUsd(token.marketCapUsd)}</strong></div><div><span>24H</span><strong className={partial ? "" : token.change24h >= 0 ? "positive" : "negative"}>{partial ? "—" : `${token.change24h >= 0 ? "+" : ""}${token.change24h}%`}</strong></div></div>
      <div className="card-footer"><span>{partial ? "partial onchain data" : `${token.holders.toLocaleString()} holders`}</span><span className="enter-room">Enter room <span>↗</span></span></div>
    </Link>
  );
}

function sourceLabel(source: CombinedLaunchDataSource) {
  if (source === "fixture") return "Demo dataset — no live chain data is being displayed.";
  if (source === "fixture-fallback") return "RPC unavailable — showing clearly labeled demo data.";
  if (source === "rpc-empty") return "Live RPC returned no recent launches in the indexed window.";
  if (source === "rpc-partial") return "RPC launch discovery is live; metadata and social metrics are still partial.";
  if (source === "mixed") return "Combined view: native HYPR launches are onchain; Pons/demo enrichment remains clearly labeled.";
  if (source === "native-empty") return "Native HYPR factory is configured, but no recent native launches were found.";
  if (source === "native-error") return "Native HYPR RPC read failed; no native launch state is being claimed.";
  if (source === "rpc-error") return "Pons version is unsupported or misconfigured; no Pons launch state is being claimed.";
  return "Live indexed data.";
}

export function DiscoverClient({ initialLaunches, source, children }: { initialLaunches: Launch[]; source: CombinedLaunchDataSource; children?: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>("Trending");
  const [query, setQuery] = useState("");
  const sorted = useMemo(() => {
    const filtered = initialLaunches.filter((item) => `${item.name} ${item.symbol}`.toLowerCase().includes(query.toLowerCase()));
    if (tab === "New") return [...filtered].sort((a, b) => b.launchedAt.localeCompare(a.launchedAt));
    if (tab === "Most HYPR") return [...filtered].sort((a, b) => b.hype - a.hype);
    if (tab === "Rising") return [...filtered].sort((a, b) => b.change24h - a.change24h);
    return filtered;
  }, [initialLaunches, query, tab]);

  const peopleExploring = initialLaunches.reduce((total, item) => total + item.activeNow, 0);

  const isDemoSource = source === "fixture" || source === "fixture-fallback";
  const network = getDisplayNetwork(source);
  return <main><Header /><div className="page-shell">
    <section className="hero"><div className="eyebrow"><span className="pulse" /> {networkEyebrow(source)}</div><h1>Find the rooms<br /><em>where it’s moving.</em></h1><p>HYPR is the live launchpad for the next wave of onchain communities. Create, go live, trade, and pull up a seat.</p><div className="hero-actions"><a href="#launch" className="primary-button">Create a launch <span>↗</span></a><a href="#discover" className="secondary-button">Explore rooms <span>↓</span></a></div></section>
    <div className="data-notice" role="status">{sourceLabel(source)}</div>
    {children}
    <section className="signal-strip" aria-label="Network status"><div><span className="signal-label">NETWORK</span><strong>{isDemoSource ? "Robinhood Chain · demo" : network.name}</strong></div><div><span className="signal-label">CHAIN ID</span><strong>{isDemoSource ? "—" : network.id}</strong></div><div><span className="signal-label">ROOMS INDEXED</span><strong>{initialLaunches.length.toLocaleString()}</strong></div><div><span className="signal-label">{isDemoSource ? "PEOPLE IN SAMPLE" : "PEOPLE IN ROOMS"}</span><strong>{isDemoSource ? <><span className="live-number" /> {peopleExploring.toLocaleString()}</> : "—"}</strong></div></section>
    <section id="discover" className="discover-section"><div className="section-heading"><div><span className="eyebrow">THE SIGNAL BOARD</span><h2>What’s alive right now</h2></div><div className="search-wrap"><span>⌕</span><input aria-label="Search tokens" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search rooms" /></div></div><div className="tabs" role="tablist">{tabs.map((item) => <button key={item} className={tab === item ? "selected" : ""} onClick={() => setTab(item)} role="tab" aria-selected={tab === item}>{item}</button>)}</div><div className="token-grid">{sorted.map((token, index) => <TokenCard token={token} index={index} key={token.address} />)}</div>{sorted.length === 0 && <div className="empty-state">No rooms match that search yet.</div>}</section>
    <section id="rooms" className="rooms-callout"><div><span className="eyebrow">NO EMPTY PLATFORM PROBLEM</span><h2>Every launch gets a room.</h2><p>Native HYPR launches create protocol state and a live community destination. Pons launches remain compatible through the clearly labeled discovery path.</p></div><div className="callout-orbit"><span>chat</span><span>follow</span><span>share</span><strong>HYPE</strong></div></section>
    <footer className="site-footer"><span className="brand small"><span className="brand-mark">H</span><span>HYPR</span></span><span>Social activity, not investment advice.</span><a href="https://docs.ponsfamily.com" target="_blank" rel="noreferrer">pons docs ↗</a></footer>
  </div></main>;
}
