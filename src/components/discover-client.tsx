"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Launch } from "@/lib/types";
import type { CombinedLaunchDataSource } from "@/lib/launch-data";
import { getDisplayNetwork } from "@/lib/network-display";
import { roomBadge, roomCurvePercent, roomHue, roomKind, roomMeter, roomMetrics, type RoomKind } from "@/lib/room-display";
import { CommandPalette, Constellation, RoomAvatar, Ticker } from "./discover-visuals";
import { Header } from "./header";
import { SiteFooter } from "./site-footer";
import { useLiveLaunches } from "@/lib/use-live-launches";
import { GrowthDiscovery } from "./growth-discovery";

const tabs = ["Live first", "Recent activity", "New", "Pool progress"] as const;
type Tab = (typeof tabs)[number];
type Filter = "all" | RoomKind;
type View = "grid" | "list";
type HueStyle = React.CSSProperties & { "--hue"?: number; "--meter"?: string };

const filterLabels: Record<Filter, string> = { all: "All rooms", native: "HYPR-created", pons: "Pons", sample: "Sample" };

function networkEyebrow(source: CombinedLaunchDataSource) {
  if (source === "fixture" || source === "fixture-fallback") return "DEMO MODE · ROBINHOOD CHAIN";
  if (source === "native-error") return "RPC UNAVAILABLE · ROBINHOOD CHAIN";
  if (source === "rpc-error") return "PONS CONFIGURATION ERROR · ROBINHOOD CHAIN";
  if (source === "native-empty") return "TESTNET READY · ROBINHOOD CHAIN";
  if (source === "native-rpc") return "TESTNET PREVIEW · ROBINHOOD CHAIN";
  return "LIVE INDEXED · ROBINHOOD CHAIN";
}

function sourceLabel(source: CombinedLaunchDataSource) {
  if (source === "fixture") return "Demo dataset — no live chain data is being displayed.";
  if (source === "fixture-fallback") return "RPC unavailable — showing clearly labeled demo data.";
  if (source === "rpc-empty") return "Live RPC returned no recent launches in the indexed window.";
  if (source === "rpc-partial") return "RPC launch discovery is live; metadata and social metrics are still partial.";
  if (source === "mixed") return "HYPR and Pons launches read from their configured chains. No sample data.";
  if (source === "native-rpc") return "Live testnet data — coins and reserves are onchain. LIVE means the creator is publishing media. Test ETH has no real value.";
  if (source === "native-empty") return "Native HYPR factory is configured, but no recent native launches were found.";
  if (source === "native-error") return "Native HYPR RPC read failed; no native launch state is being claimed.";
  if (source === "rpc-error") return "Pons version is unsupported or misconfigured; no Pons launch state is being claimed.";
  return "Live indexed data.";
}

function tradeCount(token: Launch) {
  return token.nativeTradeCount ?? token.ponsTradeCount ?? token.trades24h ?? 0;
}

function cardFooter(token: Launch) {
  const kind = roomKind(token);
  if (kind === "native") return "testnet room";
  if (kind === "pons") return "partial onchain data";
  return `${token.holders.toLocaleString()} holders`;
}

function Meter({ token }: { token: Launch }) {
  const meter = roomMeter(token);
  if (!meter) return <div className="room-meter is-empty"><span>Signal</span><em>Indexing…</em></div>;
  return (
    <div className="room-meter" role="progressbar" aria-label={meter.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(meter.percent)} aria-valuetext={meter.text}>
      <div className="room-meter-head"><span>{meter.label}</span><strong>{meter.text}</strong></div>
      <div className="room-meter-track"><span style={{ width: `${meter.percent}%` }} /></div>
    </div>
  );
}

function badgeClass(token: Launch) {
  const kind = roomKind(token);
  return `token-badge${kind === "native" ? " is-native" : kind === "sample" ? " is-demo" : ""}`;
}

