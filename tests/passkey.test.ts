import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { POST as passkey } from "../src/app/api/community/passkey/route";
import { POST as createRoom } from "../src/app/api/community/rooms/route";
import { GET as session } from "../src/app/api/community/session/route";
import { COMMUNITY_SESSION_COOKIE, encodeAuthorization } from "../src/lib/community-auth";

function configured() {
  const saved = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, HYPR_NETWORK: process.env.HYPR_NETWORK };
  Object.assign(process.env, { SUPABASE_URL: "https://database.test", SUPABASE_SERVICE_ROLE_KEY: "test-only-role-key", HYPR_NETWORK: "testnet" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(null);
  return () => { globalThis.fetch = originalFetch; for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
}
const post = (body: unknown, cookie = "", origin = "https://hypr.test") => new NextRequest("https://hypr.test/api/community/passkey", { method: "POST", headers: { origin, cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const memberCookie = () => `${COMMUNITY_SESSION_COOKIE}=${encodeAuthorization({ wallet: `0x${"7".repeat(40)}`, chainId: 46630, origin: "https://hypr.test", nonce: crypto.randomUUID(), expiresAt: Date.now() + 60_000, kind: "session", account: "passkey", name: "Sam" })}`;

test("passkey sign-up issues a sealed, short-lived challenge bound to this site and nickname", async () => {
  const restore = configured();
  try {
    assert.equal((await passkey(post({ action: "register-options", name: "admin" }))).status, 422);
    assert.equal((await passkey(post({ action: "register-options", name: "Sam" }, "", "https://evil.test"))).status, 403);
    const response = await passkey(post({ action: "register-options", name: "Sam" }));
    assert.equal(response.status, 200);
    const { options } = await response.json();
    assert.equal(options.rp.id, "hypr.test"); assert.equal(options.user.name, "Sam"); assert.equal(options.authenticatorSelection.residentKey, "required");
    const cookie = response.headers.get("set-cookie")!;
    assert.match(cookie, /hypr-passkey-challenge=/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Path=\/api\/community/i);
    // Without that cookie, or with a tampered one, nothing is registered.
    assert.equal((await passkey(post({ action: "register", response: {} }))).status, 401);
    assert.equal((await passkey(post({ action: "register", response: {} }, `${cookie.split(";")[0]}x`))).status, 401);
    assert.equal((await passkey(post({ action: "login", response: { id: "abc" } }))).status, 401);
  } finally { restore(); }
});

test("passkey members can chat and follow but can't open rooms or broadcast", async () => {
  const restore = configured();
  try {
    const state = await (await session(new NextRequest("https://hypr.test/api/community/session", { headers: { cookie: memberCookie() } }))).json();
    assert.deepEqual(state, { wallet: `0x${"7".repeat(40)}`, canStartLive: false, kind: "passkey", name: "Sam" });
    const room = await createRoom(new NextRequest("https://hypr.test/api/community/rooms", { method: "POST", headers: { origin: "https://hypr.test", cookie: memberCookie(), "Content-Type": "application/json" }, body: JSON.stringify({ name: "Sam's Room" }) }));
    assert.equal(room.status, 403);
  } finally { restore(); }
});
