"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import type { Launch } from "@/lib/types";
import type { CombinedLaunchDataSource } from "@/lib/launch-data";
import { discoveryRooms, introductoryDemoRoom, isThrowawayRoom, watchLiveRooms } from "@/lib/discovery";
import { useLiveLaunches } from "@/lib/use-live-launches";
import { useGrowth } from "@/lib/use-growth";
import { Header } from "./header";
import { SiteFooter } from "./site-footer";
import { DemoNewsFeed } from "./demo-news-feed";
import { DiscoveryRoomCard, ShowTime } from "./discovery-room-card";

export function WatchHub({ source, initialLaunches, initialSource }: { source: "nbc" | "abc"; initialLaunches: Launch[]; initialSource: CombinedLaunchDataSource }) {
  const live = useLiveLaunches(initialLaunches, initialSource);
  const growth = useGrowth();
  const [shareNotice, setShareNotice] = useState("");
  const rooms = useMemo(() => discoveryRooms(live.launches, growth.state?.rooms || []), [live.launches, growth.state]);
  const creatorsLive = watchLiveRooms(rooms);
  const upcoming = rooms.filter(room => room.upcoming && !isThrowawayRoom(room)).sort((a, b) => Date.parse(a.creator!.show!.startsAt) - Date.parse(b.creator!.show!.startsAt)).slice(0, 3);
  const demoRoom = introductoryDemoRoom(rooms);
  const unavailable = Boolean(live.error) || (live.source || initialSource).endsWith("error") || rooms.some(room => room.token.broadcastStatus === "unavailable");
  const checking = rooms.some(room => room.token.broadcastStatus === "checking");
  const showsUnavailable = Boolean(growth.error) || growth.state?.enabled === false;

  async function share() {
    const url = new URL(source === "abc" ? "/watch?source=abc" : "/watch", window.location.origin).toString();
    try {
      if (navigator.share) { await navigator.share({ title: "Watch on HYPR", text: "Watch independent news and find creator rooms on HYPR.", url }); setShareNotice("Shared."); }
      else { await navigator.clipboard.writeText(url); setShareNotice("Watch link copied."); }
    } catch (error) { if ((error as Error)?.name !== "AbortError") setShareNotice("Copy this page’s address to share it."); }
  }

  return <main className="watch-page"><Header active="watch" />
    <div className="watch-shell">
      <section className="watch-intro">
        <div><span className="eyebrow">THE WATCH ROOM</span><h1>Find something <em>worth watching.</em></h1><p>Independent news and real creator rooms, all in one place. Watching is free and needs no wallet.</p></div>
        <div className="watch-intro-actions"><span className="watch-preview">TESTNET PREVIEW</span><button type="button" className="secondary-button" onClick={() => void share()}>Share watch page ↗</button><span role="status" aria-live="polite">{shareNotice}</span></div>
      </section>
      <div className="watch-layout">
        <section className="watch-stage" aria-labelledby="watch-news-title">
          <div className="watch-section-heading"><div><span className="eyebrow">NEWS · VIA YOUTUBE</span><h2 id="watch-news-title">Choose a news stream.</h2></div><span>Independent broadcasters</span></div>
          <nav className="watch-source-tabs" aria-label="Choose a news source">
            <Link href="/watch" aria-current={source === "nbc" ? "page" : undefined} className={source === "nbc" ? "is-active" : ""}>NBC News</Link>
            <Link href="/watch?source=abc" aria-current={source === "abc" ? "page" : undefined} className={source === "abc" ? "is-active" : ""}>ABC News</Link>
          </nav>
          <div className="watch-player"><DemoNewsFeed source={source} standalone /></div>
          <div className="watch-after-player"><div><strong>Want to join a conversation?</strong><p>The demo room has shared chat and an NBC feed when its creator is offline. Wallet sign-in is needed to chat.</p></div>{demoRoom ? <Link className="secondary-button" href={`/room/${demoRoom.token.address}#room-chat`}>Open demo chat ↗</Link> : <Link className="secondary-button" href="/discover">Explore rooms ↗</Link>}</div>
        </section>
        <aside className="watch-sidebar" aria-label="Creator activity">
          <section><span className="eyebrow">CREATOR ROOMS</span><h2>On HYPR</h2>{creatorsLive.length ? <><p>Creators with a confirmed live broadcast.</p><ul>{creatorsLive.map(room => <li key={room.token.address}><span className="watch-live-dot" aria-hidden="true"/><Link href={`/room/${room.token.address}`}>{room.title} <span>Watch ↗</span></Link></li>)}</ul></> : unavailable ? <p role="status">Creator live status is temporarily unavailable.</p> : checking ? <p role="status">Checking creator live status…</p> : <p>No public creator broadcasts are live right now. Rooms stay open between shows.</p>}<Link href="/discover?view=live">Browse live rooms ↗</Link></section>
          <section><span className="eyebrow">COMING UP</span><h2>Next shows</h2>{showsUnavailable ? <p role="status">Show schedules are temporarily unavailable.</p> : !growth.state ? <p role="status">Checking upcoming shows…</p> : upcoming.length ? <ul className="watch-upcoming">{upcoming.map(room => <li key={room.token.address}><Link href={`/room/${room.token.address}`}><strong>{room.creator!.show!.title}</strong><span>{room.title} · <ShowTime startsAt={room.creator!.show!.startsAt} /></span></Link></li>)}</ul> : <p>No upcoming public shows have been announced.</p>}<Link href="/discover?view=upcoming">See upcoming shows ↗</Link></section>
          <section className="watch-sidebar-creator"><span className="eyebrow">HAVE A SHOW?</span><h2>Make it yours.</h2><p>Start a creator room and give your audience a place to return.</p><Link href="/creators">For creators ↗</Link></section>
        </aside>
      </div>
      {creatorsLive.length > 0 && <section className="watch-live-rooms" aria-labelledby="watch-live-rooms-title"><div className="watch-section-heading"><div><span className="eyebrow">HAPPENING ON HYPR</span><h2 id="watch-live-rooms-title">Creator rooms live now</h2></div><Link href="/discover?view=live">See all ↗</Link></div><div className="discovery-card-grid">{creatorsLive.map(room => <DiscoveryRoomCard key={room.token.address} room={room} />)}</div></section>}
      <SiteFooter />
    </div>
  </main>;
}
