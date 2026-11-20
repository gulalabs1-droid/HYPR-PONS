import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { POST as pollRoute } from "../src/app/api/community/poll/route";
import { voterKey } from "../src/lib/guest-chat";

const roomId = `0x${"1".repeat(40)}`;
function database(handler: (name: string, body: Record<string, unknown>) => Response) {
  const originalFetch = globalThis.fetch;
  const saved = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
  Object.assign(process.env, { SUPABASE_URL: "https://database.test", SUPABASE_SERVICE_ROLE_KEY: "test-only-role-key" });
  globalThis.fetch = async (url, init) => handler(String(url).split("/").pop()!, JSON.parse(String(init?.body || "{}")));
  return () => { globalThis.fetch = originalFetch; for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
}
const post = (body: unknown, origin = "https://hypr.test") => new NextRequest("https://hypr.test/api/community/poll", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("anyone can vote once per tab without a wallet; only signed-in creators can run polls", async () => {
  const votes: Record<string, unknown>[] = [];
  const restore = database((name, body) => { if (name === "hypr_vote_poll") votes.push(body); return Response.json(true); });
  try {
    const viewer = "b".repeat(32), pollId = "11111111-1111-4111-8111-111111111111";
    assert.equal((await pollRoute(post({ roomId, action: "vote", pollId, option: 1, viewer }))).status, 200);
    assert.match(String(votes[0].p_voter_key), /^[a-f0-9]{64}$/);
    assert.equal(votes[0].p_voter_key, voterKey(roomId, { viewer }));
    assert.equal((await pollRoute(post({ roomId, action: "vote", pollId, option: 1, viewer }, "https://evil.test"))).status, 403);
    assert.equal((await pollRoute(post({ roomId, action: "vote", pollId: "nope", option: 1, viewer }))).status, 400);
    assert.equal((await pollRoute(post({ roomId, action: "open", question: "Next topic?", options: ["A", "B"] }))).status, 401);
  } finally { restore(); }
});

test("voter keys separate wallets, guests and tabs, and differ per room", () => {
  const restore = database(() => Response.json(true));
  try {
  const wallet = voterKey(roomId, { wallet: `0x${"a".repeat(40)}`, viewer: "c".repeat(32) });
  assert.equal(wallet, voterKey(roomId, { wallet: `0x${"A".repeat(40)}` }), "a signed-in person votes once across tabs");
  assert.notEqual(wallet, voterKey(`0x${"2".repeat(40)}`, { wallet: `0x${"a".repeat(40)}` }));
  assert.equal(voterKey(roomId, { viewer: "not-a-tab-id" }), null);
  } finally { restore(); }
});
