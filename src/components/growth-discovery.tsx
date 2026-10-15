"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { signInCommunity } from "@/lib/community-client";
import { useGrowth } from "@/lib/use-growth";
import { walletErrorMessage } from "@/lib/wallet-discovery";
import type { Launch } from "@/lib/types";
import type { GrowthRoom } from "@/lib/growth";
import { ShowTime } from "./creator-growth";
import { SAVED_ROOMS_EVENT, savedRooms } from "@/lib/saved-rooms";

export function GrowthDiscovery({ launches, followingOnly = false }: { launches: Launch[]; followingOnly?: boolean }) {
  const { state, error, refresh } = useGrowth();
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [saved,setSaved]=useState<string[]>([]);
  useEffect(()=>{const update=()=>setSaved(savedRooms());update();window.addEventListener(SAVED_ROOMS_EVENT,update);window.addEventListener("storage",update);return()=>{window.removeEventListener(SAVED_ROOMS_EVENT,update);window.removeEventListener("storage",update);};},[]);
  const indexed = new Map(launches.map(launch => [launch.address.toLowerCase(), launch]));
  const fallbackRooms:Pick<GrowthRoom,"address"|"creator"|"name"|"displayName"|"bio"|"avatar"|"following"|"show">[]=launches.filter(launch=>launch.origin==="hypr"&&launch.dataStatus!=="demo").map(launch=>({address:launch.address.toLowerCase(),creator:launch.deployer,name:launch.name,displayName:null,bio:null,avatar:"H",following:false,show:null}));
  const rooms = (state?.enabled ? state.rooms : fallbackRooms).filter(room => !followingOnly || room.following || saved.includes(room.address));
  const live = rooms.filter(room => indexed.get(room.address)?.broadcastStatus === "live");
  const upcoming = rooms.filter(room => room.show).sort((a, b) => Date.parse(a.show!.startsAt) - Date.parse(b.show!.startsAt));
  async function authorize() { setBusy(true); try { await signInCommunity(); refresh(); } catch (failure) { setNotice(walletErrorMessage(failure)); } finally { setBusy(false); } }
  return <section className="growth-discovery" aria-label={followingOnly ? "Your followed rooms and shows" : "Live creators and upcoming shows"}>
    {state?.enabled === false && <p className="accounting-copy">Creator schedules and synced Following are not enabled in this deployment. Device-saved rooms and existing per-room wallet follows remain separate.</p>}
    {error && <p className="live-notice" role="status">{error} <button className="claim-link" onClick={refresh}>Retry</button></p>}
    {!state && !error && <p className="accounting-copy">Checking creator shows…</p>}
    {followingOnly && (state || error) && !state?.wallet && <div className="growth-empty"><h2>Your communities, in one place.</h2><p>Rooms saved on this device appear below—no crypto needed. Clearing browser storage removes device saves, not wallet follows.</p>{state?.enabled&&<button className="secondary-button" disabled={busy} onClick={() => void authorize()}>{busy ? "Check your wallet…" : "Restore wallet follows (optional)"}</button>}</div>}
    {(state || error) && <>
      <div className="growth-section-heading"><h2>Live now</h2>{!followingOnly && <Link href="/following">Your Following →</Link>}</div>
      <div className="growth-card-grid">{live.map(room => <Link className="growth-card" href={`/room/${room.address}`} key={room.address}><span className="eyebrow"><span className="pulse" /> LIVE · PUBLISHED CREATOR MEDIA</span><span className="creator-avatar" aria-hidden="true">{room.avatar}</span><h3>{room.displayName || room.name}</h3><p>{room.bio || "Join the creator’s room. Watching needs no wallet."}</p><span>Watch now →</span></Link>)}</div>
      {live.length === 0 && <p className="accounting-copy">{launches.some(launch => launch.broadcastStatus === "unavailable" || launch.broadcastStatus === "checking") ? "Some broadcast states are unavailable. Open a room to check; no substitute LIVE label is shown." : "No confirmed live broadcasts right now. Rooms and chat stay open between shows."}</p>}
      <div className="growth-section-heading"><h2>Upcoming shows</h2><span className="accounting-copy">Creator schedules · your local time</span></div>
      <div className="growth-card-grid">{upcoming.map(room => <Link className="growth-card" href={`/room/${room.address}`} key={room.address}><span className="eyebrow">{Date.parse(room.show!.startsAt) > Date.now() ? "UPCOMING" : "AWAITING CREATOR · NOT CONFIRMED LIVE"}</span><h3>{room.show!.title}</h3><p>{room.displayName || room.name}</p><ShowTime iso={room.show!.startsAt} /><span>Open permanent room →</span></Link>)}</div>
      {upcoming.length === 0 && <p className="accounting-copy">{state?.enabled?`No upcoming shows announced${followingOnly ? " by your saved/followed rooms" : ""}. No sample schedules are displayed.`:"Upcoming-show data is unavailable until scheduling is enabled."}</p>}
      {followingOnly && <><h2>Saved & followed rooms</h2><div className="growth-card-grid">{rooms.map(room => <Link className="growth-card" href={`/room/${room.address}`} key={room.address}><span className="creator-avatar" aria-hidden="true">{room.avatar}</span><h3>{room.displayName || room.name}</h3><span className="eyebrow">{room.following?"WALLET FOLLOW":"SAVED ON THIS DEVICE"}</span><p>{room.bio || "The room stays open even when the creator is offline."}</p><span>Return to room →</span></Link>)}</div>{rooms.length === 0 && <div className="growth-empty"><p>No saved or followed rooms yet.</p><Link className="secondary-button" href="/">Discover creators →</Link></div>}</>}
    </>}
    {notice && <p className="live-notice" role="alert">{notice}</p>}
  </section>;
}
