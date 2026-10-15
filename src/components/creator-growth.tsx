"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AVATARS, BROADCAST_ENDED_EVENT, COMMUNITY_UPDATED_EVENT, localDateTime, showPhase, type GrowthRoom } from "@/lib/growth";
import { analyticsAllowed, shareAttribution } from "@/lib/pilot-analytics";
import { useGrowth } from "@/lib/use-growth";
import { signInCommunity } from "@/lib/community-client";
import { useWalletStatus } from "@/lib/use-wallet-status";
import { walletErrorMessage } from "@/lib/wallet-discovery";
import { ShareRoom } from "./share-room";
import { CreatorAvatar } from "./token-art";

export function ShowTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState(`${iso.replace("T", " ").slice(0, 16)} UTC`);
  useEffect(() => setLabel(new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso))), [iso]);
  return <time dateTime={iso}>{label}</time>;
}

export function UpcomingShow({ room, live = false }: { room: GrowthRoom; live?: boolean }) {
  const show = room.show;
  if (!show) return <p className="accounting-copy">No next show announced. Follow this room and find it again in Following.</p>;
  const phase = showPhase(show, live);
  return <div className="upcoming-show"><span className="eyebrow">{phase === "live" ? "CREATOR LIVE NOW" : phase === "upcoming" ? "NEXT SHOW" : "SCHEDULED TIME HAS PASSED"}</span><h3>{show.title}</h3><ShowTime iso={show.startsAt} />{show.description && <p>{show.description}</p>}
    <p className="accounting-copy">{phase === "awaiting-creator" ? "Waiting for the creator. A scheduled time does not mean the broadcast started." : "Scheduled by the creator. Times are shown in your timezone; watching is free."}</p>
    <a className="secondary-button" href={`/api/community/calendar?roomId=${room.address}&showId=${show.id}`}>Add to calendar ↓</a>
  </div>;
}

export async function saveGrowth(roomId: string, action: string, payload: Record<string, unknown>) {
  await signInCommunity();
  const response = await fetch("/api/community/growth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, action, payload }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Not saved.");
  window.dispatchEvent(new Event(COMMUNITY_UPDATED_EVENT));
}

function ShowEditor({ room, onSave }: { room: GrowthRoom; onSave: (action: string, payload: Record<string, unknown>) => Promise<void> }) {
  const show = room.show;
  const id = useRef(show?.id || "");
  const [title, setTitle] = useState(show?.title || "");
  const [description, setDescription] = useState(show?.description || "");
  const [time, setTime] = useState(show ? localDateTime(show.startsAt) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: string) {
    setBusy(true);
    try {
      if (action === "schedule") {
        if (!id.current) id.current = crypto.randomUUID();
        const startsAt=new Date(time).toISOString();
        if(localDateTime(startsAt)!==time) throw new Error("Invalid local time");
        await onSave(action, { id: id.current, revision: show?.revision || 0, title, description, startsAt });
      } else if (show && window.confirm(action === "cancel" ? "Cancel this scheduled show? Your room stays open." : "Mark this show finished? This updates the schedule, not the live player. End a running broadcast in the player first.")) await onSave(action, { id: show.id, revision: show.revision });
    } catch { setError("Choose a valid local date and time before publishing."); } finally { setBusy(false); }
  }
  return <form className="growth-form" onSubmit={event => { event.preventDefault(); void run("schedule"); }}>
    <h3>{show ? "Edit your next show" : "Schedule your next show"}</h3>
    <label>Show title<input required maxLength={100} value={title} onChange={event => setTitle(event.target.value)} placeholder="What will your community watch?" /></label>
    <label>Description (optional)<textarea maxLength={500} value={description} onChange={event => setDescription(event.target.value)} /></label>
    <label>Start time · your local timezone<input type="datetime-local" required value={time} onChange={event => setTime(event.target.value)} /></label>
    {time && Number.isFinite(Date.parse(time)) && <p className="accounting-copy">Will publish: {new Intl.DateTimeFormat(undefined,{dateStyle:"full",timeStyle:"long"}).format(new Date(time))} · {new Date(time).toISOString()}.</p>}
    <p className="accounting-copy">{Intl.DateTimeFormat().resolvedOptions().timeZone} · schedule within 90 days. This does not turn on your camera, start a broadcast, or send emails.</p>
    <div className="growth-actions"><button className="primary-button" disabled={busy}>{busy ? "Saving…" : show ? "Save show changes" : "Publish show"}</button>{show && <><button type="button" className="secondary-button" disabled={busy} onClick={() => void run("cancel")}>Cancel show</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void run("finish")}>Mark show finished</button></>}</div>
    {error && <p role="alert">{error}</p>}
  </form>;
}

