"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Launch } from "@/lib/types";
import { roomBadge, roomHue, roomKind, roomTickerValue } from "@/lib/room-display";
import { TokenArt, tokenGlyph } from "./token-art";
import { isThrowawayRoom } from "@/lib/discovery";
import type { DiscoveryRoom } from "@/lib/discovery";
import { ShowTime } from "./discovery-room-card";
import { isTestnetDemoRoom } from "@/lib/demo-news";

type HueStyle = React.CSSProperties & { "--hue"?: number; "--angle"?: string };

export function RoomAvatar({ token, size = "md" }: { token: Launch; size?: "sm" | "md" | "lg" | "xl" }) {
  return <span className={`room-avatar is-${size}`} style={{ "--hue": roomHue(token.address) } as HueStyle} aria-hidden="true"><TokenArt seed={token.address} glyph={tokenGlyph(token.logo, token.symbol)} /></span>;
}

/** Home hero: one room shown as a screen. Honest states only: live, next show, or open between shows. */
export function ShowcaseRoom({ room, others }: { room: DiscoveryRoom; others: DiscoveryRoom[] }) {
  const { token, creator, title } = room;
  const live = token.broadcastStatus === "live";
  const show = !live && room.upcoming && creator?.show ? creator.show : null;
  const href = `/room/${token.address}`;
  return <div className="showcase-room" style={{ "--hue": roomHue(token.address) } as HueStyle}>
    <div className="showcase-glow" aria-hidden="true" />
    <Link href={href} className={`showcase-screen${live ? " is-live" : ""}`} aria-label={`${live ? "Watch" : "Visit"} ${title}`}>
      <span className="showcase-art" aria-hidden="true"><TokenArt seed={token.address} /></span>
      <span className="showcase-scrim" aria-hidden="true" />
      <span className="showcase-top">
        {live ? <span className="live-pill"><span className="live-pill-dot" />Live{token.viewerCount ? ` · ${token.viewerCount.toLocaleString()} watching` : ""}</span>
          : show ? <span className="soon-pill">Next show</span> : <span className="idle-pill">Between shows</span>}
      </span>
      <span className="showcase-center" aria-hidden="true"><RoomAvatar token={token} size="xl" /></span>
      <span className="showcase-bottom">
        <span className="showcase-title"><strong>{title}</strong><small>{show ? <>{show.title} · <ShowTime startsAt={show.startsAt} /></> : live ? "On air now. Jump into the chat." : "Open the room, read the chat, follow for the next show."}</small></span>
        <span className="showcase-cta">{live ? "Watch" : "Visit"} <span aria-hidden="true">→</span></span>
      </span>
    </Link>
    <ul className="showcase-features" aria-label="In every room">
      <li><span aria-hidden="true">●</span>Live video</li><li><span aria-hidden="true">💬</span>Room chat</li><li><span aria-hidden="true">🔔</span>Show alerts</li><li><span aria-hidden="true">↺</span>Replays</li>
    </ul>
    {others.length > 0 && <div className="showcase-others"><span>Also on HYPR</span>{others.map(other => <Link key={other.token.address} href={`/room/${other.token.address}`}><RoomAvatar token={other.token} size="sm" />{other.title}{other.token.broadcastStatus === "live" && <em>Live</em>}</Link>)}</div>}
  </div>;
}

export function Ticker({ launches }: { launches: Launch[] }) {
  if (launches.length === 0) return null;
  const loop = launches.length < 6 ? [...launches, ...launches, ...launches] : launches;
  const item = (token: Launch, index: number, hidden: boolean) => {
    const metric = roomTickerValue(token);
    return (
      <Link key={`${hidden ? "b" : "a"}-${token.address}-${index}`} href={`/room/${token.address}`} className="ticker-item" tabIndex={hidden ? -1 : undefined} aria-hidden={hidden || undefined}>
        <RoomAvatar token={token} size="sm" />
        <strong>${token.symbol}</strong>
        <span className={`ticker-metric ${metric.tone || ""}`}>{metric.value}</span>
        <span className="ticker-kind">{roomKind(token) === "sample" ? "sample" : metric.label}</span>
      </Link>
    );
  };
  return (
    <section className="ticker" aria-label="Rooms ticker">
      <div className="ticker-label"><span className="status-dot" /> ONCHAIN FEED</div>
      <div className="ticker-viewport">
        <div className="ticker-track">
          {loop.map((token, index) => item(token, index, index >= launches.length))}
          {loop.map((token, index) => item(token, index, true))}
        </div>
      </div>
    </section>
  );
}

export function CommandPalette({ open, onClose, launches }: { open: boolean; onClose: () => void; launches: Launch[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rooms = launches
      // Scratch-named rooms stay reachable by search but are not suggested unprompted.
      .filter((item) => needle ? `${item.name} ${item.symbol} ${item.address}`.toLowerCase().includes(needle) : isTestnetDemoRoom(item) || !isThrowawayRoom({ token: item, title: item.name }))
      .slice(0, 8)
      .map((token) => ({ key: token.address, href: `/room/${token.address}`, token, title: token.name, hint: roomBadge(token) }));
    const actions = [
      { key: "create", href: "/creators#open-room", token: undefined, title: "Open a room", hint: "Action" },
      { key: "protocol", href: "/protocol", token: undefined, title: "Protocol stats", hint: "Page" },
    ].filter((item) => !needle || item.title.toLowerCase().includes(needle));
    return [...rooms, ...actions];
  }, [launches, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = previous; };
  }, [open]);

  useEffect(() => { setActive(0); }, [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  function go(href: string) {
    onClose();
    router.push(href);
  }

  function onKey(event: React.KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => (value + 1) % Math.max(results.length, 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => (value - 1 + results.length) % Math.max(results.length, 1)); }
    else if (event.key === "Enter" && results[active]) { event.preventDefault(); go(results[active].href); }
  }

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Jump to a room" onMouseDown={(event) => event.stopPropagation()} onKeyDown={onKey}>
        <div className="palette-input">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Jump to a room, symbol, or address…"
            aria-label="Search rooms"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={results[active] ? `palette-${results[active].key}` : undefined}
          />
          <kbd>esc</kbd>
        </div>
        <ul id="palette-results" ref={listRef} className="palette-results" role="listbox">
          {results.map((item, index) => (
            <li
              key={item.key}
              id={`palette-${item.key}`}
              data-index={index}
              role="option"
              aria-selected={index === active}
              className={index === active ? "is-active" : ""}
              onMouseEnter={() => setActive(index)}
              onClick={() => go(item.href)}
            >
              {item.token ? <RoomAvatar token={item.token} size="sm" /> : <span className="palette-action-icon" aria-hidden="true">{item.key === "create" ? "+" : "◎"}</span>}
              <span className="palette-title">{item.title}{item.token && <small>${item.token.symbol}</small>}</span>
              <span className="palette-hint">{item.hint}</span>
              <span className="palette-enter" aria-hidden="true">↵</span>
            </li>
          ))}
          {results.length === 0 && <li className="palette-empty" role="option" aria-selected="false">No rooms match “{query.trim()}”.</li>}
        </ul>
        <div className="palette-footer"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>
      </div>
    </div>
  );
}
