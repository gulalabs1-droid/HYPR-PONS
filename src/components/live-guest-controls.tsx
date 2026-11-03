"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ControlBar, useLocalParticipantPermissions, useParticipantInfo, useParticipants, useRoomContext } from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";
import { GUEST_LIMIT, guestMetadata } from "@/lib/live-guests";
import { getEthereum, shortAddress } from "@/lib/wallet";
import { WALLET_CHANGED_EVENT } from "@/lib/wallet-discovery";
import { COMMUNITY_SIGNED_OUT_EVENT } from "@/lib/growth";

async function changeGuest(path: string, data: Record<string, string>) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), signal: AbortSignal.timeout(12000) });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || "That action could not be completed. Try again.");
}

export function LiveGuestControls({ roomId, role, live, hostSid, authenticated, autoRequest, onSignInAndRequest, onWalletChange }: {
  roomId: string; role: "host" | "viewer"; live: boolean; hostSid?: string; authenticated?: boolean; autoRequest?: boolean;
  onSignInAndRequest: () => Promise<void>; onWalletChange: () => Promise<void>;
}) {
  const room = useRoomContext(), participants = useParticipants(), permissions = useLocalParticipantPermissions();
  const { metadata } = useParticipantInfo({ participant: room.localParticipant });
  const guest = guestMetadata(metadata);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const autoStarted = useRef(false), previousPermission = useRef(false), staleStopped = useRef(false);
  const ownIdentity = room.localParticipant.identity, ownSid = room.localParticipant.sid;
  useEffect(() => { setNotice(""); }, [guest?.guestState]);
  const actor = useCallback((action: string) => changeGuest("/api/community/live-guests", { action, roomId, identity: ownIdentity, sid: ownSid }), [roomId, ownIdentity, ownSid]);
  const stopDevices = useCallback(async () => {
    await Promise.allSettled([Track.Source.Camera, Track.Source.Microphone].map(async source => {
      const publication = room.localParticipant.getTrackPublication(source);
      if (publication?.track) await room.localParticipant.unpublishTrack(publication.track, true);
      else if (source === Track.Source.Camera) await room.localParticipant.setCameraEnabled(false);
      else await room.localParticipant.setMicrophoneEnabled(false);
    }));
  }, [room]);

  useEffect(() => {
    if (role !== "viewer" || !authenticated) return;
    let provider = getEthereum();
    let changed = false;
    const leaveForWalletChange = () => {
      if (changed) return;
      changed = true;
      // Stop sharing immediately; signing out may invalidate the request below.
      void stopDevices().then(() => {
        void actor("leave").catch(() => undefined);
        return onWalletChange();
      }).catch(() => undefined);
    };
    const selectedWalletChanged = () => {
      provider?.removeListener?.("accountsChanged", leaveForWalletChange);
      provider = getEthereum();
      provider?.on?.("accountsChanged", leaveForWalletChange);
      leaveForWalletChange();
    };
    provider?.on?.("accountsChanged", leaveForWalletChange);
    window.addEventListener(WALLET_CHANGED_EVENT, selectedWalletChanged);
    window.addEventListener(COMMUNITY_SIGNED_OUT_EVENT, leaveForWalletChange);
    return () => {
      provider?.removeListener?.("accountsChanged", leaveForWalletChange);
      window.removeEventListener(WALLET_CHANGED_EVENT, selectedWalletChanged);
      window.removeEventListener(COMMUNITY_SIGNED_OUT_EVENT, leaveForWalletChange);
    };
  }, [actor, authenticated, onWalletChange, role, stopDevices]);

  useEffect(() => {
    const allowed = role === "viewer" && permissions?.canPublish === true;
    if (previousPermission.current && !allowed) void stopDevices();
    previousPermission.current = allowed;
    if (allowed && guest?.guestState === "approved" && (!hostSid || guest.hostSid !== hostSid)) {
      void stopDevices();
      if (!staleStopped.current && authenticated && room.state === ConnectionState.Connected) {
        staleStopped.current = true;
        void actor("leave").catch(() => undefined);
      }
    } else staleStopped.current = false;
  }, [actor, authenticated, guest?.guestState, guest?.hostSid, hostSid, permissions?.canPublish, role, room, stopDevices]);

  useEffect(() => {
    if (!autoRequest || autoStarted.current || role !== "viewer" || !authenticated || !live || !ownSid || !guest) return;
    autoStarted.current = true;
    setBusy(true);
    void actor("request").then(() => setNotice("Request sent. The creator can approve or decline it."))
      .catch(error => setNotice(error instanceof Error ? error.message : "Your request could not be sent."))
      .finally(() => setBusy(false));
  }, [actor, authenticated, autoRequest, guest, live, ownSid, role]);

  async function request() {
    setBusy(true); setNotice("");
    try {
      if (!authenticated) await onSignInAndRequest();
      else { await actor("request"); setNotice("Request sent. The creator can approve or decline it."); }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Your request could not be sent."); }
    finally { setBusy(false); }
  }
  async function viewerAction(action: "cancel" | "leave") {
    setBusy(true); setNotice("");
    try {
      if (action === "leave") await stopDevices();
      await actor(action);
      setNotice(action === "leave" ? "You left the stage. You can keep watching." : "Request cancelled.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not update your request."); }
    finally { setBusy(false); }
  }
  async function creatorAction(action: "approve" | "decline" | "revoke", identity: string, sid: string) {
    setBusy(true); setNotice("");
    try { await changeGuest("/api/live/guests", { action, roomId, identity, sid, hostSid: ownSid }); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Guest controls are unavailable."); }
    finally { setBusy(false); }
  }

  if (role === "host") {
    const candidates = participants.flatMap(participant => {
      const info = guestMetadata(participant.metadata);
      return info && info.hostSid === ownSid && ["requested", "approved"].includes(info.guestState) ? [{ participant, info }] : [];
    });
    const onStage = candidates.filter(item => item.info.guestState === "approved"), waiting = candidates.filter(item => item.info.guestState === "requested");
    return <section className="live-guests" aria-label="Manage guests">
      <div className="live-guests-heading"><div><span className="eyebrow">YOUR STAGE</span><h3>Bring your viewers in</h3></div><span>{onStage.length}/{GUEST_LIMIT} guests</span></div>
      <p>Signed-in viewers can request a spot. You decide who joins. Guests choose when to turn on their own camera or microphone.</p>
      {!live && <p className="live-guests-muted">Guest requests open when your broadcast is live.</p>}
      {live && !waiting.length && !onStage.length && <p className="live-guests-empty">No requests yet. Viewers can ask to join from the live player.</p>}
      {(waiting.length > 0 || onStage.length > 0) && <ul className="live-guest-list">{[...waiting, ...onStage].map(({ participant, info }) => <li key={participant.sid}>
        <div><strong>{shortAddress(info.wallet)}</strong><small>{info.guestState === "requested" ? "Wants to join" : "Approved guest"}</small></div>
        <div className="live-guest-actions">{info.guestState === "requested" ? <><button type="button" className="secondary-button" disabled={busy} onClick={() => void creatorAction("decline", participant.identity, participant.sid)}>Decline</button><button type="button" className="primary-button" disabled={busy || !live || onStage.length >= GUEST_LIMIT} onClick={() => void creatorAction("approve", participant.identity, participant.sid)}>Approve</button></> : <button type="button" className="secondary-button" disabled={busy} onClick={() => void creatorAction("revoke", participant.identity, participant.sid)}>Remove from stage</button>}</div>
      </li>)}</ul>}
      <p className="live-guests-muted">HYPR replays and clips capture the creator’s tracks. Guest media may still be recorded by other devices or picked up by a microphone.</p>
      {notice && <p role="status" className="live-notice">{notice}</p>}
    </section>;
  }

  const onStage = guest?.guestState === "approved" && guest.hostSid === hostSid && permissions?.canPublish === true;
  const pending = guest?.guestState === "requested" && guest.hostSid === hostSid;
  return <section className="live-guests" aria-label="Join the live stage">
    <div className="live-guests-heading"><div><span className="eyebrow">JOIN THE SHOW</span><h3>{onStage ? "You’re invited on stage" : pending ? "Your request is waiting" : "Join the live"}</h3></div><span>{onStage ? "APPROVED" : pending ? "REQUESTED" : "GUESTS"}</span></div>
    {onStage ? <>
      <p>Turn on the camera or microphone when you’re ready. Everyone watching can see or hear what you share.</p>
      <ControlBar controls={{ microphone: true, camera: true, screenShare: false, chat: false, leave: false }} saveUserChoices={false} />
      <button className="secondary-button" type="button" disabled={busy} onClick={() => void viewerAction("leave")}>Leave stage · keep watching</button>
      <p className="live-guests-muted">HYPR’s built-in replays and clips capture the creator’s tracks; other people may still record the broadcast.</p>
    </> : pending ? <><p>The creator will decide whether to bring you on. Your camera and microphone are off.</p><button className="secondary-button" type="button" disabled={busy} onClick={() => void viewerAction("cancel")}>Cancel request</button></> : <>
      <p>{guest?.guestState === "declined" ? "Your request was declined. You can ask again." : "The creator approves each guest."} Your camera and microphone stay off until you turn them on.</p>
      <button className="secondary-button" type="button" disabled={busy || !live} onClick={() => void request()}>{busy ? "Preparing request…" : authenticated ? "Request to join" : "Sign in & request to join"}</button>
      {!authenticated && <p className="live-guests-muted">Free wallet sign-in · Your public address is visible in the room.</p>}
    </>}
    {notice && <p role="status" className="live-notice">{notice}</p>}
  </section>;
}
