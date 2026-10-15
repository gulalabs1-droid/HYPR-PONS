import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { POST as signIn } from "../src/app/api/community/session/route";
import { GET as readCommunity, POST as writeCommunity } from "../src/app/api/community/route";

test("community routes require a same-origin verified session and consume sign-in nonces", async () => {
  const originalFetch = globalThis.fetch;
  const saved = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, HYPR_NETWORK: process.env.HYPR_NETWORK };
  Object.assign(process.env, { SUPABASE_URL: "https://database.test", SUPABASE_SERVICE_ROLE_KEY: "test-only-role-key", HYPR_NETWORK: "testnet" });
  let nonceConsumed = false;
  const writes: Record<string, unknown>[] = [];
  const reads: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("hypr_consume_community_nonce")) { const accepted = !nonceConsumed; nonceConsumed = true; return Response.json(accepted); }
    if (String(url).endsWith("hypr_write_community")) { writes.push(JSON.parse(String(init?.body))); return Response.json(true); }
    reads.push({ url: String(url), body: JSON.parse(String(init?.body || "{}")) });
    return Response.json({ messages: [], followers: 0, following: false });
  };
  const request = (path: string, body: unknown, cookie = "", origin = "https://hypr.test") => new NextRequest(`https://hypr.test${path}`, { method: "POST", headers: { origin, cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const roomId = `0x${"1".repeat(40)}`;
  try {
    assert.equal((await writeCommunity(request("/api/community", { roomId, action: "message", body: "hello" }))).status, 401);
    assert.equal((await writeCommunity(request("/api/community", {}, "", "https://evil.test"))).status, 403);
    assert.equal((await signIn(request("/api/community/session", null))).status, 400);
    const account = privateKeyToAccount(generatePrivateKey());
    const challenge = await signIn(request("/api/community/session", { wallet: account.address }));
    assert.equal(challenge.status, 200);
    const cookie = challenge.headers.get("set-cookie")!.split(";")[0];
    const signature = await account.signMessage({ message: (await challenge.json()).message });
    const signed = await signIn(request("/api/community/session", { signature }, cookie));
    assert.equal(signed.status, 200);
    assert.match(signed.headers.get("set-cookie")!, /HttpOnly/);
    assert.match(signed.headers.get("set-cookie")!, /SameSite=strict/i);
    assert.equal((await signIn(request("/api/community/session", { signature }, cookie))).status, 401);
    const sessionCookie = signed.headers.get("set-cookie")!.split(";")[0];
    assert.equal((await writeCommunity(request("/api/community", { roomId, action: "message", body: "hello" }, sessionCookie))).status, 200);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].p_wallet_address, account.address.toLowerCase());
    assert.equal((await writeCommunity(request("/api/community", { roomId, action: "message", body: "x".repeat(281) }, sessionCookie))).status, 400);
    assert.equal((await writeCommunity(request("/api/community", null, sessionCookie))).status, 400);
    const publicState = await readCommunity(new NextRequest(`https://hypr.test/api/community?roomId=${roomId}`));
    assert.equal(publicState.status, 200);
    assert.equal((await publicState.json()).wallet, null);
    assert.equal((await writeCommunity(request("/api/community", { roomId, action: "pin" }, sessionCookie))).status, 400);
    const messageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    assert.equal((await writeCommunity(request("/api/community", { roomId, action: "pin", messageId }, sessionCookie))).status, 200);
    assert.equal(writes.at(-1)?.p_action, "pin");
    assert.equal((await readCommunity(new NextRequest(`https://hypr.test/api/community?roomId=${roomId}&before=not-a-uuid`))).status, 400);
    const older = await readCommunity(new NextRequest(`https://hypr.test/api/community?roomId=${roomId}&before=${messageId}`));
    assert.equal(older.status, 200);
    assert.ok(reads.some(read => read.url.endsWith("hypr_read_community_feed") && read.body.p_before === messageId));
    for (const limit of ["0", "49", "501", "NaN", "50.5", ""]) {
      assert.equal((await readCommunity(new NextRequest(`https://hypr.test/api/community?roomId=${roomId}&limit=${limit}`))).status, 400);
    }
    assert.equal((await readCommunity(new NextRequest(`https://hypr.test/api/community?roomId=${roomId}&limit=100`))).status, 200);
    assert.equal(reads.at(-1)?.body.p_limit, 100);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
