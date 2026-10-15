import React from "react";
import Link from "next/link";
import type { DiscoveryRoom } from "@/lib/discovery";
import { broadcastLabel } from "@/lib/discovery";
import { CreatorAvatar, TokenArt, tokenGlyph } from "./token-art";
import { SaveRoom } from "./save-room";

export function ShowTime({ startsAt }: { startsAt: string }) {
  return <time dateTime={startsAt} suppressHydrationWarning>{new Date(startsAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}</time>;
}

export function DiscoveryRoomCard({ room }: { room: DiscoveryRoom }) {
  const { token, creator, title, description, upcoming } = room;
  const live = token.broadcastStatus === "live";
  return <article className="discovery-card">
    <Link className="discovery-poster" href={`/room/${token.address}`} aria-label={`${live ? "Watch" : "Visit"} ${title}`}>
      <TokenArt seed={token.address} glyph={tokenGlyph(token.logo, token.symbol)} />
      <span className={`discovery-status${live ? " is-live" : ""}`}>{live && <span className="status-dot" />}{broadcastLabel(token)}</span>
      <span className="poster-art-label">Room artwork · not a video preview</span>
      <span className="poster-enter" aria-hidden="true">{live ? "▶" : "↗"}</span>
      {live && token.viewerCount !== undefined && <span className="poster-viewers">{token.viewerCount.toLocaleString()} connected {token.viewerCount === 1 ? "viewer" : "viewers"}</span>}
    </Link>
    <div className="discovery-card-body">
      <div className="discovery-card-identity"><CreatorAvatar seed={token.address} avatar={creator?.avatar || "H"} name={title} /><div><h3><Link href={`/room/${token.address}`}>{title}</Link></h3><span>{token.origin === "hypr" ? "HYPR · Testnet" : "Pons · Indexed room"} <span className="discovery-symbol">${token.symbol}</span></span></div></div>
      <p>{description}</p>
      {upcoming && creator?.show && <div className="discovery-next"><span>UP NEXT · {creator.show.title}</span><ShowTime startsAt={creator.show.startsAt} /></div>}
      <div className="discovery-card-bottom"><Link href={`/room/${token.address}`} className="discovery-room-link">{live ? "Watch stream" : "Open room"} <span aria-hidden="true">↗</span></Link><SaveRoom roomId={token.address} /></div>
    </div>
  </article>;
}
