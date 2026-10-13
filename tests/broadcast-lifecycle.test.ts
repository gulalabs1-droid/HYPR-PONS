import assert from "node:assert/strict";
import { test } from "node:test";
import { broadcastCopy, broadcastExitNotice, connectedBroadcastPhase, CREATOR_RETURN_GRACE_MS, publicBroadcastPhase, shouldReleaseViewer } from "../src/lib/broadcast-lifecycle";

const offline = { configured: true, live: false, hostConnected: false };

test("a fresh offline room is between broadcasts, not a claimed never-started or ended broadcast", () => {
  assert.equal(publicBroadcastPhase(offline, false, false, null), "offline");
  assert.match(broadcastCopy("offline").detail, /saved chat and follows/);
});
test("only observed or confirmed media exits show a stopped/ended state", () => {
  assert.equal(publicBroadcastPhase(offline, false, true, null), "stopped");
  assert.equal(publicBroadcastPhase(offline, false, false, "creator-offline"), "stopped");
  assert.equal(publicBroadcastPhase(offline, false, true, "host-ended"), "ended");
  assert.equal(publicBroadcastPhase(offline, false, false, "viewer-left"), "offline");
  assert.equal(publicBroadcastPhase(offline, false, false, "connection-lost"), "offline");
});
test("status errors never pretend a broadcast has ended", () => {
  assert.equal(publicBroadcastPhase(null, true, true, "host-ended"), "unavailable");
  assert.equal(publicBroadcastPhase(null, false, true, null), "checking");
  assert.equal(publicBroadcastPhase({ ...offline, configured: false }, false, true, null), "unavailable");
});
test("a new live broadcast takes precedence over an earlier exit", () => {
  assert.equal(publicBroadcastPhase({ ...offline, live: true, hostConnected: true }, false, true, "host-ended"), "live");
});
test("connected media-off hosts are preparing before publication and paused after it", () => {
  assert.equal(publicBroadcastPhase({ ...offline, hostConnected: true }, false, false, null), "preparing");
  assert.equal(publicBroadcastPhase({ ...offline, hostConnected: true }, false, true, null), "paused");
  assert.equal(connectedBroadcastPhase({ connection: "connected", hostPresent: true, hasMedia: false, seenMedia: false }), "preparing");
  assert.equal(connectedBroadcastPhase({ connection: "connected", hostPresent: true, hasMedia: false, seenMedia: true }), "paused");
});
test("reconnecting players are not labeled LIVE from stale tracks or as ended", () => {
  assert.equal(connectedBroadcastPhase({ connection: "reconnecting", hostPresent: true, hasMedia: true, seenMedia: true }), "reconnecting");
  assert.equal(connectedBroadcastPhase({ connection: "connecting", hostPresent: false, hasMedia: false, seenMedia: true }), "connecting");
});
test("only connected viewers with a missing creator get the return grace timer", () => {
  assert.equal(CREATOR_RETURN_GRACE_MS, 15_000);
  assert.equal(shouldReleaseViewer("viewer", "connected", false), true);
  assert.equal(shouldReleaseViewer("viewer", "reconnecting", false), false);
  assert.equal(shouldReleaseViewer("viewer", "connecting", false), false);
  assert.equal(shouldReleaseViewer("viewer", "connected", true), false);
  assert.equal(shouldReleaseViewer("host", "connected", false), false);
  assert.equal(connectedBroadcastPhase({ connection: "connected", hostPresent: false, hasMedia: true, seenMedia: true }), "creator-disconnected");
});
test("leave notices distinguish creator ending, viewer leaving, creator disappearing and network failure", () => {
  assert.match(broadcastExitNotice("host-ended"), /tracks are stopped/);
  assert.match(broadcastExitNotice("viewer-left"), /not the community room/);
  assert.match(broadcastExitNotice("creator-offline"), /saved chat, follows/);
  assert.match(broadcastExitNotice("connection-lost"), /not a confirmed end/);
});
