import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { notifyRoom, validSubscription } from "../src/lib/push-server";
import { GET as pushConfigRoute, POST as pushRoute } from "../src/app/api/push/route";
import { GET as reminders } from "../src/app/api/cron/show-reminders/route";
import { countdownLabel } from "../src/components/show-countdown";

const keys = { p256dh: "B".repeat(87), auth: "a".repeat(22) };
const roomId = `0x${"1".repeat(40)}`;
function env(values: Record<string, string | undefined>, handler: (name: string, body: Record<string, unknown>) => Response) {
  const saved = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  for (const [key, value] of Object.entries(values)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  globalThis.fetch = async (url, init) => handler(String(url).split("/").pop()!, JSON.parse(String(init?.body || "{}")));
  return () => { globalThis.fetch = originalFetch; for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
}
const configured = { SUPABASE_URL: "https://database.test", SUPABASE_SERVICE_ROLE_KEY: "test-only-role-key", HYPR_NETWORK: "testnet", VAPID_PUBLIC_KEY: "public", VAPID_PRIVATE_KEY: "private", CRON_SECRET: "a-long-test-only-secret" };

test("only real browser push services are accepted as subscription endpoints", () => {
  for (const endpoint of ["https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/abc", "https://web.push.apple.com/abc", "https://wns2-par02p.notify.windows.com/w/?token=abc"]) assert.equal(validSubscription({ endpoint, keys }), true, endpoint);
  for (const endpoint of ["http://fcm.googleapis.com/x", "https://169.254.169.254/latest", "https://fcm.googleapis.com.evil.test/x", "https://localhost/x", "https://fcm.googleapis.com:8443/x", "https://evil.test/push.apple.com"]) assert.equal(validSubscription({ endpoint, keys }), false, endpoint);
  assert.equal(validSubscription({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "short", auth: keys.auth } }), false);
});

test("a room event reaches each claimed browser once and forgets endpoints that are gone", async () => {
  const failed: Record<string, unknown>[] = [];
  const restore = env(configured, (name, body) => {
    if (name === "hypr_push_claim") return Response.json([{ endpoint: "https://fcm.googleapis.com/a", ...keys }, { endpoint: "https://fcm.googleapis.com/gone", ...keys }]);
    if (name === "hypr_push_failed") { failed.push(body); return Response.json(true); }
    return Response.json(true);
  });
  const sent: string[] = [];
  try {
    const count = await notifyRoom(roomId, "live", "PA_123", { title: "Maya is live", body: "Tap to watch", url: `/room/${roomId}`, tag: `live-${roomId}` }, (async (subscription: { endpoint: string }, payload: string) => {
      if (subscription.endpoint.endsWith("gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      sent.push(payload); return {} as never;
    }) as never);
    assert.equal(count, 1);
    assert.equal(JSON.parse(sent[0]).title, "Maya is live");
    assert.deepEqual(failed, [{ p_endpoint: "https://fcm.googleapis.com/gone", p_gone: true }]);
  } finally { restore(); }
});

test("push subscribe is same-origin, validated, and off until keys are configured", async () => {
  const request = (body: unknown, origin = "https://hypr.test") => new NextRequest("https://hypr.test/api/push", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const off = env({ ...configured, VAPID_PUBLIC_KEY: undefined }, () => Response.json(true));
  try {
    assert.deepEqual(await (await pushConfigRoute()).json(), { enabled: false, publicKey: null });
    assert.equal((await pushRoute(request({ roomId, follow: true, subscription: { endpoint: "https://fcm.googleapis.com/a", keys } }))).status, 503);
  } finally { off(); }
  const writes: Record<string, unknown>[] = [];
  const on = env(configured, (name, body) => { if (name === "hypr_push_follow") writes.push(body); return Response.json(true); });
  try {
    assert.equal((await pushRoute(request({ roomId, follow: true, subscription: { endpoint: "https://fcm.googleapis.com/a", keys } }, "https://evil.test"))).status, 403);
    assert.equal((await pushRoute(request({ roomId, follow: true, subscription: { endpoint: "https://evil.test/a", keys } }))).status, 400);
    assert.equal((await pushRoute(request({ roomId, follow: true, subscription: { endpoint: "https://fcm.googleapis.com/a", keys } }))).status, 200);
    assert.equal(writes[0].p_follow, true);
  } finally { on(); }
});

test("show reminders require the cron secret and announce each claimed show", async () => {
  const claims: string[] = [];
  const restore = env(configured, (name, body) => {
    if (name === "hypr_claim_show_reminders") return Response.json([{ showId: "s1", title: "Friday AMA", roomId, name: "Maya" }]);
    if (name === "hypr_push_claim") { claims.push(String(body.p_ref)); return Response.json([]); }
    return Response.json(true);
  });
  try {
    assert.equal((await reminders(new Request("https://hypr.test/api/cron/show-reminders"))).status, 401);
    assert.equal((await reminders(new Request("https://hypr.test/api/cron/show-reminders", { headers: { authorization: "Bearer wrong-secret-value!!" } }))).status, 401);
    const response = await reminders(new Request("https://hypr.test/api/cron/show-reminders", { headers: { authorization: "Bearer a-long-test-only-secret" } }));
    assert.deepEqual(await response.json(), { shows: 1, sent: 0 });
    assert.deepEqual(claims, ["s1"]);
  } finally { restore(); }
});

test("countdowns read naturally at every distance", () => {
  const start = Date.parse("2026-11-21T20:00:00Z");
  assert.equal(countdownLabel(new Date(start).toISOString(), start - (2 * 86400 + 4 * 3600) * 1000), "Starts in 2d 4h");
  assert.equal(countdownLabel(new Date(start).toISOString(), start - (3 * 3600 + 12 * 60) * 1000), "Starts in 3h 12m");
  assert.equal(countdownLabel(new Date(start).toISOString(), start - (12 * 60 + 5) * 1000), "Starts in 12:05");
  assert.equal(countdownLabel(new Date(start).toISOString(), start + 1000), "Starting now");
});
