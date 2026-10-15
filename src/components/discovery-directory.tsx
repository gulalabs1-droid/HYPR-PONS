"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Launch } from "@/lib/types";
import type { CombinedLaunchDataSource } from "@/lib/launch-data";
import { broadcastLabel, discoveryFilters, discoveryRooms, isThrowawayRoom, selectDiscoveryRooms, type DiscoveryFilter, type DiscoverySort } from "@/lib/discovery";
import { useLiveLaunches } from "@/lib/use-live-launches";
import { useGrowth } from "@/lib/use-growth";
import { SAVED_ROOMS_EVENT, savedRooms } from "@/lib/saved-rooms";
import { Header } from "./header";
import { SiteFooter } from "./site-footer";
import { TokenArt, tokenGlyph } from "./token-art";
import { DiscoveryRoomCard, ShowTime } from "./discovery-room-card";
import { RoomFaq } from "./room-faq";

const labels: Record<DiscoveryFilter, string> = { all: "Explore the rooms", live: "Live now", upcoming: "Upcoming shows", saved: "Saved rooms" };
const icons: Record<DiscoveryFilter, string> = { all: "✦", live: "◉", upcoming: "◷", saved: "♡" };

export function DiscoveryDirectory({ initialLaunches, source }: { initialLaunches: Launch[]; source: CombinedLaunchDataSource }) {
  const live = useLiveLaunches(initialLaunches, source);
  const growth = useGrowth();
  const params = useSearchParams();
  const rawFilter = params.get("view");
  const filter: DiscoveryFilter = discoveryFilters.includes(rawFilter as DiscoveryFilter) ? rawFilter as DiscoveryFilter : "all";
  const sort: DiscoverySort = params.get("sort") === "name" ? "name" : params.get("sort") === "new" ? "new" : "live";
  const query = params.get("q") || "";
  const includeTestRooms = params.get("tests") === "1";
  const [saved, setSaved] = useState<string[]>([]);
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const refresh = () => setSaved(savedRooms()); refresh(); setClock(Date.now());
    window.addEventListener(SAVED_ROOMS_EVENT, refresh); window.addEventListener("storage", refresh);
    const timer = window.setInterval(() => setClock(Date.now()), 30000);
    return () => { window.removeEventListener(SAVED_ROOMS_EVENT, refresh); window.removeEventListener("storage", refresh); window.clearInterval(timer); };
  }, []);
  const rooms = useMemo(() => discoveryRooms(live.launches, growth.state?.rooms || [], clock || Date.now()), [live.launches, growth.state, clock]);
  const results = useMemo(() => selectDiscoveryRooms(rooms, query, filter, saved, sort, includeTestRooms), [rooms, query, filter, saved, sort, includeTestRooms]);
  const throwaway = rooms.filter(isThrowawayRoom).length;
  const counts = { all: rooms.filter(room => includeTestRooms || !isThrowawayRoom(room)).length, live: rooms.filter(room => room.token.broadcastStatus === "live").length, upcoming: rooms.filter(room => room.upcoming).length, saved: rooms.filter(room => saved.includes(room.token.address.toLowerCase())).length };
  const spotlight = selectDiscoveryRooms(rooms, "", "all", saved, "live")[0];
  const shows = rooms.filter(room => room.upcoming).sort((a, b) => Date.parse(a.creator!.show!.startsAt) - Date.parse(b.creator!.show!.startsAt)).slice(0, 4);
  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value || key === "view" && value === "all" || key === "sort" && value === "live") next.delete(key); else next.set(key, value);
    // Native history integrates with Next's search params without refetching the directory per keystroke.
    window.history.replaceState(null, "", `/discover${next.size ? `?${next}` : ""}`);
  }
  const unavailable = Boolean(live.error) || ["native-error", "rpc-error"].includes(live.source || source);
  return <main className="discovery-hub"><Header active="discover" />
    <div className="discovery-shell">
      <aside className="discovery-sidebar" aria-label="Browse discovery">
        <Link href="/discover" className="discovery-wordmark">THE DISCOVERY ROOM<span>Find your people.</span></Link>
        <div className="discovery-nav" role="group" aria-label="Filter rooms">{discoveryFilters.map(item => <button key={item} aria-pressed={filter === item} onClick={() => update("view", item)}><span aria-hidden="true">{icons[item]}</span><span>{item === "all" ? "Explore" : labels[item]}</span><small>{counts[item]}</small></button>)}</div>
        <div className="discovery-sidebar-note"><span className="eyebrow">WATCH FIRST. COINS OPTIONAL.</span><p>No wallet. No buy-in.<br />Just open a room.</p><Link href="/faq">How HYPR works ↗</Link></div>
        <Link href="/following" className="discovery-library">Your Following library ↗</Link>
      </aside>
      <div className="discovery-main">
        <header className="discovery-heading"><div><span className="eyebrow">CREATORS, NOT JUST TICKERS</span><h1>Find your next<br /><em>“I was there.”</em></h1><p>Live conversations. Familiar faces. A room to come back to.</p></div><span className="discovery-preview-tag">TESTNET PREVIEW</span></header>
        <div className="discovery-search-row"><label className="discovery-search"><span aria-hidden="true">⌕</span><span className="sr-only">Search creators, rooms, coins, or show titles</span><input aria-label="Search creators, rooms, coins, or show titles" type="search" value={query} maxLength={200} placeholder="Find a creator, room, or show…" onChange={event => update("q", event.target.value)} />{query && <button aria-label="Clear search" onClick={() => update("q", "")}>×</button>}</label><label className="discovery-sort"><span className="sr-only">Sort rooms</span><select value={sort} onChange={event => update("sort", event.target.value)}><option value="live">Live first</option><option value="new">Index order</option><option value="name">Name A–Z</option></select></label></div>
        {filter === "all" && !query && <section className={`discovery-spotlight${spotlight ? "" : " is-empty"}`} aria-label="Room spotlight">
          <div className="spotlight-art" aria-hidden="true"><TokenArt seed={spotlight?.token.address || "HYPR-discovery"} glyph={spotlight ? tokenGlyph(spotlight.token.logo, spotlight.token.symbol) : "H"} /><div className="spotlight-art-caption">{spotlight ? "GENERATIVE ROOM ARTWORK" : "YOUR NEXT COMMUNITY STARTS HERE"}</div></div>
          <div className="spotlight-copy"><span className="eyebrow">{spotlight?.token.broadcastStatus === "live" ? "ON AIR NOW" : "BEYOND THE BROADCAST"}</span><h2>{spotlight ? spotlight.title : "The stream ends.\nThe room stays."}</h2><p>{spotlight ? spotlight.description : "Discover a creator, save their room, and have a place to return when they go live again. No token purchase needed."}</p>
            {spotlight ? <><span className={`discovery-status${spotlight.token.broadcastStatus === "live" ? " is-live" : ""}`}>{broadcastLabel(spotlight.token)}</span><Link className="primary-button" href={`/room/${spotlight.token.address}`}>{spotlight.token.broadcastStatus === "live" ? "Watch now" : "Meet the room"} ↗</Link></> : <Link className="primary-button" href="/#launch">Create a coin & room ↗</Link>}
            <small>Room artwork, not recorded footage. No automatic playback.</small>
          </div>
        </section>}
        <div className="discovery-data-line"><span>◉ {counts.live} confirmed live · {rooms.length} indexed {rooms.length === 1 ? "room" : "rooms"}{filter === "all" && !query && throwaway && !includeTestRooms ? ` · ${throwaway} test ${throwaway === 1 ? "room" : "rooms"} hidden from Explore` : ""}</span><Link href="/faq#wallet">First visit? Start here ↗</Link></div>
        <section className="discovery-browse" aria-labelledby="discovery-results-title">
          <div className="discovery-results-heading"><h2 id="discovery-results-title">{labels[filter]}</h2><span role="status" aria-live="polite">{results.length} {results.length === 1 ? "room" : "rooms"}{query ? ` matching “${query}”` : ""}</span></div>
          {filter === "all" && !query && throwaway > 0 && <p className="accounting-copy">{includeTestRooms ? "Showing indexed test rooms. These are real testnet launches, not sample activity." : "Test-named rooms are hidden from Explore, not deleted. Search for one or reveal them below."} <button className="claim-link" type="button" aria-pressed={includeTestRooms} onClick={() => update("tests", includeTestRooms ? "" : "1")}>{includeTestRooms ? "Hide test rooms" : "Show test rooms"}</button></p>}
          {unavailable && <p className="discovery-service-notice" role="status">Room updates are unavailable. Previously loaded rooms may still appear; live status can change. Refresh to retry.</p>}
          {growth.error && <p className="discovery-service-notice" role="status">Creator profiles and schedules could not refresh. Room discovery is still available.</p>}
          {growth.state && !growth.state.enabled && <p className="discovery-service-notice">Creator profiles and schedules are not connected in this environment. Device saves still work.</p>}
          {results.length ? <div className="discovery-card-grid">{results.map(room => <DiscoveryRoomCard room={room} key={room.token.address} />)}</div> : <div className="discovery-empty"><span aria-hidden="true">{icons[filter]}</span><h3>{query ? "No matches. Try a different rabbit hole." : unavailable ? "Discovery is taking a breather." : filter === "live" ? "Between shows. Still your community." : filter === "upcoming" ? "The next show hasn’t been scheduled." : filter === "saved" ? "Your future favorites live here." : throwaway > 0 ? "Only test-named rooms so far." : "No indexed rooms to show yet."}</h3><p>{query ? "Search by creator, room name, coin symbol, or address." : filter === "saved" ? "Save a room from its card. It stays in this browser, without a wallet." : filter === "live" ? "Offline rooms stay open. Find a creator and save a place for next time." : throwaway > 0 ? "Your test rooms are still available. Use Show test rooms above, or search by name, symbol, or address." : "We’ll show real rooms and confirmed broadcasts here—not sample crowds or made-up shows."}</p>{query ? <button className="secondary-button" onClick={() => update("q", "")}>Clear search</button> : filter !== "all" ? <button className="secondary-button" onClick={() => update("view", "all")}>Explore all rooms ↗</button> : <Link className="secondary-button" href="/#launch">Create a coin & room ↗</Link>}</div>}
        </section>
        <section className="discovery-agenda" aria-labelledby="agenda-title"><div className="discovery-results-heading"><div><span className="eyebrow">MAKE IT A REGULAR THING</span><h2 id="agenda-title">On the calendar</h2></div><button onClick={() => update("view", "upcoming")} className="discovery-text-button">Browse shows ↗</button></div>{shows.length ? <div className="discovery-show-list">{shows.map(room => <Link href={`/room/${room.token.address}`} key={room.token.address}><ShowTime startsAt={room.creator!.show!.startsAt} /><strong>{room.creator!.show!.title}</strong><span>{room.title} ↗</span></Link>)}</div> : <div className="discovery-agenda-empty"><span aria-hidden="true">◷</span><div><h3>No upcoming shows announced yet.</h3><p>Creators can schedule their next stream from their room. Times appear here in your local time zone.</p></div></div>}</section>
        <RoomFaq compact />
        <div className="discovery-creator-banner"><div><span className="eyebrow">DON’T JUST GO LIVE. BUILD A HOME.</span><h2>Your people. Your room. Your next show.</h2><p>Create a coin & room, personalize your profile, and schedule a reason to return.</p></div><Link className="primary-button" href="/#launch">Create a room ↗</Link></div>
        <SiteFooter />
      </div>
    </div>
  </main>;
}
