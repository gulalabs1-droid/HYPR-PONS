import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { coinlessRoomLaunch, readCoinlessRooms } from "../src/lib/supabase/coinless-rooms";
import { POST as createRoom } from "../src/app/api/community/rooms/route";

const creator = `0x${"c".repeat(40)}`;
const row = { address: `0x${"a".repeat(40)}`, name: "Friday Night Hoops", metadata: { kind: "room", creator }, created_at: "2026-11-20T10:00:00Z" };

test("coinless rooms become HYPR rooms with the creator as host and no coin", () => {
  const room = coinlessRoomLaunch(row)!;
  assert.equal(room.coinless, true); assert.equal(room.origin, "hypr"); assert.equal(room.deployer, creator); assert.equal(room.name, "Friday Night Hoops");
  assert.equal(coinlessRoomLaunch({ ...row, metadata: { kind: "token", creator } }), null, "only rows marked as rooms");
  assert.equal(coinlessRoomLaunch({ ...row, metadata: { kind: "room", creator: "nope" } }), null);
});

test("coinless rooms are read only from the database query for rooms", async () => {
  let url = "";
  const rooms = await readCoinlessRooms(46630, { url: "https://database.test", serviceRoleKey: "key" } as never, (async (target: string) => { url = target; return Response.json([row, { bad: true }]); }) as never);
  assert.equal(rooms.length, 1);
  assert.match(decodeURIComponent(url), /metadata->>kind=eq\.room/);
  assert.match(url, /chain_id=eq\.46630/);
});

test("opening a room needs a signed-in session and a presentable name", async () => {
  const request = (body: unknown, origin = "https://hypr.test") => new NextRequest("https://hypr.test/api/community/rooms", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await createRoom(request({ name: "Friday Night Hoops" }, "https://evil.test"))).status, 403);
  assert.equal((await createRoom(request({ name: "Friday Night Hoops" }))).status, 401);
});
