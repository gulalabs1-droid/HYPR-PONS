import { TrackSource } from "livekit-server-sdk";
import { GUEST_IDENTITY, GUEST_LIMIT, PARTICIPANT_SID, guestMetadata, type GuestMetadata } from "./live-guests";
import type { HostCapability } from "./live-host-auth";

export type GuestParticipant = { identity: string; sid: string; metadata?: string; tracks: { muted: boolean }[]; permission?: { canPublish: boolean } };
export type GuestService = {
  listParticipants(room: string): Promise<GuestParticipant[]>;
  updateParticipant(room: string, identity: string, options: { metadata: string; permission?: { canPublish: boolean; canSubscribe: boolean; canPublishData: boolean; canPublishSources?: TrackSource[] } }): Promise<unknown>;
  removeParticipant(room: string, identity: string, options: { revokeTokenTs: bigint }): Promise<void>;
  deleteRoom(room: string): Promise<void>;
};
export type GuestAction = "request" | "cancel" | "leave" | "approve" | "decline" | "revoke" | "close";
export type GuestInput = { roomId: string; action: GuestAction; identity?: string; sid?: string; hostSid?: string };

const noPublish = { canPublish: false, canSubscribe: true, canPublishData: true };
const canPublish = { canPublish: true, canSubscribe: true, canPublishData: true, canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE] };

export class GuestActionError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function hostRole(metadata?: string): { role?: string; controlId?: string } {
  try { const value = JSON.parse(metadata || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; }
}
function currentHost(participants: GuestParticipant[]) {
  return participants.find(p => hostRole(p.metadata).role === "host");
}
function validInput(input: GuestInput) {
  return /^0x[a-fA-F0-9]{40}$/.test(input.roomId) && ["request", "cancel", "leave", "approve", "decline", "revoke", "close"].includes(input.action) &&
    (input.action === "close" || typeof input.identity === "string" && GUEST_IDENTITY.test(input.identity) && typeof input.sid === "string" && PARTICIPANT_SID.test(input.sid));
}

/** All authorization and state transitions run on the server, never from data packets. */
export async function performGuestAction(service: GuestService, roomName: string, input: GuestInput, actor: { wallet?: string; host?: HostCapability }) {
  if (!validInput(input)) throw new GuestActionError("Invalid guest request.", 400);
  const roomId = input.roomId.toLowerCase(), participants = await service.listParticipants(roomName);
  const host = currentHost(participants);
  const hostAction = ["approve", "decline", "revoke", "close"].includes(input.action);
  if (hostAction) {
    const capability = actor.host;
    if (!capability || capability.roomId !== roomId || !host || !input.hostSid || !PARTICIPANT_SID.test(input.hostSid) ||
      host.sid !== input.hostSid || host.identity !== `host-${capability.wallet}` || hostRole(host.metadata).controlId !== capability.controlId)
      throw new GuestActionError("Creator authorization expired or the broadcast changed. Reopen your studio.", 403);
    if (input.action === "close") {
      const approved = participants.filter(p => { const guest = guestMetadata(p.metadata); return GUEST_IDENTITY.test(p.identity) && guest?.guestState === "approved" && guest.hostSid === host.sid; });
      const revoked = await Promise.allSettled(approved.map(p => service.removeParticipant(roomName, p.identity, { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000) + 1) })));
      await service.deleteRoom(roomName);
      return { state: "closed", revocationIncomplete: revoked.some(result => result.status === "rejected") };
    }
  }
  const target = participants.find(p => p.identity === input.identity && p.sid === input.sid);
  const guest = guestMetadata(target?.metadata);
  if (!target || !guest || guest.launchAddress !== roomId) throw new GuestActionError("That viewer is no longer in this live room.", 409);
  if (!hostAction && (!actor.wallet || actor.wallet.toLowerCase() !== guest.wallet)) throw new GuestActionError("Sign in as this viewer to manage the request.", 403);

  let next: GuestMetadata;
  if (input.action === "request") {
    if (!host || !host.tracks.some(track => !track.muted)) throw new GuestActionError("Wait for the creator to go live before requesting a spot.", 409);
    if (guest.guestState === "approved" || target.permission?.canPublish) throw new GuestActionError("You are already approved to join.", 409);
    next = { ...guest, guestState: "requested", hostSid: host.sid };
  } else if (input.action === "cancel" || input.action === "leave") {
    if (input.action === "cancel" && guest.guestState !== "requested") throw new GuestActionError("This request is no longer pending.", 409);
    next = { role: "viewer", wallet: guest.wallet, launchAddress: roomId, guestState: "audience" };
  } else if (input.action === "approve") {
    if (!host || !host.tracks.some(track => !track.muted) || guest.guestState !== "requested" || guest.hostSid !== host.sid)
      throw new GuestActionError("This request is no longer active for the current broadcast.", 409);
    const active = participants.filter(p => { const g = guestMetadata(p.metadata); return g?.guestState === "approved" && g.hostSid === host.sid && p.permission?.canPublish; }).length;
    if (active >= GUEST_LIMIT) throw new GuestActionError("The stage is full. Remove a guest before approving another.", 409);
    next = { ...guest, guestState: "approved" };
  } else if (input.action === "decline") {
    if (!host || guest.guestState !== "requested" || guest.hostSid !== host.sid) throw new GuestActionError("This request is no longer active.", 409);
    next = { ...guest, guestState: "declined" };
  } else if (input.action === "revoke") {
    if (!host || guest.guestState !== "approved" || guest.hostSid !== host.sid) throw new GuestActionError("This guest is no longer on this stage.", 409);
    // A strict cutoff also rejects a cached, previously publish-enabled token on LiveKit Cloud.
    await service.removeParticipant(roomName, target.identity, { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000) + 1) });
    return { state: "removed" };
  } else throw new GuestActionError("Invalid guest request.", 400);
  const permission = input.action === "approve" ? canPublish : ["cancel", "leave"].includes(input.action) ? noPublish : undefined;
  await service.updateParticipant(roomName, target.identity, { metadata: JSON.stringify(next), ...(permission ? { permission } : {}) });
  return { state: next.guestState };
}

/** A status read also retires approvals from an earlier creator connection. */
export async function revokeStaleGuests(service: GuestService, roomName: string, participants: GuestParticipant[]) {
  const hostSids = new Set(participants.filter(p => hostRole(p.metadata).role === "host").map(p => p.sid));
  const stale = participants.filter(p => {
    const guest = guestMetadata(p.metadata);
    return GUEST_IDENTITY.test(p.identity) && guest?.hostSid && !hostSids.has(guest.hostSid) && (guest.guestState === "approved" || guest.guestState === "requested");
  }).slice(0, 12);
  await Promise.all(stale.map(async participant => {
    const guest = guestMetadata(participant.metadata)!;
    if (guest.guestState === "approved") {
      await service.removeParticipant(roomName, participant.identity, { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000) + 1) });
    } else {
      const next: GuestMetadata = { role: "viewer", wallet: guest.wallet, launchAddress: guest.launchAddress, guestState: "audience" };
      await service.updateParticipant(roomName, participant.identity, { metadata: JSON.stringify(next), permission: noPublish });
    }
  }));
}