function ProfileEditor({ room, onSave }: { room: GrowthRoom; onSave: (action: string, payload: Record<string, unknown>) => Promise<void> }) {
  const [name, setName] = useState(room.displayName || room.name), [bio, setBio] = useState(room.bio || ""), [avatar, setAvatar] = useState(room.avatar);
  const [moment, setMoment] = useState(room.moment || ""), [busy, setBusy] = useState(false);
  async function save(action: "profile" | "moment") {
    setBusy(true); try { await onSave(action, action === "profile" ? { displayName: name, bio, avatar } : { title: moment }); } finally { setBusy(false); }
  }
  return <>
    <form className="growth-form" onSubmit={event => { event.preventDefault(); void save("profile"); }}><h3>Creator identity</h3><label>Display name<input required maxLength={60} value={name} onChange={event => setName(event.target.value)} /></label><label>About your community<textarea maxLength={500} value={bio} onChange={event => setBio(event.target.value)} /></label><label>Avatar<select value={avatar} onChange={event => setAvatar(event.target.value)}>{AVATARS.map(icon => <option key={icon}>{icon}</option>)}</select></label><button className="secondary-button" disabled={busy}>Save creator profile</button></form>
    <form className="growth-form" onSubmit={event => { event.preventDefault(); void save("moment"); }}><h3>Moment Share Card</h3><p className="accounting-copy">A topic card linking back to your room—not a video clip or replay. Save your profile first. Clear the topic and save to remove the card.</p><label>Moment or topic<input maxLength={100} value={moment} onChange={event => setMoment(event.target.value)} placeholder="A topic worth sharing" /></label><button className="secondary-button" disabled={busy}>Save share card</button></form>
  </>;
}

