import assert from "node:assert/strict";
import { test } from "node:test";
import { statusFromParticipants } from "../src/lib/livekit";
import { roomBadge } from "../src/lib/room-display";
import type { Launch } from "../src/lib/types";

const host = { metadata: JSON.stringify({ role: "host" }) };
test("a connected host without published unmuted media is not live", () => {
  const state = statusFromParticipants([host]);
  assert.equal(state.live, false);
  assert.equal(state.hostConnected, true);
  assert.equal(statusFromParticipants([{ ...host, tracks: [{ source: 1, muted: true }, { source: 2, muted: true }] }]).live, false);
});
test("only actual host media makes a broadcast live; viewer counts exclude the host", () => {
  for (const source of [1, 2, 3, 4]) {
    const state = statusFromParticipants([{ ...host, tracks: [{ source, muted: false }] }, { metadata: '{"role":"viewer"}', tracks: [{ source: 1, muted: false }] }]);
    assert.equal(state.live, true);
    assert.equal(state.viewerCount, 1);
  }
  assert.equal(statusFromParticipants([{ metadata: '{"role":"viewer"}', tracks: [{ source: 1, muted: false }] }]).live, false);
  assert.equal(statusFromParticipants([{ metadata: "invalid", tracks: [{ source: 1, muted: false }] }]).live, false);
});
test("active trading curves never imply a LIVE broadcast", () => {
  const token = { origin: "hypr", curvePhase: "Live" } as Launch;
  assert.equal(roomBadge(token).includes("LIVE"), false);
  assert.equal(roomBadge({ ...token, broadcastStatus: "offline" }), "Offline · Native");
  assert.equal(roomBadge({ ...token, broadcastStatus: "live" }), "LIVE · Native");
});
