"use client";
import React, { useEffect, useRef, useState } from "react";
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
    <div className="hub-form-head"><h3>{show ? "Edit your next show" : "Schedule your next show"}</h3><p>Followers see it in Discover and Following, with an add-to-calendar link.</p></div>
    <label>Show title<input required maxLength={100} value={title} onChange={event => setTitle(event.target.value)} placeholder="What will your community watch?" /></label>
    <label>Description (optional)<textarea maxLength={500} value={description} onChange={event => setDescription(event.target.value)} /></label>
    <label>Start time · your local timezone<input type="datetime-local" required value={time} onChange={event => setTime(event.target.value)} /></label>
    {time && Number.isFinite(Date.parse(time)) && <p className="accounting-copy">Will publish: {new Intl.DateTimeFormat(undefined,{dateStyle:"full",timeStyle:"long"}).format(new Date(time))} · {new Date(time).toISOString()}.</p>}
    <p className="accounting-copy">{Intl.DateTimeFormat().resolvedOptions().timeZone} · schedule within 90 days. This does not turn on your camera, start a broadcast, or send emails.</p>
    <div className="growth-actions"><button className="primary-button" disabled={busy}>{busy ? "Saving…" : show ? "Save show changes" : "Publish show"}</button>{show && <><button type="button" className="secondary-button" disabled={busy} onClick={() => void run("cancel")}>Cancel show</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void run("finish")}>Mark show finished</button></>}</div>
    {error && <p role="alert">{error}</p>}
  </form>;
}

function ProfileForm({ room, onSave }: { room: GrowthRoom; onSave: (action: string, payload: Record<string, unknown>) => Promise<void> }) {
  const [name, setName] = useState(room.displayName || room.name), [bio, setBio] = useState(room.bio || ""), [avatar, setAvatar] = useState(room.avatar), [busy, setBusy] = useState(false);
  async function save() { setBusy(true); try { await onSave("profile", { displayName: name, bio, avatar }); } finally { setBusy(false); } }
  return <form className="growth-form" onSubmit={event => { event.preventDefault(); void save(); }}>
    <div className="hub-form-head"><h3>Creator identity</h3><p>How your room appears in Discover and Following.</p></div>
    <div className="hub-field-row"><label>Display name<input required maxLength={60} value={name} onChange={event => setName(event.target.value)} /></label>
      <fieldset className="avatar-picker"><legend>Avatar</legend>{AVATARS.map(icon => <label key={icon} className={avatar === icon ? "is-selected" : ""}><input type="radio" name="avatar" value={icon} checked={avatar === icon} onChange={() => setAvatar(icon)} /><span aria-hidden="true">{icon}</span><span className="sr-only">{icon}</span></label>)}</fieldset></div>
    <label>About your community<textarea maxLength={500} value={bio} onChange={event => setBio(event.target.value)} placeholder="What your room is about, in a sentence or two." /></label>
    <div className="growth-actions"><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save creator profile"}</button></div>
  </form>;
}

function MomentForm({ room, onSave }: { room: GrowthRoom; onSave: (action: string, payload: Record<string, unknown>) => Promise<void> }) {
  const [moment, setMoment] = useState(room.moment || ""), [busy, setBusy] = useState(false);
  async function save() { setBusy(true); try { await onSave("moment", { title: moment }); } finally { setBusy(false); } }
  return <form className="growth-form" onSubmit={event => { event.preventDefault(); void save(); }}>
    <div className="hub-form-head"><h3>Moment Share Card</h3><p>A topic card linking back to your room—not a video clip or replay. Save your profile first. Clear the topic and save to remove the card.</p></div>
    <label>Moment or topic<input maxLength={100} value={moment} onChange={event => setMoment(event.target.value)} placeholder="A topic worth sharing" /></label>
    <div className="growth-actions"><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save share card"}</button>{room.moment && <Link className="secondary-button" href={`/room/${room.address}/moment`}>Preview card →</Link>}</div>
  </form>;
}

