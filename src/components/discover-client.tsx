"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Launch } from "@/lib/types";
import type { CombinedLaunchDataSource } from "@/lib/launch-data";
import { getDisplayNetwork } from "@/lib/network-display";
import { formatCurveProgress } from "@/lib/curve-progress";
import { formatEthCompact, formatUsd } from "@/lib/format";
import { Header } from "./header";
import { SiteFooter } from "./site-footer";

const tabs = ["Trending", "Rising", "New", "Most HYPR"] as const;
type Tab = (typeof tabs)[number];
function networkEyebrow(source: CombinedLaunchDataSource) {
  if (source === "fixture" || source === "fixture-fallback") return "DEMO MODE · ROBINHOOD CHAIN";
  if (source === "native-error") return "RPC UNAVAILABLE · ROBINHOOD CHAIN";
  if (source === "rpc-error") return "PONS CONFIGURATION ERROR · ROBINHOOD CHAIN";
  if (source === "native-empty") return "TESTNET READY · ROBINHOOD CHAIN";
  if (source === "native-rpc") return "TESTNET PREVIEW · ROBINHOOD CHAIN";
  return "LIVE INDEXED · ROBINHOOD CHAIN";
}

function tradeCount(token: Launch) {
  return token.nativeTradeCount ?? token.ponsTradeCount ?? token.trades24h ?? 0;
}

function TokenCard({ token, index }: { token: Launch; index: number }) {
  const native = token.origin === "hypr";
  const partial = token.dataStatus === "partial";
  const demo = token.dataStatus === "demo";
  const progress = native ? formatCurveProgress(token.nativeRealQuoteReserve, token.nativeGraduationThreshold, token.curveProgressBps, token.curvePhase) : null;
  const progressWidth = native && token.curveProgressBps !== undefined ? Math.min(100, token.curveProgressBps / 100) : 0;
  const metrics: [string, string, string?][] = native
    ? [
      ["CURVE", progress || "—"],
      ["RESERVE", formatEthCompact(token.nativeRealQuoteReserve)],
      ["TRADES", token.nativeTradeCount === undefined ? "—" : token.nativeTradeCount.toLocaleString()],
    ]
    : partial
      ? [
        ["POOL PRICE", token.poolPriceQuote === undefined ? "—" : `${token.poolPriceQuote.toPrecision(3)} WETH`],
        ["SWAPS", token.ponsTradeCount === undefined ? "—" : token.ponsTradeCount.toLocaleString()],
        ["24H", "—"],
      ]
      : [
        ["HYPE", String(token.hype)],
        ["MARKET CAP", formatUsd(token.marketCapUsd)],
        ["24H", `${token.change24h >= 0 ? "+" : ""}${token.change24h}%`, token.change24h >= 0 ? "positive" : "negative"],
      ];
  return (
    <Link href={`/room/${token.address}`} className="token-card">
      <div className="token-card-top">
        <span className={`rank rank-${index + 1}`}>{String(index + 1).padStart(2, "0")}</span>
        <span className={`token-badge${native ? " is-native" : demo ? " is-demo" : ""}`}>{native ? `Native · ${token.curvePhase || "testnet"}` : demo ? "Sample data" : partial ? "Indexed onchain" : `${token.activeNow} in room`}</span>
      </div>
      <div className="token-identity">
        <span className="token-logo" aria-hidden="true">{token.logo}</span>
        <div>
          <h3>{token.name}</h3>
          <span className="token-symbol">${token.symbol}{token.dataStatus === "verified" && <span className="verified"> ✓</span>}</span>
        </div>
      </div>
      <div className="token-card-metrics">
        {metrics.map(([label, value, tone]) => <div key={label}><span>{label}</span><strong className={tone}>{value}</strong></div>)}
      </div>
      {native && (
        <div className="curve-bar" role="progressbar" aria-label="Graduation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressWidth} aria-valuetext={progress || undefined}>
          <span style={{ width: `${progressWidth}%` }} />
        </div>
      )}
      <div className="card-footer">
        <span>{native ? "to graduation" : partial ? "partial onchain data" : `${token.holders.toLocaleString()} holders`}</span>
        <span className="enter-room">Enter room <span aria-hidden="true">→</span></span>
      </div>
    </Link>
  );
}

function sourceLabel(source: CombinedLaunchDataSource) {
  if (source === "fixture") return "Demo dataset — no live chain data is being displayed.";
  if (source === "fixture-fallback") return "RPC unavailable — showing clearly labeled demo data.";
  if (source === "rpc-empty") return "Live RPC returned no recent launches in the indexed window.";
  if (source === "rpc-partial") return "RPC launch discovery is live; metadata and social metrics are still partial.";
  if (source === "mixed") return "Combined view: native HYPR launches are onchain; Pons/demo enrichment remains clearly labeled.";
  if (source === "native-rpc") return "Testnet preview — these coins exist on Robinhood testnet. Test assets have no real value; social features are still previews.";
  if (source === "native-empty") return "Native HYPR factory is configured, but no recent native launches were found.";
  if (source === "native-error") return "Native HYPR RPC read failed; no native launch state is being claimed.";
  if (source === "rpc-error") return "Pons version is unsupported or misconfigured; no Pons launch state is being claimed.";
  return "Live indexed data.";
}