type Report = { id: string; reason: string; details: string; message: string | null; messageId: string | null };
function CreatorReports({ room, onSave }: { room: GrowthRoom; onSave: (action: string, payload: Record<string, unknown>) => Promise<void> }) {
  const [reports, setReports] = useState<Report[] | null>(null), [error, setError] = useState("");
  async function load() {
    try { const response = await fetch(`/api/community/reports?roomId=${room.address}`, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setReports(data.reports); setError(""); } catch { setError("Report inbox unavailable."); }
  }
  return <div className="growth-form"><h3>Community reports</h3><p className="accounting-copy">Reports are private to this room’s creator. This is not an emergency service or a platform takedown system.</p><button className="secondary-button" onClick={() => void load()}>Check reports</button>{reports?.length === 0 && <p>No unresolved reports.</p>}{reports?.map(report => <div className="growth-report" key={report.id}><strong>{report.reason}</strong><p>{report.details}</p>{report.message && <blockquote>{report.message}</blockquote>}<button className="secondary-button" onClick={async () => { await onSave("resolve-report", { id: report.id, hideMessage: Boolean(report.messageId) }); await load(); }}>{report.messageId ? "Hide message & resolve" : "Mark reviewed"}</button></div>)}{error && <p role="alert">{error}</p>}</div>;
}

export function CreatorGrowth({ roomId, creator, live, growth }: { roomId: string; creator: string; live: boolean; growth: ReturnType<typeof useGrowth> }) {
  const wallet = useWalletStatus();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const room = growth.state?.rooms[0];
  const ownsWallet = wallet.account?.toLowerCase() === creator.toLowerCase();
  useEffect(() => {
    const show = room?.show;
    async function ended(event: Event) {
      if ((event as CustomEvent).detail?.roomId?.toLowerCase() !== roomId.toLowerCase() || !show || Date.parse(show.startsAt) > Date.now() + 15 * 60000) return;
      if (!room?.owned) { setNotice("Broadcast ended. Sign in to mark the scheduled show finished; your next-show listing was not changed."); return; }
      try {
        // Reuse an existing verified session only; ending never opens a wallet prompt.
        const response = await fetch("/api/community/growth", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({roomId,action:"finish",payload:{id:show.id,revision:show.revision}}) });
        if (!response.ok) throw new Error();
        window.dispatchEvent(new Event(COMMUNITY_UPDATED_EVENT)); setNotice("Broadcast ended and the due scheduled show is finished. Your room stays open.");
      } catch { setNotice("Broadcast ended. The schedule update failed; use Mark show finished when connected."); }
    }
    window.addEventListener(BROADCAST_ENDED_EVENT, ended);
    return () => window.removeEventListener(BROADCAST_ENDED_EVENT, ended);
  }, [roomId, room?.show, room?.owned]);
  async function save(action: string, payload: Record<string, unknown>) {
    setNotice(""); try { await saveGrowth(roomId, action, payload); setNotice(action === "report" ? "Report saved for the room creator." : "Saved. Your room link stays the same."); growth.refresh(); } catch (failure) { setNotice(walletErrorMessage(failure)); }
  }
  async function follow() {
    setBusy(true); setNotice("");
    try { await signInCommunity(); const response = await fetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, action: "follow", following: !room?.following, shareId: shareAttribution(), analyticsConsent: analyticsAllowed() }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); window.dispatchEvent(new Event(COMMUNITY_UPDATED_EVENT)); setNotice(room?.following ? "Unfollowed this room." : "Following saved. Find this room and its next show in Following."); growth.refresh(); }
    catch (failure) { setNotice(walletErrorMessage(failure)); } finally { setBusy(false); }
  }
  if (growth.state?.enabled === false) return null;
  return <section className="creator-growth" aria-label="Creator and next show">
    {growth.error && <p className="live-notice" role="status">{growth.error} <button className="claim-link" onClick={growth.refresh}>Retry</button></p>}
    {!room && !growth.error && <p className="accounting-copy">Checking creator and next show…</p>}
    {room && <><div className="creator-profile"><CreatorAvatar seed={room.address} avatar={room.avatar} name={room.displayName || room.name} /><div><span className="eyebrow">CREATOR COMMUNITY</span><h2>{room.displayName || room.name}</h2>{room.bio && <p>{room.bio}</p>}<span className="accounting-copy">{room.followers} wallet follower{room.followers === 1 ? "" : "s"} · associated token remains unchanged</span></div></div><div className="growth-actions"><button className="secondary-button" aria-pressed={room.following} disabled={busy} onClick={() => void follow()}>{busy ? "Saving…" : room.following ? "✓ Following with wallet" : "Follow with wallet"}</button><Link className="secondary-button" href="/following">Go to Following →</Link></div><p className="accounting-copy">Saving needs no wallet and stays in this browser. Wallet follows sync across devices; neither requires buying tokens.</p><UpcomingShow room={room} live={live} />
      {room.moment && <div className="moment-share"><span className="eyebrow">MOMENT SHARE CARD · NOT VIDEO</span><h3>{room.moment}</h3><a href={`/room/${room.address}/moment`}>Open share card →</a><ShareRoom roomId={room.address} name={room.displayName || room.name} moment /></div>}
    </>}
    {ownsWallet && room && <details className="growth-studio"><summary>Creator dashboard · shows, profile & reports</summary><p className="accounting-copy">Use the existing player’s studio to start/end broadcasts. These controls edit only your community and schedule.</p><a className="secondary-button" href="#room-watch">Open broadcast studio ↑</a><Link className="secondary-button" href={`/insights?roomId=${roomId}`}>View pilot insights →</Link><ShareRoom roomId={roomId} name={room.displayName || room.name} /><ShowEditor key={`${room.show?.id || "new"}-${room.show?.revision || 0}`} room={room} onSave={save} /><ProfileEditor room={room} onSave={save} /><CreatorReports room={room} onSave={save} /></details>}
    {notice && <p className="live-notice" role="status">{notice}</p>}
  </section>;
}
