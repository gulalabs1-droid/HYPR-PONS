import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { broadcastLabel, discoveryRooms, selectDiscoveryRooms } from "../src/lib/discovery";
import type { Launch } from "../src/lib/types";
import type { GrowthRoom } from "../src/lib/growth";
import { DiscoveryRoomCard } from "../src/components/discovery-room-card";
import { RoomFaq } from "../src/components/room-faq";

// Explicit test fixtures only: never supplied to the app directory or public APIs.
function token(id: number, overrides: Partial<Launch> = {}): Launch {
  return { address: `0x${String(id).padStart(40, "0")}`, pool: `0x${"a".repeat(40)}`, deployer: `0x${"b".repeat(40)}`, name: `Room ${id}`, symbol: "TEST", logo: "H", description: "Test fixture", priceUsd: 0, marketCapUsd: 0, change24h: 0, holders: 0, activeNow: 0, followers: 0, hype: 0, rank: id, launchedAt: "", trades24h: 0, officialLinks: [], origin: "hypr", dataStatus: "partial", broadcastStatus: "offline", ...overrides };
}
function profile(launch: Launch, overrides: Partial<GrowthRoom> = {}): GrowthRoom {
  return { address: launch.address.toUpperCase(), creator: launch.deployer, name: launch.name, displayName: "Maya Makes", bio: "Designing tiny worlds", avatar: "★", followers: 0, following: false, owned: false, moment: null, show: { id: "show", title: "Sketchbook Sundays", description: "Draw together", startsAt: "2030-01-01T18:00:00Z", revision: 1, status: "scheduled" }, ...overrides };
}
test("discovery excludes demo records and deduplicates case-insensitively", () => {
  const real = token(1); const rooms = discoveryRooms([real, { ...real }, token(2, { dataStatus: "demo" })], []);
  assert.equal(rooms.length, 1); assert.equal(rooms[0].token.address, real.address);
});
test("creator and show search uses real profiles, independent of coin names", () => {
  const real = token(1); const rooms = discoveryRooms([real], [profile(real)], Date.parse("2029-01-01"));
  for (const query of ["maya", "tiny worlds", "sketchbook", "TEST", real.address.toUpperCase()]) assert.equal(selectDiscoveryRooms(rooms, query, "all", [], "live").length, 1);
  assert.equal(selectDiscoveryRooms(rooms, "unrelated", "all", [], "live").length, 0);
});
test("a schedule never becomes a live broadcast, and expired/canceled/ended shows are not upcoming", () => {
  const real = token(1); const creator = profile(real); const now = Date.parse("2029-01-01");
  assert.equal(discoveryRooms([real], [creator], now)[0].upcoming, true);
  for (const status of ["ended", "canceled"] as const) assert.equal(discoveryRooms([real], [{ ...creator, show: { ...creator.show!, status } }], now)[0].upcoming, false);
  assert.equal(discoveryRooms([real], [creator], Date.parse("2031-01-01"))[0].upcoming, false);
  assert.equal(selectDiscoveryRooms(discoveryRooms([real], [creator], now), "", "live", [], "live").length, 0);
});
test("live filtering requires confirmed media, not streamLive or a trading curve named Live", () => {
  const rooms = discoveryRooms([token(1, { broadcastStatus: "unavailable", streamLive: true, curvePhase: "Live" }), token(2, { broadcastStatus: "checking" }), token(3, { broadcastStatus: "live" })], []);
  assert.deepEqual(selectDiscoveryRooms(rooms, "", "live", [], "live").map(room => room.token.rank), [3]);
  assert.equal(broadcastLabel(rooms[0].token), "Live status unavailable");
});
test("saved filter is case-insensitive, never invents follows, and combines with search", () => {
  const rooms = discoveryRooms([token(1), token(2)], []);
  assert.equal(selectDiscoveryRooms(rooms, "", "saved", [], "live").length, 0);
  assert.equal(selectDiscoveryRooms(rooms, "Room 1", "saved", [rooms[0].token.address.toUpperCase()], "live").length, 1);
  assert.equal(selectDiscoveryRooms(rooms, "Room 2", "saved", [rooms[0].token.address], "live").length, 0);
});
test("live-first and index-order sorting remain distinct and deterministic", () => {
  const rooms = discoveryRooms([token(2, { broadcastStatus: "live" }), token(1)], []);
  assert.deepEqual(selectDiscoveryRooms(rooms, "", "all", [], "live").map(room => room.token.rank), [2, 1]);
  assert.deepEqual(selectDiscoveryRooms(rooms, "", "all", [], "new").map(room => room.token.rank), [1, 2]);
});
test("room cards are navigation and artwork, not fake footage, engagement, or token promotion", () => {
  const room = discoveryRooms([token(1)], [])[0];
  const html = renderToStaticMarkup(createElement(DiscoveryRoomCard, { room }));
  assert.match(html, /Room artwork · not a video preview/);
  assert.match(html, new RegExp(`/room/${room.token.address}`));
  assert.match(html, /Save on this device/);
  assert.doesNotMatch(html, /connected viewers|Market cap|<video|<a[^>]*>[^]*<button[^>]*[^]*<\/a>/);
});
test("viewer count is displayed only when known and confirmed live, including a genuine zero", () => {
  for (const [status, count, expected] of [["offline", 99, false], ["live", undefined, false], ["live", 0, true]] as const) {
    const room = discoveryRooms([token(1, { broadcastStatus: status, viewerCount: count })], [])[0];
    const html = renderToStaticMarkup(createElement(DiscoveryRoomCard, { room }));
    assert.equal(html.includes("connected viewers"), expected);
  }
});
test("FAQ explicitly explains clipping is unavailable, wallet-free watching, and persistent rooms", () => {
  const html = renderToStaticMarkup(createElement(RoomFaq));
  assert.match(html, /Not yet/); assert.match(html, /not video/); assert.match(html, /does not automatically record/);
  assert.match(html, /Buying a coin is optional/); assert.match(html, /permanent room link stays available/);
  assert.equal((html.match(/<details /g) || []).length, 6);
});