export function DiscoverClient({ initialLaunches, source, children }: { initialLaunches: Launch[]; source: CombinedLaunchDataSource; children?: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>("Trending");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || event.metaKey || event.ctrlKey || target?.closest("input, textarea, [contenteditable]")) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sorted = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = initialLaunches.filter((item) => `${item.name} ${item.symbol} ${item.address}`.toLowerCase().includes(needle));
    const byRank = (a: Launch, b: Launch) => a.rank - b.rank;
    if (tab === "New") {
      // Native launches have no indexed timestamp but are already ordered newest block first.
      const stamp = (item: Launch) => item.launchedAt || (item.origin === "hypr" ? "9999" : "");
      return [...filtered].sort((a, b) => stamp(b).localeCompare(stamp(a)) || byRank(a, b));
    }
    if (tab === "Most HYPR") return [...filtered].sort((a, b) => b.hype - a.hype || (b.curveProgressBps ?? 0) - (a.curveProgressBps ?? 0) || byRank(a, b));
    if (tab === "Rising") return [...filtered].sort((a, b) => b.change24h - a.change24h || tradeCount(b) - tradeCount(a) || byRank(a, b));
    return filtered;
  }, [initialLaunches, query, tab]);

  function onTabKey(event: React.KeyboardEvent, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
    setTab(tabs[next]);
    tabRefs.current[next]?.focus();
  }

  const peopleExploring = initialLaunches.reduce((total, item) => total + item.activeNow, 0);
  const isDemoSource = source === "fixture" || source === "fixture-fallback";
  const network = getDisplayNetwork(source);

  return <main><Header active="discover" /><div className="page-shell">
    <section className="hero">
      <div className="eyebrow"><span className="pulse" /> {networkEyebrow(source)}</div>
      <h1>Find the rooms<br /><em>where it’s moving.</em></h1>
      <p>HYPR is the live launchpad for the next wave of onchain communities. Create, go live, trade, and pull up a seat.</p>
      <div className="hero-actions">
        <a href="#launch" className="primary-button">Create a launch <span aria-hidden="true">→</span></a>
        <a href="#discover" className="secondary-button">Explore rooms <span aria-hidden="true">↓</span></a>
      </div>
      <ol className="hero-steps" aria-label="How HYPR works">
        <li><strong>01</strong> Name your coin</li>
        <li><strong>02</strong> Approve in your wallet</li>
        <li><strong>03</strong> Open your live room</li>
      </ol>
    </section>
    <div className="data-notice" role="status">{sourceLabel(source)}</div>
    {children}
    <section className="signal-strip" aria-label="Network status">
      <div><span className="signal-label">NETWORK</span><strong>{isDemoSource ? "Robinhood Chain · demo" : network.name}</strong></div>
      <div><span className="signal-label">CHAIN ID</span><strong>{isDemoSource ? "—" : network.id}</strong></div>
      <div><span className="signal-label">ROOMS INDEXED</span><strong>{initialLaunches.length.toLocaleString()}</strong></div>
      <div><span className="signal-label">{isDemoSource ? "PEOPLE IN SAMPLE" : "PEOPLE IN ROOMS"}</span><strong>{isDemoSource ? <><span className="live-number" /> {peopleExploring.toLocaleString()}</> : "—"}</strong></div>
    </section>
    <section id="discover" className="discover-section">
      <div className="section-heading">
        <div><span className="eyebrow">THE SIGNAL BOARD</span><h2>What’s alive right now</h2></div>
        <div className="search-wrap">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input ref={searchRef} type="search" aria-label="Search rooms by name, symbol, or address" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }} placeholder="Search rooms" />
          {query ? <button type="button" className="search-clear" onClick={() => { setQuery(""); searchRef.current?.focus(); }} aria-label="Clear search">×</button> : <kbd aria-hidden="true">/</kbd>}
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Sort rooms">
        {tabs.map((item, index) => <button key={item} ref={(node) => { tabRefs.current[index] = node; }} id={`tab-${index}`} className={tab === item ? "selected" : ""} onClick={() => setTab(item)} onKeyDown={(event) => onTabKey(event, index)} role="tab" aria-selected={tab === item} aria-controls="discover-results" tabIndex={tab === item ? 0 : -1}>{item}</button>)}
        <span className="tabs-count" aria-live="polite">{sorted.length} {sorted.length === 1 ? "room" : "rooms"}</span>
      </div>
      <div id="discover-results" className="token-grid" role="tabpanel" aria-labelledby={`tab-${tabs.indexOf(tab)}`}>
        {sorted.map((token, index) => <TokenCard token={token} index={index} key={token.address} />)}
      </div>
      {sorted.length === 0 && (
        <div className="empty-state">
          {query ? <><strong>No rooms match “{query.trim()}”.</strong><button type="button" className="secondary-button" onClick={() => setQuery("")}>Clear search</button></> : <><strong>No rooms yet.</strong><a href="#launch" className="primary-button">Create the first one →</a></>}
        </div>
      )}
    </section>
    <section id="rooms" className="rooms-callout">
      <div><span className="eyebrow">NO EMPTY PLATFORM PROBLEM</span><h2>Every launch gets a room.</h2><p>Native HYPR launches create protocol state and a live community destination. Pons launches remain compatible through the clearly labeled discovery path.</p><a href="#launch" className="primary-button">Start yours →</a></div>
      <div className="callout-orbit" aria-hidden="true"><span>chat</span><span>follow</span><span>share</span><strong>HYPE</strong></div>
    </section>
    <SiteFooter />
  </div></main>;
}