type Report = { id: string; reason: string; details: string; message: string | null; messageId: string | null };
function CreatorReports({ room, onSave }: { room: GrowthRoom; onSave: (action: string, payload: Record<string, unknown>) => Promise<void> }) {
  const [reports, setReports] = useState<Report[] | null>(null), [error, setError] = useState("");
  async function load() {
    try { const response = await fetch(`/api/community/reports?roomId=${room.address}`, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setReports(data.reports); setError(""); } catch { setError("Report inbox unavailable."); }
  }
  return <div className="growth-form"><div className="hub-form-head"><h3>Community reports</h3><p>Reports are private to this room’s creator. This is not an emergency service or a platform takedown system.</p></div><div className="growth-actions"><button className="secondary-button" onClick={() => void load()}>{reports ? "Refresh reports" : "Check reports"}</button></div>{reports?.length === 0 && <p>No unresolved reports.</p>}{reports?.map(report => <div className="growth-report" key={report.id}><strong>{report.reason}</strong><p>{report.details}</p>{report.message && <blockquote>{report.message}</blockquote>}<button className="secondary-button" onClick={async () => { await onSave("resolve-report", { id: report.id, hideMessage: Boolean(report.messageId) }); await load(); }}>{report.messageId ? "Hide message & resolve" : "Mark reviewed"}</button></div>)}{error && <p role="alert">{error}</p>}</div>;
}

type HubTab = "show" | "profile" | "moment" | "reports";
const wentLiveKey = (roomId: string) => `hypr-went-live-${roomId.toLowerCase()}`;

function SetupChecklist({ room, roomId, live, onOpen }: { room: GrowthRoom; roomId: string; live: boolean; onOpen: (tab: HubTab) => void }) {
  const [wentLive, setWentLive] = useState(false);
  useEffect(() => {
    try {
      if (live) window.localStorage.setItem(wentLiveKey(roomId), "1");
      setWentLive(live || window.localStorage.getItem(wentLiveKey(roomId)) === "1");
    } catch { setWentLive(live); }
  }, [live, roomId]);
  const steps: { done: boolean; label: string; action: React.ReactNode }[] = [
    { done: Boolean(room.displayName || room.bio), label: "Name your community", action: <button type="button" className="claim-link" onClick={() => onOpen("profile")}>Edit profile</button> },
    { done: Boolean(room.show), label: "Schedule your first show", action: <button type="button" className="claim-link" onClick={() => onOpen("show")}>Schedule</button> },
    { done: Boolean(room.moment), label: "Make a share card", action: <button type="button" className="claim-link" onClick={() => onOpen("moment")}>Create</button> },
    { done: wentLive, label: "Go live once", action: <a className="claim-link" href="#room-watch">Open studio</a> },
    { done: room.followers >= 10, label: `Reach 10 followers (${Math.min(room.followers, 10)}/10)`, action: <ShareRoom roomId={roomId} name={room.displayName || room.name} /> },
  ];
  const done = steps.filter(step => step.done).length;
  if (done === steps.length) return <p className="hub-setup-done"><span aria-hidden="true">✓</span> Setup complete. Keep a show on the calendar so followers have a reason to return.</p>;
  const next = steps.find(step => !step.done)!;
  return <div className="hub-setup">
    <div className="hub-setup-ring" style={{ "--progress": `${done / steps.length * 360}deg` } as React.CSSProperties} role="img" aria-label={`${done} of ${steps.length} setup steps done`}><span>{done}/{steps.length}</span></div>
    <div className="hub-setup-body">
      <strong>Get your room ready</strong>
      <small>Next: {next.label}</small>
      <ol>{steps.map(step => <li key={step.label} className={step.done ? "is-done" : ""}><span aria-hidden="true">{step.done ? "✓" : ""}</span><span>{step.label}</span>{!step.done && step === next && <span className="hub-setup-action">{step.action}</span>}</li>)}</ol>
    </div>
  </div>;
}

const VIEWER_TIPS_KEY = "hypr-viewer-tips-v1";
function ViewerTips() {
  const [open, setOpen] = useState(false);
  useEffect(() => { try { setOpen(window.localStorage.getItem(VIEWER_TIPS_KEY) !== "done"); } catch { setOpen(false); } }, []);
  if (!open) return null;
  function close() { setOpen(false); try { window.localStorage.setItem(VIEWER_TIPS_KEY, "done"); } catch { /* private mode */ } }
  return <aside className="viewer-tips" aria-label="New to HYPR">
    <div className="viewer-tips-head"><span className="eyebrow">NEW HERE?</span><button type="button" className="live-alerts-close" aria-label="Dismiss tips" onClick={close}>×</button></div>
    <ol>
      <li><span aria-hidden="true">1</span><div><strong>Watch free</strong><small>No wallet, camera or sign-up needed.</small></div></li>
      <li><span aria-hidden="true">2</span><div><strong>Save the room</strong><small>Find it again on this device in Following.</small></div></li>
      <li><span aria-hidden="true">3</span><div><strong>Follow for the next show</strong><small>Then turn on live alerts in Following.</small></div></li>
    </ol>
    <button type="button" className="secondary-button" onClick={close}>Got it</button>
  </aside>;
}

const hubTabs: { key: HubTab; label: string }[] = [{ key: "show", label: "Next show" }, { key: "profile", label: "Profile" }, { key: "moment", label: "Share card" }, { key: "reports", label: "Reports" }];

function CreatorHub({ room, roomId, live, onSave }: { room: GrowthRoom; roomId: string; live: boolean; onSave: (action: string, payload: Record<string, unknown>) => Promise<void> }) {
  const [tab, setTab] = useState<HubTab>("show");
  return <details className="creator-hub" open>
    <summary><span className="hub-title"><span className="hub-badge">ONLY YOU SEE THIS</span><strong>Creator dashboard</strong><small>Shows, profile, share card & reports</small></span><span className="hub-chevron" aria-hidden="true" /></summary>
    <div className="hub-body">
      <SetupChecklist room={room} roomId={roomId} live={live} onOpen={setTab} />
      <div className="hub-actions">
        <a className="hub-action" href="#room-watch"><span aria-hidden="true">◉</span><strong>Go live</strong><small>Open the broadcast studio</small></a>
        <Link className="hub-action" href={`/insights?roomId=${roomId}`}><span aria-hidden="true">↗</span><strong>Insights</strong><small>Return visits & shares</small></Link>
        <div className="hub-action is-share"><span aria-hidden="true">⇪</span><strong>Share room</strong><ShareRoom roomId={roomId} name={room.displayName || room.name} /></div>
      </div>
      <div className="hub-tabs" role="tablist" aria-label="Creator dashboard sections">
        {hubTabs.map(item => <button key={item.key} type="button" role="tab" id={`hub-tab-${item.key}`} aria-selected={tab === item.key} aria-controls="hub-panel" className={tab === item.key ? "selected" : ""} onClick={() => setTab(item.key)}>{item.label}{item.key === "show" && room.show && <i aria-hidden="true" />}</button>)}
      </div>
      <div className="hub-panel" id="hub-panel" role="tabpanel" aria-labelledby={`hub-tab-${tab}`}>
        {tab === "show" && <ShowEditor key={`${room.show?.id || "new"}-${room.show?.revision || 0}`} room={room} onSave={onSave} />}
        {tab === "profile" && <ProfileForm room={room} onSave={onSave} />}
        {tab === "moment" && <MomentForm room={room} onSave={onSave} />}
        {tab === "reports" && <CreatorReports room={room} onSave={onSave} />}
      </div>
      <p className="creator-fineprint">These controls edit only your community and schedule. Start and end broadcasts in the player’s studio.</p>
    </div>
  </details>;
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
    {room && !ownsWallet && <ViewerTips />}
    {room && <>
      <div className="creator-card">
        <div className="creator-profile"><CreatorAvatar seed={room.address} avatar={room.avatar} name={room.displayName || room.name} /><div><span className="eyebrow">CREATOR COMMUNITY</span><h2>{room.displayName || room.name}</h2>{room.bio && <p>{room.bio}</p>}</div></div>
        <div className="creator-card-side">
          <div className="creator-stat"><strong>{room.followers.toLocaleString()}</strong><span>wallet follower{room.followers === 1 ? "" : "s"}</span></div>
          <div className="growth-actions"><button className={`${room.following ? "secondary-button following" : "primary-button"}`} aria-pressed={room.following} disabled={busy} onClick={() => void follow()}>{busy ? "Saving…" : room.following ? "✓ Following with wallet" : "Follow with wallet"}</button><Link className="secondary-button" href="/following">Following →</Link></div>
        </div>
      </div>
      <p className="creator-fineprint">Saving needs no wallet and stays in this browser. Wallet follows sync across devices; neither requires buying tokens. The associated token is unchanged by following.</p>
      <UpcomingShow room={room} live={live} />
      {room.moment && <div className="moment-share"><span className="eyebrow">MOMENT SHARE CARD · NOT VIDEO</span><h3>{room.moment}</h3><div className="growth-actions"><Link className="secondary-button" href={`/room/${room.address}/moment`}>Open share card →</Link><ShareRoom roomId={room.address} name={room.displayName || room.name} moment /></div></div>}
    </>}
    {ownsWallet && room && <CreatorHub room={room} roomId={roomId} live={live} onSave={save} />}
    {notice && <p className="live-notice" role="status">{notice}</p>}
  </section>;
}
