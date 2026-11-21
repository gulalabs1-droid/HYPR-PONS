"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import type { Launch } from "@/lib/types";
import type { CombinedLaunchDataSource } from "@/lib/launch-data";
import { useLiveLaunches } from "@/lib/use-live-launches";
import { discoveryRooms, introductoryDemoRoom, selectDiscoveryRooms } from "@/lib/discovery";
import { Header } from "./header";
import { SiteFooter } from "./site-footer";
import { CommandPalette, ShowcaseRoom } from "./discover-visuals";
import { DiscoveryRoomCard } from "./discovery-room-card";
import { RoomFaq } from "./room-faq";

// A room search only helps once there are enough rooms to search.
const PALETTE_MIN_ROOMS = 20;

/** Landing page only. Full discovery lives at /discover, not a scroll anchor. */
export function DiscoverClient({ initialLaunches, source, children }: { initialLaunches: Launch[]; source: CombinedLaunchDataSource; children?: React.ReactNode }) {
  const live = useLiveLaunches(initialLaunches, source);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const catalog = useMemo(() => discoveryRooms(live.launches, []), [live.launches]);
  const rooms = useMemo(() => selectDiscoveryRooms(catalog, "", "all", [], "live").slice(0, 3), [catalog]);
  const introDemo = introductoryDemoRoom(catalog);
  // Keep the hero balanced before public creator rooms exist: orbit the real demo room.
  const heroRooms = rooms.length ? rooms : introDemo ? [introDemo] : [];
  const liveCount = catalog.filter(room => room.token.broadcastStatus === "live").length;
  const featured = heroRooms[0];
  return <main className="discover-page home-landing"><Header active="home" />
    <div className="aurora" aria-hidden="true"><span className="aurora-a" /><span className="aurora-b" /><span className="aurora-c" /></div>
    <div className="page-shell">
      <section className="hero hero-split"><div className="hero-copy">
        <div className="eyebrow hero-kicker">{liveCount > 0 ? <><span className="live-pill-dot" /> {liveCount} {liveCount === 1 ? "room is" : "rooms are"} live now</> : <><span className="pulse" /> Live creator rooms</>}</div>
        <h1>More than a stream.<br /><em>A place to belong.</em></h1>
        <p>Watch your favorite creators live, talk with the room, and come back for the next show. Free to watch. No wallet needed.</p>
        <div className="hero-actions"><Link href={liveCount ? "/discover?view=live" : "/watch"} className="primary-button">{liveCount ? "Watch live" : "Start watching"} <span aria-hidden="true">→</span></Link><Link href="/creators" className="secondary-button">Open your room</Link>{catalog.length >= PALETTE_MIN_ROOMS && <button type="button" className="palette-trigger" onClick={() => setPaletteOpen(true)}>Jump to a room ↗</button>}</div>
        <ul className="hero-trust" aria-label="Good to know"><li>Free to watch</li><li>No wallet needed</li><li>Coins optional</li></ul>
      </div>{featured && <ShowcaseRoom room={featured} others={catalog.filter(room => room.token.address !== featured.token.address && rooms.some(item => item.token.address === room.token.address)).slice(0, 2)} />}</section>
      <p className="discovery-safety">Robinhood Chain testnet preview. Test coins have no real value.</p>
      {live.error && <p className="discovery-service-notice" role="status">Live updates are unavailable. Displayed rooms may be out of date.</p>}
      <section className="home-how" aria-labelledby="home-how-title">
        <div className="section-heading"><div><span className="eyebrow">How HYPR works</span><h2 id="home-how-title">Every creator gets a room that stays open.</h2></div></div>
        <ol className="how-steps">
          <li><span className="how-icon" aria-hidden="true">▶</span><h3>Watch it live</h3><p>Shows stream right in the room. Press play, no account, no download.</p></li>
          <li><span className="how-icon" aria-hidden="true">💬</span><h3>Talk with the room</h3><p>Chat with a nickname, react, vote in polls, and ask to join the creator on camera.</p></li>
          <li><span className="how-icon" aria-hidden="true">🔔</span><h3>Come back next time</h3><p>Follow to get a reminder before the next show. Chat and replays are still there when you return.</p></li>
        </ol>
      </section>
      <section className="home-discovery-preview" aria-labelledby="home-discover-title"><div className="section-heading"><div><span className="eyebrow">Rooms to explore</span><h2 id="home-discover-title">Find your next favorite.</h2></div><div className="home-discovery-actions">{liveCount > 0 && <Link className="home-discovery-live" href="/discover?view=live">● {liveCount} live {liveCount === 1 ? "room" : "rooms"} ↗</Link>}<Link className="secondary-button" href="/discover">Explore all rooms ↗</Link></div></div>{rooms.length > 0 ? <div className="discovery-card-grid">{rooms.map(room => <DiscoveryRoomCard room={room} key={room.token.address} />)}</div> : <div className="home-discovery-empty"><div><h3>{liveCount === 1 ? "A room is live right now." : liveCount > 1 ? `${liveCount} rooms are live right now.` : "New rooms are opening."}</h3><p>{liveCount ? "Live testnet rooms are available to watch, even when test names are hidden from Explore." : "HYPR is in early preview. Visit the demo room above, or open your own room below and be one of the first creators people find here."}</p></div><div className="home-discovery-empty-actions">{liveCount ? <Link href="/discover?view=live" className="primary-button">See live rooms →</Link> : <Link href="/discover?view=upcoming" className="secondary-button">See upcoming shows</Link>}</div></div>}</section>
      {children}
      <RoomFaq compact />
      <section id="rooms" className="rooms-callout"><div><span className="eyebrow">For creators</span><h2>Don’t start over every time you go live.</h2><p>Your room, profile, chat, and next show stay in one place. Create a testnet coin & room, then open your studio. Creating a coin never turns your camera on.</p><Link href="/creators" className="primary-button">See how it works →</Link></div><div className="callout-orbit" aria-hidden="true"><span>go live</span><span>chat</span><span>come back</span><strong>Your room</strong></div></section>
      <SiteFooter />
    </div>
    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} launches={live.launches.filter(token => token.dataStatus !== "demo")} />
  </main>;
}
