import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { TokenVerifier, TrackSource } from "livekit-server-sdk";
import { createLiveKitToken } from "../src/lib/livekit";
import { createHostCapability, decodeHostCapability, encodeHostCapability, liveHostCookieName } from "../src/lib/live-host-auth";
import { guestMetadata, isApprovedGuest } from "../src/lib/live-guests";
import { GuestActionError, performGuestAction, revokeStaleGuests, type GuestInput, type GuestParticipant, type GuestService } from "../src/lib/live-guests-server";

const roomId = `0x${"1".repeat(40)}`, hostWallet = `0x${"2".repeat(40)}`, guestWallet = `0x${"3".repeat(40)}`;
const origin = "https://hypr.example", room = `hypr-${roomId}`, hostSid = "PA_host", guestSid = "PA_guest";
const hostCap = { roomId, wallet: hostWallet, origin, controlId: randomUUID(), expiresAt: Date.now() + 60_000 };
function viewer(state = "audience", epoch?: string): GuestParticipant {
  return { identity:`guest-${randomUUID()}`, sid:guestSid, tracks:[], permission:{canPublish:state === "approved"}, metadata:JSON.stringify({ role:"viewer", wallet:guestWallet, launchAddress:roomId, guestState:state, ...(epoch ? { hostSid:epoch } : {}) }) };
}
function creator(): GuestParticipant {
  return { identity:`host-${hostWallet}`, sid:hostSid, tracks:[{ muted:false }], metadata:JSON.stringify({ role:"host", launchAddress:roomId, controlId:hostCap.controlId }) };
}
function fake(...parts: GuestParticipant[]) {
  const updates: { identity:string; options:Parameters<GuestService["updateParticipant"]>[2] }[] = [];
  const deleted: string[] = [];
  const removed: { identity:string; revokeTokenTs:bigint }[] = [];
  const service: GuestService = {
    async listParticipants() { return parts; },
    async updateParticipant(_room, identity, options) {
      updates.push({ identity, options });
      const target = parts.find(item => item.identity === identity)!;
      target.metadata = options.metadata;
      if (options.permission) target.permission = { canPublish:options.permission.canPublish };
    },
    async removeParticipant(_room, identity, options) { removed.push({ identity, ...options }); const index = parts.findIndex(item => item.identity === identity); if (index >= 0) parts.splice(index,1); },
    async deleteRoom(name) { deleted.push(name); },
  };
  return { service, updates, deleted, removed, parts };
}
const input = (action: GuestInput["action"], guest?: GuestParticipant): GuestInput => ({ roomId, action, ...(guest ? { identity:guest.identity, sid:guest.sid } : {}), hostSid });

test("a signed-in viewer requests, creator approves, then revokes camera/mic without granting screen sharing", async () => {
  const guest = viewer(), db = fake(creator(), guest);
  await performGuestAction(db.service, room, input("request", guest), { wallet:guestWallet });
  assert.equal(guestMetadata(guest.metadata)?.guestState, "requested");
  assert.equal(db.updates[0].options.permission, undefined, "request alone never grants publishing");
  await performGuestAction(db.service, room, input("approve", guest), { host:hostCap });
  assert.deepEqual(db.updates[1].options.permission, { canPublish:true, canSubscribe:true, canPublishData:true, canPublishSources:[TrackSource.CAMERA,TrackSource.MICROPHONE] });
  assert.equal(isApprovedGuest(guest.metadata, hostSid), true);
  await assert.rejects(performGuestAction(db.service, room, input("cancel", guest), { wallet:guestWallet }), /no longer pending/);
  await performGuestAction(db.service, room, input("revoke", guest), { host:hostCap });
  assert.equal(db.removed[0].identity, guest.identity);
  assert.ok(db.removed[0].revokeTokenTs >= BigInt(Math.floor(Date.now()/1000)));
});

test("only the participant's signed-in wallet can request or leave; the creator must approve the exact current session", async () => {
  const guest = viewer(), db = fake(creator(), guest);
  await assert.rejects(performGuestAction(db.service, room, input("request", guest), { wallet:hostWallet }), /Sign in as this viewer/);
  await assert.rejects(performGuestAction(db.service, room, { ...input("request", guest), sid:"PA_different" }, { wallet:guestWallet }), /no longer/);
  await assert.rejects(performGuestAction(db.service, room, input("approve", guest), { host:hostCap }), /no longer active/);
  await performGuestAction(db.service, room, input("request", guest), { wallet:guestWallet });
  for (const incorrect of [undefined, { ...hostCap, controlId:randomUUID() }, { ...hostCap, wallet:guestWallet }, { ...hostCap, roomId:`0x${"4".repeat(40)}` }]) {
    await assert.rejects(performGuestAction(db.service, room, input("approve", guest), { host:incorrect }), /Creator authorization/);
  }
  await assert.rejects(performGuestAction(db.service, room, { ...input("approve", guest), hostSid:"PA_old" }, { host:hostCap }), /broadcast changed/);
  assert.equal(db.updates.length, 1);
  await performGuestAction(db.service, room, input("cancel", guest), { wallet:guestWallet });
  assert.equal(guestMetadata(guest.metadata)?.guestState, "audience");
});

