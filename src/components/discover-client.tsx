"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import type { Launch } from "@/lib/types";
import type { CombinedLaunchDataSource } from "@/lib/launch-data";
import { useLiveLaunches } from "@/lib/use-live-launches";
import { discoveryRooms, selectDiscoveryRooms } from "@/lib/discovery";
import { Header } from "./header";
import { SiteFooter } from "./site-footer";
import { CommandPalette, Constellation } from "./discover-visuals";
import { DiscoveryRoomCard } from "./discovery-room-card";
import { RoomFaq } from "./room-faq";

/** Landing page only. Full discovery lives at /discover, not a scroll anchor. */
export function DiscoverClient({ initialLaunches, source, children }: { initialLaunches: Launch[]; source: CombinedLaunchDataSource; children?: React.ReactNode }) {
  const live = useLiveLaunches(initialLaunches, source);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const rooms = useMemo(() => selectDiscoveryRooms(discoveryRooms(live.launches, []), "", "all", [], "live").slice(0, 3), [live.launches]);
  return <main className="discover-page home-landing"><Header />
    <div className="aurora" aria-hidden="true"><span className="aurora-a" /><span className="aurora-b" /><span className="aurora-c" /></div>
    <div className="page-shell">
      <section className="hero hero-split"><div className="hero-copy">
        <div className="eyebrow"><span className="pulse" /> LIVE CREATORS. LASTING COMMUNITIES.</div>
        <h1>More than a stream.<br /><em>A place to belong.</em></h1>
        <p>Find your creator. Join the conversation. Come back for the next show. Watching is free—coins are optional.</p>
        <div className="hero-actions"><Link href="/discover" className="primary-button">Enter Discover <span aria-hidden="true">↗</span></Link><a href="#launch" className="secondary-button">Create a coin & room +</a><button type="button" className="palette-trigger" onClick={() => setPaletteOpen(true)}>Jump to a room ↗</button></div>
        <ol className="hero-steps" aria-label="Explore HYPR"><li><strong>01</strong> Find your people</li><li><strong>02</strong> Watch & chat</li><li><strong>03</strong> Save & return</li></ol>
      </div>{rooms.length > 0 && <Constellation launches={rooms.map(room => room.token)} totalRooms={discoveryRooms(live.launches, []).length} />}</section>
      <p className="discovery-safety">Robinhood Chain testnet preview · Test assets have no real value. No wallet needed to watch.</p>
      {live.error && <p className="discovery-service-notice" role="status">Live updates are unavailable. Displayed rooms may be out of date.</p>}
      <section className="home-discovery-preview" aria-labelledby="home-discover-title"><div className="section-heading"><div><span className="eyebrow">THE DISCOVERY ROOM</span><h2 id="home-discover-title">Find your next favorite.</h2></div><Link className="secondary-button" href="/discover">Explore all rooms ↗</Link></div>{rooms.length > 0 ? <div className="discovery-card-grid">{rooms.map(room => <DiscoveryRoomCard room={room} key={room.token.address} />)}</div> : <div className="home-discovery-empty"><h3>A dedicated home for discovery.</h3><p>Browse live rooms, planned shows, and your saved favorites—without wading through a trading dashboard.</p><Link href="/discover" className="secondary-button">Open Discover ↗</Link></div>}</section>
      {children}
      <RoomFaq compact />
      <section id="rooms" className="rooms-callout"><div><span className="eyebrow">FOR CREATORS</span><h2>Don’t start over every time you go live.</h2><p>Your room, profile, chat, and next show stay in one place. Create a testnet coin & room, then open your studio. Creating a coin never turns your camera on.</p><a href="#launch" className="primary-button">Create your room →</a></div><div className="callout-orbit" aria-hidden="true"><span>watch</span><span>save</span><span>return</span><strong>HYPR</strong></div></section>
      <SiteFooter />
    </div>
    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} launches={live.launches.filter(token => token.dataStatus !== "demo")} />
  </main>;
}
