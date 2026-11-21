import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { GET as pulseRoute } from "../src/app/api/community/pulse/route";
import { normalizePulse, pulseIsEmpty, returnRate } from "../src/lib/pulse";

const roomId = `0x${"2".repeat(40)}`;
const configured = { SUPABASE_URL: "https://database.test", SUPABASE_SERVICE_ROLE_KEY: "test-only-role-key", HYPR_NETWORK: "testnet" };
function env(values: Record<string, string | undefined>, handler: (name: string, body: Record<string, unknown>) => Response) {
  const saved = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  for (const [key, value] of Object.entries(values)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  globalThis.fetch = async (url, init) => handler(String(url).split("/").pop()!, JSON.parse(String(init?.body || "{}")));
  return () => { globalThis.fetch = originalFetch; for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
}
const get = (query: string) => pulseRoute(new NextRequest(`https://hypr.test/api/community/pulse?${query}`));

test("pulse values are sanitized: bigint strings count, junk and negatives become zero", () => {
  const pulse = normalizePulse({ followers: "12", newFollowers30d: 3, chatters30d: -4, regulars30d: "x", shows30d: 2.7, lastShowAt: "not a date", checkedAt: "2026-11-20T10:00:00Z" })!;
  assert.deepEqual(pulse, { followers: 12, newFollowers30d: 3, chatters30d: 0, regulars30d: 0, shows30d: 2, lastShowAt: null, checkedAt: "2026-11-20T10:00:00Z" });
  assert.equal(normalizePulse(null), null);
  assert.equal(normalizePulse("12"), null);
});

test("return rate needs enough chatters to mean something", () => {
  const base = normalizePulse({})!;
  assert.equal(pulseIsEmpty(base), true);
  assert.equal(returnRate({ ...base, chatters30d: 4, regulars30d: 4 }), null);
  assert.equal(returnRate({ ...base, chatters30d: 8, regulars30d: 2 }), 25);
});

test("the pulse route asks only for this room's aggregates and lets the CDN cache them", async () => {
  const calls: Array<{ name: string; body: Record<string, unknown> }> = [];
  const restore = env(configured, (name, body) => { calls.push({ name, body }); return Response.json({ followers: 5, chatters30d: 9, regulars30d: 3, shows30d: 2, lastShowAt: "2026-11-18T20:00:00Z" }); });
  try {
    assert.equal((await get("roomId=nope")).status, 400);
    const response = await get(`roomId=${roomId}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") || "", /s-maxage=60/);
    const { pulse } = await response.json();
    assert.equal(pulse.followers, 5); assert.equal(pulse.regulars30d, 3);
    assert.deepEqual(calls, [{ name: "hypr_room_pulse", body: { p_chain_id: 46630, p_token_address: roomId } }]);
  } finally { restore(); }
});

test("a missing migration or database error hides Pulse instead of showing fake zeros", async () => {
  const restore = env(configured, () => new Response("function not found", { status: 404 }));
  try {
    const response = await get(`roomId=${roomId}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { pulse: null });
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally { restore(); }
  const unconfigured = env({ SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined }, () => Response.json(null));
  try { assert.deepEqual(await (await get(`roomId=${roomId}`)).json(), { pulse: null }); } finally { unconfigured(); }
});

test("Pulse never reads coin price, trades or holdings", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0016_hypr_room_pulse.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  for (const forbidden of [/hypr_trades/i, /price/i, /volume/i, /balance/i, /reserve/i]) assert.doesNotMatch(sql, forbidden);
  assert.match(sql, /deleted_at is null/);
  assert.match(sql, /count\(distinct created_at::date\) >= 2/);
  assert.match(sql, /revoke all on function public\.hypr_room_pulse/);
});
