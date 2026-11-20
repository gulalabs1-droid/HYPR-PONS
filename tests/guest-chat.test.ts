import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { GET as readCommunity, POST as writeCommunity } from "../src/app/api/community/route";
import { POST as touchPresence } from "../src/app/api/community/presence/route";
import { chatMessageProblem, guestNameProblem } from "../src/lib/guest-chat";

function withDatabase(handler: (name: string, body: Record<string, unknown>) => Response | Promise<Response>) {
  const originalFetch = globalThis.fetch;
  const saved = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, HYPR_NETWORK: process.env.HYPR_NETWORK };
  Object.assign(process.env, { SUPABASE_URL: "https://database.test", SUPABASE_SERVICE_ROLE_KEY: "test-only-role-key", HYPR_NETWORK: "testnet" });
  globalThis.fetch = async (url, init) => handler(String(url).split("/").pop()!, JSON.parse(String(init?.body || "{}")));
  return () => { globalThis.fetch = originalFetch; for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
}
const roomId = `0x${"1".repeat(40)}`;
const post = (body: unknown, cookie = "", origin = "https://hypr.test", ip = "203.0.113.7") => new NextRequest("https://hypr.test/api/community", { method: "POST", headers: { origin, cookie, "x-forwarded-for": ip, "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("a guest can chat with only a nickname; the signed cookie keeps their name and never their IP", async () => {
  const writes: Record<string, unknown>[] = [];
  const restore = withDatabase((name, body) => {
    if (name === "hypr_write_guest_message") { writes.push(body); return Response.json(true); }
    return Response.json({ messages: [], followers: 0, following: false });
  });
  try {
    const first = await writeCommunity(post({ roomId, action: "guest-message", body: "hi all", guestName: "Sam" }));
    assert.equal(first.status, 200);
    const cookie = first.headers.get("set-cookie")!;
    assert.match(cookie, /hypr-guest=/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=strict/i); assert.match(cookie, /Path=\/api\/community/i);
    assert.equal(writes[0].p_guest_name, "Sam");
    assert.match(String(writes[0].p_ip_hash), /^[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(writes[0]), /203\.0\.113\.7/);
    const value = cookie.split(";")[0];
    const second = await writeCommunity(post({ roomId, action: "guest-message", body: "me again" }, value));
    assert.equal(second.status, 200);
    assert.equal(writes[1].p_guest_id, writes[0].p_guest_id, "same browser keeps one guest identity");
    const read = await readCommunity(new NextRequest(`https://hypr.test/api/community?roomId=${roomId}`, { headers: { cookie: value } }));
    assert.deepEqual((await read.json()).guest, { name: "Sam" });
    // A forged or cross-site cookie is ignored.
    assert.equal((await writeCommunity(post({ roomId, action: "guest-message", body: "x" }, `${value}x`))).status, 422);
    assert.equal((await writeCommunity(post({ roomId, action: "guest-message", body: "x", guestName: "Sam" }, "", "https://evil.test"))).status, 403);
  } finally { restore(); }
});

test("guest chat refuses links, slurs and reserved names before reaching the database", async () => {
  let calls = 0;
  const restore = withDatabase(() => { calls++; return Response.json(true); });
  try {
    for (const [body, guestName] of [["visit spam.xyz now", "Sam"], ["you f4ggot", "Sam"], ["hello", "admin"], ["hello", "x"]]) {
      assert.equal((await writeCommunity(post({ roomId, action: "guest-message", body, guestName }))).status, 422, `${body} / ${guestName}`);
    }
    assert.equal(calls, 0);
  } finally { restore(); }
  assert.equal(chatMessageProblem("check https://example.com", { guest: false }), null, "signed-in members may share links");
  assert.equal(chatMessageProblem("I love raccoons and spicy food", { guest: true }), null);
  assert.equal(guestNameProblem("Night Owl"), null);
});

test("database limits come back as plain-language guest errors", async () => {
  const restore = withDatabase(name => name === "hypr_write_guest_message" ? Response.json({ message: "message rate limit" }, { status: 400 }) : Response.json(true));
  try {
    const response = await writeCommunity(post({ roomId, action: "guest-message", body: "hello", guestName: "Sam" }));
    assert.equal(response.status, 429);
    assert.match((await response.json()).error, /Slow down/);
  } finally { restore(); }
  const off = withDatabase(name => name === "hypr_write_guest_message" ? Response.json({ message: "guest chat off" }, { status: 400 }) : Response.json(true));
  try {
    const response = await writeCommunity(post({ roomId, action: "guest-message", body: "hello", guestName: "Sam" }));
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /turned off guest chat/);
  } finally { off(); }
});

test("chat settings require a signed-in session; presence hashes the tab ID", async () => {
  const keys: string[] = [];
  const restore = withDatabase((name, body) => { if (name === "hypr_touch_presence") { keys.push(String(body.p_viewer_key)); return Response.json(3); } return Response.json(true); });
  try {
    assert.equal((await writeCommunity(post({ roomId, action: "settings", guestsAllowed: false, slowMode: 15 }))).status, 401);
    const viewer = "a".repeat(32);
    const response = await touchPresence(new NextRequest("https://hypr.test/api/community/presence", { method: "POST", headers: { origin: "https://hypr.test", "Content-Type": "application/json" }, body: JSON.stringify({ roomId, viewer }) }));
    assert.deepEqual(await response.json(), { here: 3 });
    assert.match(keys[0], /^[a-f0-9]{64}$/); assert.notEqual(keys[0], viewer);
    assert.equal((await touchPresence(new NextRequest("https://hypr.test/api/community/presence", { method: "POST", headers: { origin: "https://hypr.test", "Content-Type": "application/json" }, body: JSON.stringify({ roomId, viewer: "not-hex" }) }))).status, 400);
  } finally { restore(); }
});