function RoomCard({ token, index }: { token: Launch; index: number }) {
  return (
    <Link href={`/room/${token.address}`} className="room-card" style={{ "--hue": roomHue(token.address) } as HueStyle}>
      <span className="room-card-glow" aria-hidden="true" />
      <div className="room-card-top">
        <span className="rank">{String(index + 1).padStart(2, "0")}</span>
        <span className={badgeClass(token)}>{roomBadge(token)}</span>
      </div>
      <div className="room-card-identity">
        <RoomAvatar token={token} size="lg" />
        <div>
          <h3>{token.name}</h3>
          <span className="token-symbol">${token.symbol}{token.dataStatus === "verified" && <span className="verified"> ✓</span>}</span>
        </div>
      </div>
      <Meter token={token} />
      <dl className="room-card-metrics">
        {roomMetrics(token).map((metric) => <div key={metric.label}><dt>{metric.label}</dt><dd className={metric.tone}>{metric.value}</dd></div>)}
      </dl>
      <div className="room-card-footer">
        <span>{cardFooter(token)}</span>
        <span className="enter-room">Enter room <span aria-hidden="true">→</span></span>
      </div>
    </Link>
  );
}

function RoomRow({ token, index }: { token: Launch; index: number }) {
  const meter = roomMeter(token);
  return (
    <Link href={`/room/${token.address}`} className="room-row" style={{ "--hue": roomHue(token.address) } as HueStyle}>
      <span className="rank">{String(index + 1).padStart(2, "0")}</span>
      <RoomAvatar token={token} size="sm" />
      <span className="room-row-name"><strong>{token.name}</strong><small>${token.symbol}</small></span>
      <span className={badgeClass(token)}>{roomBadge(token)}</span>
      <span className="room-row-meter" aria-hidden="true"><span style={{ width: `${meter?.percent ?? 0}%` }} /></span>
      {roomMetrics(token).map((metric) => <span key={metric.label} className="room-row-metric"><small>{metric.label}</small><strong className={metric.tone}>{metric.value}</strong></span>)}
      <span className="room-row-arrow" aria-hidden="true">→</span>
    </Link>
  );
}

function FeaturedRoom({ token }: { token: Launch }) {
  return (
    <Link href={`/room/${token.address}`} className="featured-room" style={{ "--hue": roomHue(token.address) } as HueStyle}>
      <div className="featured-visual" aria-hidden="true">
        <span className="featured-orb" />
        <span className="featured-ring ring-a" />
        <span className="featured-ring ring-b" />
        <span className="featured-logo">{token.logo}</span>
      </div>
      <div className="featured-copy">
        <div className="featured-tags">
          <span className="featured-flag"><span className="status-dot" /> ONCHAIN SPOTLIGHT</span>
          <span className={badgeClass(token)}>{roomBadge(token)}</span>
        </div>
        <h3>{token.name} <span className="token-symbol">${token.symbol}</span></h3>
        <p>{token.description}</p>
        <Meter token={token} />
        <dl className="featured-metrics">
          {roomMetrics(token).map((metric) => <div key={metric.label}><dt>{metric.label}</dt><dd className={metric.tone}>{metric.value}</dd></div>)}
        </dl>
        <span className="primary-button featured-cta">Enter room <span aria-hidden="true">→</span></span>
      </div>
    </Link>
  );
}