test("old broadcast approvals are revoked; offline creators cannot receive new requests", async () => {
  const stale = viewer("approved", "PA_previous"), request = viewer(); request.sid = "PA_new";
  const db = fake(creator(), stale, request);
  await revokeStaleGuests(db.service, room, db.parts);
  assert.equal(db.removed[0].identity, stale.identity);
  db.parts[0].tracks = [{ muted:true }];
  await assert.rejects(performGuestAction(db.service, room, input("request", request), { wallet:guestWallet }), /creator to go live/);
  assert.equal(isApprovedGuest(JSON.stringify({ role:"viewer",wallet:guestWallet,launchAddress:roomId,guestState:"approved",hostSid:"PA_previous" }), hostSid), false);
});

test("creator can decline, enforce the visible stage limit and close only the matching live session", async () => {
  const guest = viewer(), db = fake(creator(), guest);
  await performGuestAction(db.service, room, input("request", guest), { wallet:guestWallet });
  await performGuestAction(db.service, room, input("decline", guest), { host:hostCap });
  assert.equal(guestMetadata(guest.metadata)?.guestState, "declined");
  await performGuestAction(db.service, room, input("request", guest), { wallet:guestWallet });
  for (let i=0;i<4;i++) { const extra = viewer("approved", hostSid); extra.sid = `PA_extra${i}`; db.parts.push(extra); }
  await assert.rejects(performGuestAction(db.service, room, input("approve", guest), { host:hostCap }), /stage is full/);
  await assert.rejects(performGuestAction(db.service, room, { ...input("close"), hostSid:"PA_old" }, { host:hostCap }), /broadcast changed/);
  assert.deepEqual(db.deleted, []);
  await performGuestAction(db.service, room, input("close"), { host:hostCap });
  assert.deepEqual(db.deleted, [room]);
});

test("guest token starts watch-only and its metadata cannot be edited by the viewer", async () => {
  const old = { LIVEKIT_URL:process.env.LIVEKIT_URL, LIVEKIT_API_KEY:process.env.LIVEKIT_API_KEY, LIVEKIT_API_SECRET:process.env.LIVEKIT_API_SECRET };
  Object.assign(process.env, { LIVEKIT_URL:"wss://test.livekit.cloud", LIVEKIT_API_KEY:"test-key", LIVEKIT_API_SECRET:"test-secret-with-enough-entropy" });
  try {
    const jwt = await createLiveKitToken({ roomName:room, identity:`guest-${randomUUID()}`, name:"Viewer", role:"viewer", launchAddress:roomId, wallet:guestWallet });
    const claims = await new TokenVerifier("test-key", "test-secret-with-enough-entropy").verify(jwt);
    assert.equal(claims.video?.canPublish, false); assert.equal(claims.video?.canSubscribe, true);
    assert.equal(claims.video?.canUpdateOwnMetadata, false);
    assert.equal(guestMetadata(claims.metadata)?.guestState, "audience");
  } finally { for (const [key,value] of Object.entries(old)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

test("host control cookie is signed, origin-bound, room-scoped and expires", () => {
  const old = process.env.LIVEKIT_API_SECRET; process.env.LIVEKIT_API_SECRET = "test-secret-with-enough-entropy";
  try {
    const cap = createHostCapability(roomId, hostWallet, origin), signed = encodeHostCapability(cap);
    assert.deepEqual(decodeHostCapability(signed, origin), cap);
    assert.equal(decodeHostCapability(signed, "https://evil.example"), null);
    assert.equal(decodeHostCapability(signed, origin, cap.expiresAt), null);
    assert.equal(decodeHostCapability(`${signed.slice(0,-3)}bad`, origin), null);
    assert.notEqual(liveHostCookieName(roomId), liveHostCookieName(`0x${"9".repeat(40)}`));
    assert.ok(new GuestActionError("x", 403) instanceof Error);
  } finally { if (old === undefined) delete process.env.LIVEKIT_API_SECRET; else process.env.LIVEKIT_API_SECRET = old; }
});