export function DiscoverClient({ initialLaunches: seed, source: initialSource, children }: { initialLaunches: Launch[]; source: CombinedLaunchDataSource; children?: React.ReactNode }) {
  const liveData = useLiveLaunches(seed, initialSource);
  const initialLaunches = liveData.launches;
  const source = liveData.source || initialSource;
  const [tab, setTab] = useState<Tab>("Live first");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("grid");
  const [query, setQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || event.metaKey || event.ctrlKey || target?.closest("input, textarea, [contenteditable]")) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const kindCounts = useMemo(() => {
    const counts: Record<Filter, number> = { all: initialLaunches.length, native: 0, pons: 0, sample: 0 };
    for (const token of initialLaunches) counts[roomKind(token)] += 1;
    return counts;
  }, [initialLaunches]);
  const filters = (Object.keys(filterLabels) as Filter[]).filter((key) => key === "all" || kindCounts[key] > 0);

  const sorted = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = initialLaunches.filter((item) =>
      (filter === "all" || roomKind(item) === filter) && `${item.name} ${item.symbol} ${item.address}`.toLowerCase().includes(needle));
    const byRank = (a: Launch, b: Launch) => a.rank - b.rank;
    if (tab === "New") {
      // Native launches have no indexed timestamp but are already ordered newest block first.
      const stamp = (item: Launch) => item.launchedAt || (item.origin === "hypr" ? "9999" : "");
      return [...filtered].sort((a, b) => stamp(b).localeCompare(stamp(a)) || byRank(a, b));
    }
    if (tab === "Pool progress") return [...filtered].sort((a, b) => roomCurvePercent(b) - roomCurvePercent(a) || byRank(a, b));
    if (tab === "Recent activity") return [...filtered].sort((a, b) => tradeCount(b) - tradeCount(a) || byRank(a, b));
    return [...filtered].sort((a, b) => Number(b.broadcastStatus === "live") - Number(a.broadcastStatus === "live") || byRank(a, b));
  }, [filter, initialLaunches, query, tab]);

  const showFeatured = view === "grid" && !query.trim() && sorted.length > 2;
  const featured = showFeatured ? sorted[0] : null;
  const rest = featured ? sorted.slice(1) : sorted;

  function onTabKey(event: React.KeyboardEvent, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
    setTab(tabs[next]);
    tabRefs.current[next]?.focus();
  }

  function onGridPointer(event: React.PointerEvent) {
    const card = (event.target as HTMLElement).closest<HTMLElement>(".room-card, .featured-room");
    if (!card || !gridRef.current?.contains(card)) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    card.style.setProperty("--my", `${event.clientY - rect.top}px`);
  }

  const peopleExploring = initialLaunches.every((item) => item.viewerCount !== undefined) ? initialLaunches.reduce((total, item) => total + (item.viewerCount || 0), 0) : undefined;
  const isDemoSource = source === "fixture" || source === "fixture-fallback";
  const network = getDisplayNetwork(source);
  const broadcastsChecked = initialLaunches.every((launch) => launch.broadcastStatus === "live" || launch.broadcastStatus === "offline");
  const broadcastCount = initialLaunches.filter((launch) => launch.broadcastStatus === "live").length;

  return <main className="discover-page"><Header active="discover" />
    <div className="aurora" aria-hidden="true"><span className="aurora-a" /><span className="aurora-b" /><span className="aurora-c" /></div>
    <div className="page-shell">
      <section className="hero hero-split">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse" /> {networkEyebrow(source)}</div>
          <h1>Find the rooms<br /><em>where it’s moving.</em></h1>
          <p>Watch creators, chat with the community, and explore each room’s coin. Watching is free—no wallet needed.</p>
          <div className="hero-actions">
            <a href="#discover" className="primary-button">Explore rooms <span aria-hidden="true">↓</span></a>
            <a href="#launch" className="secondary-button">Create a coin & room <span aria-hidden="true">+</span></a>
            <button type="button" className="palette-trigger" onClick={() => setPaletteOpen(true)}>
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              Jump to room <kbd>⌘K</kbd>
            </button>
          </div>
          <ol className="hero-steps" aria-label="Explore HYPR">
            <li><strong>01</strong> Find a room</li>
            <li><strong>02</strong> Watch & chat</li>
            <li><strong>03</strong> Trade only if you choose</li>
          </ol>
        </div>
        {initialLaunches.length > 0 && <Constellation launches={initialLaunches} totalRooms={initialLaunches.length} />}
      </section>
    </div>
    <Ticker launches={initialLaunches} />
    <div className="page-shell">
      <details className="discover-data-details"><summary>Live data & network details</summary>
      <section className="signal-strip" aria-label="Network status">
        <div><span className="signal-label">NETWORK</span><strong>{isDemoSource ? "Robinhood Chain · demo" : network.name}</strong></div>
        <div><span className="signal-label">CHAIN ID</span><strong>{isDemoSource ? "—" : network.id}</strong></div>
        <div><span className="signal-label">ROOMS INDEXED</span><strong>{initialLaunches.length.toLocaleString()}</strong></div>
        <div><span className="signal-label">CONNECTED VIEWERS</span><strong>{peopleExploring === undefined ? "—" : peopleExploring.toLocaleString()}</strong></div>
      </section>
      <div className="data-notice" role="status">{sourceLabel(source)}</div>
      <p className="accounting-copy" role="status">{liveData.error || (liveData.updatedAt ? `Auto-refreshing every 15 seconds · checked ${new Date(liveData.updatedAt).toLocaleTimeString()}` : "Checking current broadcast status…")}</p>
      </details>
      {source !== "rpc-partial" && (source === "native-rpc" || source === "native-empty") && <p className="discovery-safety">Testnet preview · Free test assets, not real money.</p>}
      {broadcastsChecked && <p className="accounting-copy">{broadcastCount ? `${broadcastCount} broadcast${broadcastCount === 1 ? "" : "s"} live now.` : "No creators are live right now. Explore a room or create your own."}</p>}
      <GrowthDiscovery launches={initialLaunches} />

      <section id="discover" className="discover-section">
        <div className="section-heading">
          <div><span className="eyebrow">PERSISTENT COMMUNITIES</span><h2>Discover rooms</h2></div>
          <p className="section-sub">Open a room to watch, chat, or learn about its token. A coin can exist even while its creator is offline.</p>
        </div>

        <div className="discover-controls">
          <div className="search-wrap">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input ref={searchRef} type="search" aria-label="Search rooms by name, symbol, or address" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }} placeholder="Search rooms" />
            {query ? <button type="button" className="search-clear" onClick={() => { setQuery(""); searchRef.current?.focus(); }} aria-label="Clear search">×</button> : <kbd aria-hidden="true">/</kbd>}
          </div>
          <div className="segmented" role="tablist" aria-label="Sort rooms" style={{ "--index": tabs.indexOf(tab), "--count": tabs.length } as React.CSSProperties}>
            <span className="segmented-pill" aria-hidden="true" />
            {tabs.map((item, index) => <button key={item} ref={(node) => { tabRefs.current[index] = node; }} id={`tab-${index}`} className={tab === item ? "selected" : ""} onClick={() => setTab(item)} onKeyDown={(event) => onTabKey(event, index)} role="tab" aria-selected={tab === item} aria-controls="discover-results" tabIndex={tab === item ? 0 : -1}>{item}</button>)}
          </div>
          <div className="view-toggle" role="group" aria-label="Layout">
            <button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")} aria-label="Grid view">
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /></svg>
            </button>
            <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")} aria-label="List view">
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="4" rx="2" /><rect x="3" y="10" width="18" height="4" rx="2" /><rect x="3" y="16" width="18" height="4" rx="2" /></svg>
            </button>
          </div>
        </div>

        <div className="filter-row">
          {filters.map((key) => (
            <button key={key} type="button" className={`filter-chip${filter === key ? " is-active" : ""}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {filterLabels[key]} <span>{kindCounts[key]}</span>
            </button>
          ))}
          <span className="tabs-count" aria-live="polite">{sorted.length} {sorted.length === 1 ? "room" : "rooms"}</span>
        </div>

        <div id="discover-results" ref={gridRef} role="tabpanel" aria-labelledby={`tab-${tabs.indexOf(tab)}`} onPointerMove={onGridPointer} key={`${tab}-${filter}-${view}`} className="discover-results">
          {featured && <FeaturedRoom token={featured} />}
          {view === "grid"
            ? <div className="room-grid">{rest.map((token, index) => <RoomCard token={token} index={index + (featured ? 1 : 0)} key={token.address} />)}</div>
            : <div className="room-list">{rest.map((token, index) => <RoomRow token={token} index={index} key={token.address} />)}</div>}
        </div>
        {sorted.length === 0 && (
          <div className="empty-state">
            {query ? <><strong>No rooms match “{query.trim()}”.</strong><button type="button" className="secondary-button" onClick={() => setQuery("")}>Clear search</button></> : <><strong>No rooms yet.</strong><a href="#launch" className="primary-button">Create the first one →</a></>}
          </div>
        )}
      </section>

      {children}

      <section id="rooms" className="rooms-callout">
        <div><span className="eyebrow">FOR CREATORS</span><h2>Your coin. Your live room.</h2><p>Create a testnet coin and community room, then open the studio to preview your devices and go live. Creating a coin does not turn your camera on.</p><a href="#launch" className="primary-button">Create your room →</a></div>
        <div className="callout-orbit" aria-hidden="true"><span>chat</span><span>follow</span><span>share</span><strong>HYPE</strong></div>
      </section>
      <SiteFooter />
    </div>
    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} launches={initialLaunches} />
  </main>;
}
